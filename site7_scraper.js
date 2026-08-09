const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');

// Supabase初期化
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = (supabaseUrl && supabaseKey) ? createClient(supabaseUrl, supabaseKey) : null;

// ランダム遅延関数（ミリ秒）
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const getRandomDelay = (min = 1200, max = 3500) => Math.floor(Math.random() * (max - min + 1)) + min;

// ブラウザ完全模倣用ヘッダー設定
const DEFAULT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
  'Referer': 'https://m.daidata.com/',
  'Sec-Ch-Ua': '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
  'Sec-Ch-Ua-Mobile': '?0',
  'Sec-Ch-Ua-Platform': '"Windows"',
  'Sec-Fetch-Dest': 'empty',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Site': 'same-origin',
};

// ガード回避機能付きデータ取得関数
async function fetchWithGuardBypass(url, options = {}, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      // 1. 人間らしいアクセス間隔を再現（ランダム待機）
      await delay(getRandomDelay());

      const response = await axios({
        url,
        ...options,
        headers: {
          ...DEFAULT_HEADERS,
          ...options.headers,
        },
        timeout: 15000,
      });

      return response.data;
    } catch (error) {
      const status = error.response ? error.response.status : null;
      console.warn(`[試行 ${i + 1}/${retries}] 通信エラー: ${status || error.message}`);

      // 2. ブロック検知（403/429）時は指数バックオフ（3秒、6秒...と待機時間を倍増）
      if (status === 403 || status === 429 || i < retries - 1) {
        const waitTime = (i + 1) * 3000;
        console.log(`ブロック回避のため ${waitTime / 1000} 秒待機して再試行します...`);
        await delay(waitTime);
      } else {
        throw error;
      }
    }
  }
  throw new Error('最大再試行回数に達しました。');
}

async function runSite7Scraper() {
  console.log('=== site7 データ収集開始 ===');

  try {
    // 収集対象のデータエンドポイントURL
    const targetUrl = 'https://m.daidata.com/search/hall/detail'; // 対象API/URLへ変更してください

    const requestHeaders = {};
    // Cookie情報が設定されていればセット
    if (process.env.SITE7_COOKIE) {
      requestHeaders['Cookie'] = process.env.SITE7_COOKIE;
    }

    // データ取得実行
    const data = await fetchWithGuardBypass(targetUrl, {
      method: 'GET',
      headers: requestHeaders,
    });

    console.log('データ取得成功:', data ? 'データあり' : '空データ');

    // TODO: 取得データの加工およびSupabaseへの保存処理（DBテーブル設計に合わせて実装）

  } catch (error) {
    console.error('site7 収集処理エラー:', error.message);
    // システム全体を落とさないようエラーをキャッチ
  }

  console.log('=== site7 データ収集終了 ===');
}

runSite7Scraper();