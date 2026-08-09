const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
const WebSocket = require('ws');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = (supabaseUrl && supabaseKey) 
  ? createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false },
      realtime: { transport: WebSocket }
    })
  : null;

const TARGET_HALLS = [
  { name: 'パラッツォ船橋店パートII', id: '13130009' },
  { name: 'スーパーＤ’ステーション千葉みなと店', id: '10019024' },
  { name: 'マルハン千葉みなと店', id: '10015018' }
];

async function runSite7Scraper() {
  console.log('=== site7 レスポンス構造解析 ===');
  const apiKey = process.env.SCRAPERAPI_KEY;

  if (!apiKey) {
    console.error('❌ SCRAPERAPI_KEY が未設定です');
    return;
  }

  for (const hall of TARGET_HALLS) {
    console.log(`\n▶ [${hall.name}]`);

    try {
      const site7Url = `https://m.site777.jp/f/D0300.do?pmc=${hall.id}&clc=03`;
      const proxyApiUrl = `http://api.scraperapi.com?api_key=${apiKey}&url=${encodeURIComponent(site7Url)}&country_code=jp&render=true`;

      const response = await axios.get(proxyApiUrl, { timeout: 45000 });
      const data = response.data;

      console.log(`[${hall.name}] データ型:`, typeof data);

      if (typeof data === 'object' && data !== null) {
        console.log(`[${hall.name}] 取得オブジェクトの主要キー:`, Object.keys(data));
      } else if (typeof data === 'string') {
        console.log(`[${hall.name}] 文字列長:`, data.length);
        console.log(`[${hall.name}] 先頭200文字:`, data.substring(0, 200).replace(/\s+/g, ' '));
      }
    } catch (error) {
      console.error(`[${hall.name}] エラー:`, error.message);
    }
  }
}

runSite7Scraper();
