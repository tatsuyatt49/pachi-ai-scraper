const axios = require('axios');
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

const TARGET_HALLS = [
  { name: 'パラッツォ船橋店パートII', id: '13130009' },
  { name: 'スーパーＤ’ステーション千葉みなと店', id: '10019024' },
  { name: 'マルハン千葉みなと店', id: '10015018' }
];

async function runSite7Scraper() {
  console.log('=== site7 3店舗 台データ＆差枚 収集開始 (ScraperAPI・解析調整版) ===');
  const today = new Date().toISOString().split('T')[0];
  const cookie = process.env.SITE7_COOKIE;
  const apiKey = process.env.SCRAPERAPI_KEY;

  if (!apiKey) {
    console.error('❌ エラー: SCRAPERAPI_KEY が設定されていません。GitHub Secretsを確認してください。');
    return;
  }

  for (const hall of TARGET_HALLS) {
    console.log(`\n▶ [${hall.name}] (ID: ${hall.id}) データ収集開始...`);

    try {
      const site7Url = `https://m.site777.jp/f/D0300.do?pmc=${hall.id}&clc=03`;
      const proxyApiUrl = `http://api.scraperapi.com?api_key=${apiKey}&url=${encodeURIComponent(site7Url)}&country_code=jp&keep_headers=true`;

      const response = await axios.get(proxyApiUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
          'Accept': 'application/json, text/javascript, */*; q=0.01',
          'Accept-Language': 'ja-JP,ja;q=0.9',
          'Referer': 'https://m.site777.jp/f/D0300.do',
          'X-Requested-With': 'XMLHttpRequest',
          'Cookie': cookie || ''
        },
        timeout: 30000
      });

      let rawData = response.data;
      if (typeof rawData === 'string') {
        try {
          rawData = JSON.parse(rawData);
        } catch (e) {
          console.log(`[${hall.name}] レスポンス冒頭(100文字):`, rawData.substring(0, 100));
        }
      }

      let scrapedRecords = [];

      if (typeof rawData === 'object' && rawData !== null) {
        // 多様なレスポンスキーに対応
        const list = rawData.machines || rawData.list || rawData.data || rawData.daidata || [];
        
        if (Array.isArray(list) && list.length > 0) {
          scrapedRecords = list.map(item => {
            const totalGames = Number(item.total_games || item.gcount || item.total_g || 0);
            const bbCount = Number(item.bb_count || item.bb || 0);
            const rbCount = Number(item.rb_count || item.rb || 0);
            
            const outCoins = totalGames * 3;
            const inCoins = (bbCount * 240) + (rbCount * 96);
            const diffCoins = item.diff_coins !== undefined ? Number(item.diff_coins) : (inCoins - outCoins);

            return {
              date: today,
              hall_id: hall.id,
              hall_name: hall.name,
              machine_no: String(item.machine_no || item.daiban || item.台番号 || ''),
              model_name: item.model_name || item.kisyu_name || item.機種名 || '不明機種',
              total_games: totalGames,
              bb_count: bbCount,
              rb_count: rbCount,
              diff_coins: diffCoins,
              updated_at: new Date()
            };
          }).filter(r => r.machine_no !== '');
        } else {
          console.log(`[${hall.name}] 受信データオブジェクトのキー一覧:`, Object.keys(rawData));
        }
      }

      console.log(`[${hall.name}] 取得成功: ${scrapedRecords.length} 件`);

      if (supabase && scrapedRecords.length > 0) {
        const { error } = await supabase
          .from('site7_daidata')
          .upsert(scrapedRecords, { onConflict: 'date, hall_id, machine_no' });

        if (error) {
          console.error(`[${hall.name}] Supabase保存エラー:`, error.message);
        } else {
          console.log(`[${hall.name}] Supabaseへ保存完了！`);
        }
      }
    } catch (error) {
      console.error(`[${hall.name}] 収集エラー:`, error.message);
    }
  }

  console.log('\n=== site7 全店舗のデータ収集終了 ===');
}

runSite7Scraper();
