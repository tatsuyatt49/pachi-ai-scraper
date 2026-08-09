const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { createClient } = require('@supabase/supabase-js');
const WebSocket = require('ws');

// Supabase初期化
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = (supabaseUrl && supabaseKey) 
  ? createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false },
      realtime: { transport: WebSocket }
    })
  : null;

// フリーの日本プロキシリスト
const PROXY_LIST = [
  'http://153.127.61.12:8080',
  'http://133.242.149.208:8080',
  'http://160.16.142.179:8080'
];

const DEFAULT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'ja-JP,ja;q=0.9',
  'Referer': 'https://m.site777.jp/',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Site': 'same-origin',
};

const TARGET_HALLS = [
  { name: 'パラッツォ船橋店パートII', id: '13130009' },
  { name: 'スーパーＤ’ステーション千葉みなと店', id: '10019024' },
  { name: 'マルハン千葉みなと店', id: '10015018' }
];

async function fetchWithProxy(url, cookie) {
  let lastError = null;
  for (const proxyUrl of PROXY_LIST) {
    try {
      const agent = new HttpsProxyAgent(proxyUrl);
      const headers = { ...DEFAULT_HEADERS };
      if (cookie) headers['Cookie'] = cookie;

      const response = await axios.get(url, {
        httpsAgent: agent,
        httpAgent: agent,
        headers: headers,
        timeout: 10000
      });
      return response.data;
    } catch (err) {
      lastError = err;
      continue;
    }
  }
  throw lastError || new Error('全プロキシでの接続に失敗しました');
}

async function runSite7Scraper() {
  console.log('=== site7 3店舗 台データ＆差枚 収集開始 (日本プロキシ経由) ===');
  const today = new Date().toISOString().split('T')[0];
  const cookie = process.env.SITE7_COOKIE;

  for (const hall of TARGET_HALLS) {
    console.log(`\n▶ [${hall.name}] (ID: ${hall.id}) データ収集開始...`);

    try {
      const targetUrl = `https://m.site777.jp/f/D0300.do?pmc=${hall.id}&clc=03`;
      const rawData = await fetchWithProxy(targetUrl, cookie);

      const scrapedRecords = (rawData?.machines || []).map(item => {
        const outCoins = (item.total_games || 0) * 3;
        const inCoins = ((item.bb_count || 0) * 240) + ((item.rb_count || 0) * 96);
        const diffCoins = item.diff_coins !== undefined ? Number(item.diff_coins) : (inCoins - outCoins);

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
