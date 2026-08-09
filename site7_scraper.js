const axios = require('axios');
const cheerio = require('cheerio');
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

// 対象ホール一覧（DeltaNet用コード）
const TARGET_HALLS = [
  { name: 'パラッツォ船橋店パートII', id: '13130009' },
  { name: 'スーパーＤ’ステーション千葉みなと店', id: '10019024' },
  { name: 'マルハン千葉みなと店', id: '10015018' }
];

async function runDeltaNetScraper() {
  console.log('=== DeltaNet (d-deltanet.com) 台データ＆差枚 収集開始 ===');
  const today = new Date().toISOString().split('T')[0];
  const apiKey = process.env.SCRAPERAPI_KEY;

  if (!apiKey) {
    console.error('❌ エラー: SCRAPERAPI_KEY が設定されていません。');
    return;
  }

  for (const hall of TARGET_HALLS) {
    console.log(`\n▶ [${hall.name}] (ID: ${hall.id}) データ収集開始...`);

    try {
      // PC版 DeltaNet の正解URL
      const deltaUrl = `https://www.d-deltanet.com/pc/HallSelectLink.do?hallcode=${hall.id}`;
      const proxyApiUrl = `http://api.scraperapi.com?api_key=${apiKey}&url=${encodeURIComponent(deltaUrl)}&country_code=jp`;

      const response = await axios.get(proxyApiUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        },
        timeout: 30000
      });

      const $ = cheerio.load(response.data);
      const scrapedRecords = [];

      // テーブルやリスト行からデータ抽出
      $('tr, table, div, li').each((_, element) => {
        const text = $(element).text().replace(/\s+/g, ' ').trim();
        
        // 「台番号」「総ゲーム数」「BB」「RB」のパターンを検知
        const match = text.match(/(\d{3,4})\s*番台?.*?(\d+)\s*G.*?(\d+)\s*回.*?(\d+)\s*回/i) ||
                      text.match(/(\d{3,4})\s+(\d+)\s+(\d+)\s+(\d+)/);

        if (match) {
          const machineNo = match[1];
          const totalGames = Number(match[2] || 0);
          const bbCount = Number(match[3] || 0);
          const rbCount = Number(match[4] || 0);

          if (totalGames > 0 || bbCount > 0) {
            const outCoins = totalGames * 3;
            const inCoins = (bbCount * 240) + (rbCount * 96);
            const diffCoins = inCoins - outCoins;

            scrapedRecords.push({
              date: today,
              hall_id: hall.id,
              hall_name: hall.name,
              machine_no: machineNo,
              model_name: '対象機種',
              total_games: totalGames,
              bb_count: bbCount,
              rb_count: rbCount,
              diff_coins: diffCoins,
              updated_at: new Date()
            });
          }
        }
      });

      // 重複台の除去
      const uniqueRecords = Array.from(new Map(scrapedRecords.map(item => [item.machine_no, item])).values());

      console.log(`[${hall.name}] 取得成功: ${uniqueRecords.length} 件`);

      if (supabase && uniqueRecords.length > 0) {
        const { error } = await supabase
          .from('site7_daidata')
          .upsert(uniqueRecords, { onConflict: 'date, hall_id, machine_no' });

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

  console.log('\n=== DeltaNet 全店舗のデータ収集終了 ===');
}

runDeltaNetScraper();
