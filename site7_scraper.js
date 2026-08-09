const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');

// Supabase初期化
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = (supabaseUrl && supabaseKey) ? createClient(supabaseUrl, supabaseKey) : null;

// 遅延処理＆ヘッダー（ガード回避・バン防止）
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const getRandomDelay = (min = 2000, max = 4000) => Math.floor(Math.random() * (max - min + 1)) + min;

const DEFAULT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Referer': 'https://m.site777.jp/',
  'Sec-Fetch-Mode': 'cors',
};

// 対象の3店舗リスト
const TARGET_HALLS = [
  { name: 'パラッツォ船橋店パートII', id: '13130009' },
  { name: 'スーパーＤ’ステーション千葉みなと店', id: '10019024' },
  { name: 'マルハン千葉みなと店', id: '10015018' }
];

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

// 差枚数計算
function calculateDiff(games, bb, rb, rawDiff) {
  if (rawDiff !== undefined && rawDiff !== null) return Number(rawDiff);
  const outCoins = (games || 0) * 3;
  const inCoins = ((bb || 0) * 240) + ((rb || 0) * 96);
  return inCoins - outCoins;
}

async function runSite7Scraper() {
  console.log('=== site7 3店舗 台データ＆差枚 収集開始 ===');
  const today = new Date().toISOString().split('T')[0];

  for (const hall of TARGET_HALLS) {
    console.log(`\n▶ [${hall.name}] (ID: ${hall.id}) データ収集開始...`);

    try {
      // site7のホール詳細エンドポイント
      const targetUrl = `https://m.site777.jp/f/D0300.do?pmc=${hall.id}&clc=03`;
      const requestHeaders = process.env.SITE7_COOKIE ? { 'Cookie': process.env.SITE7_COOKIE } : {};

      const rawData = await fetchWithGuardBypass(targetUrl, {
        method: 'GET',
        headers: requestHeaders,
      });

      // パース処理（レスポンスから抽出）
      const scrapedRecords = (rawData?.machines || []).map(item => {
        const diffCoins = calculateDiff(item.total_games, item.bb_count, item.rb_count, item.diff_coins);
        return {
          date: today,
          hall_id: hall.id,
          hall_name: hall.name,
          machine_no: item.machine_no,
          model_name: item.model_name || '不明機種',
          total_games: item.total_games || 0,
          bb_count: item.bb_count || 0,
          rb_count: item.rb_count || 0,
          diff_coins: diffCoins,
          updated_at: new Date()
        };
      });

      console.log(`[${hall.name}] 取得完了: ${scrapedRecords.length} 件`);

      // Supabaseへ保存
      if (supabase && scrapedRecords.length > 0) {
        const { error } = await supabase
          .from('site7_daidata')
          .upsert(scrapedRecords, { onConflict: 'date, hall_id, machine_no' });

        if (error) {
          console.error(`[${hall.name}] Supabase保存エラー:`, error.message);
        } else {
          console.log(`[${hall.name}] Supabaseへ保存成功！`);
        }
      }
    } catch (error) {
      console.error(`[${hall.name}] 収集エラー:`, error.message);
    }
  }

  console.log('\n=== site7 全店舗のデータ収集終了 ===');
}

runSite7Scraper();