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
  console.log('=== site7 3店舗 台データ＆差枚 収集開始 (APIエンドポイント版) ===');
  const today = new Date().toISOString().split('T')[0];
  const apiKey = process.env.SCRAPERAPI_KEY;

  if (!apiKey) {
    console.error('❌ エラー: SCRAPERAPI_KEY が設定されていません。');
    return;
  }

  for (const hall of TARGET_HALLS) {
    console.log(`\n▶ [${hall.name}] (ID: ${hall.id}) データ収集開始...`);

    try {
      // 誰でもアクセス可能なデータAPI URL
      const site7ApiUrl = `https://m.site777.jp/f/D0301.do?pmc=${hall.id}&clc=03`;
      const proxyApiUrl = `http://api.scraperapi.com?api_key=${apiKey}&url=${encodeURIComponent(site7ApiUrl)}&country_code=jp`;

      const response = await axios.get(proxyApiUrl, { timeout: 30000 });

      let data = response.data;
      if (typeof data === 'string') {
        try { data = JSON.parse(data); } catch (e) {}
      }

      const scrapedRecords = [];

      // JSONデータの抽出処理
      const list = Array.isArray(data) ? data : (data.list || data.machines || []);

      for (const item of list) {
        const machineNo = String(item.machine_no || item.daiban || item.台番号 || '');
        if (!machineNo) continue;

        const totalGames = Number(item.total_games || item.gcount || 0);
        const bbCount = Number(item.bb_count || item.bb || 0);
        const rbCount = Number(item.rb_count || item.rb || 0);

        const outCoins = totalGames * 3;
        const inCoins = (bbCount * 240) + (rbCount * 96);
        const diffCoins = item.diff_coins !== undefined ? Number(item.diff_coins) : (inCoins - outCoins);

        scrapedRecords.push({
          date: today,
          hall_id: hall.id,
          hall_name: hall.name,
          machine_no: machineNo,
          model_name: item.model_name || item.kisyu_name || '不明機種',
          total_games: totalGames,
          bb_count: bbCount,
          rb_count: rbCount,
          diff_coins: diffCoins,
          updated_at: new Date()
        });
      }

      console.log(`[${hall.name}] 取得成功: ${scrapedRecords.length} 件`);

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
