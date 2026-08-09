const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');

// Supabase初期化
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = (supabaseUrl && supabaseKey) ? createClient(supabaseUrl, supabaseKey) : null;

// 遅延処理＆ヘッダー（ガード回避用）
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const getRandomDelay = (min = 1500, max = 3000) => Math.floor(Math.random() * (max - min + 1)) + min;

const DEFAULT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Referer': 'https://m.daidata.com/',
  'Sec-Fetch-Mode': 'cors',
};

async function fetchWithGuardBypass(url, options = {}, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      await delay(getRandomDelay());
      const response = await axios({
        url,
        ...options,
        headers: { ...DEFAULT_HEADERS, ...options.headers },
        timeout: 15000,
      });
      return response.data;
    } catch (error) {
      if (i === retries - 1) throw error;
      await delay((i + 1) * 3000);
    }
  }
}

// 差枚数計算・補正ヘルパー関数
function calculateDiffDifference(games, bb, rb, rawDiff) {
  if (rawDiff !== undefined && rawDiff !== null) return Number(rawDiff);
  // 差枚データが直接とれない場合の推計（必要に応じて調整）
  const outCoins = games * 3;
  const inCoins = (bb * 240) + (rb * 96); // 概算値
  return inCoins - outCoins;
}

async function runSite7Scraper() {
  console.log('=== site7 台データ＆差枚 収集開始 ===');

  try {
    // ※対象ホールのエンドポイントまたはAPIに置き換えて使用します
    const targetUrl = 'https://m.daidata.com/search/hall/detail';
    const requestHeaders = process.env.SITE7_COOKIE ? { 'Cookie': process.env.SITE7_COOKIE } : {};

    const rawData = await fetchWithGuardBypass(targetUrl, {
      method: 'GET',
      headers: requestHeaders,
    });

    // テストサンプルデータ（実際のレスポンス形式に合わせてパース処理を調整）
    const today = new Date().toISOString().split('T')[0];
    const scrapedRecords = (rawData?.machines || [
      // APIフォーマットに合わせた構造化データの抽出例
    ]).map(item => {
      const diffCoins = calculateDiffDifference(item.total_games, item.bb_count, item.rb_count, item.diff_coins);
      return {
        date: today,
        hall_name: item.hall_name || '対象ホール',
        machine_no: item.machine_no,        // 台番号（必須）
        model_name: item.model_name,        // 機種名
        total_games: item.total_games || 0, // 総回転数
        bb_count: item.bb_count || 0,       // BIG回数
        rb_count: item.rb_count || 0,       // REG回数
        diff_coins: diffCoins,               // 差枚数（必須）
        updated_at: new Date()
      };
    });

    // Supabase DBへの一括保存（台データ・差枚数の保存）
    if (supabase && scrapedRecords.length > 0) {
      const { error } = await supabase
        .from('site7_daidata')
        .upsert(scrapedRecords, { onConflict: 'date, machine_no' });

      if (error) {
        console.error('Supabase保存エラー:', error.message);
      } else {
        console.log(`Supabaseへ ${scrapedRecords.length} 件の台データ・差枚数を保存完了！`);
      }
    } else {
      console.log('保存対象の台データなし、またはSupabase未接続');
    }

  } catch (error) {
    console.error('site7 処理エラー:', error.message);
  }

  console.log('=== site7 データ収集完了 ===');
}

runSite7Scraper();