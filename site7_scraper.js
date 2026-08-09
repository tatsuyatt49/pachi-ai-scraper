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

const TARGET_HALLS = [
  { name: 'パラッツォ船橋店パートII', id: '13130009' },
  { name: 'スーパーＤ’ステーション千葉みなと店', id: '10019024' },
  { name: 'マルハン千葉みなと店', id: '10015018' }
];

async function runDeltaNetScraper() {
  console.log('=== DeltaNet (d-deltanet.com) 全機種巡回・台データ収集開始 ===');
  const today = new Date().toISOString().split('T')[0];
  const apiKey = process.env.SCRAPERAPI_KEY;

  if (!apiKey) {
    console.error('❌ エラー: SCRAPERAPI_KEY が設定されていません。');
    return;
  }

  for (const hall of TARGET_HALLS) {
    console.log(`\n▶ [${hall.name}] (ID: ${hall.id}) データ収集開始...`);

    try {
      // 1. 店舗の機種一覧ページを取得
      const hallUrl = `https://www.d-deltanet.com/pc/HallSelectLink.do?hallcode=${hall.id}`;
      const proxyHallUrl = `http://api.scraperapi.com?api_key=${apiKey}&url=${encodeURIComponent(hallUrl)}&country_code=jp`;

      const hallRes = await axios.get(proxyHallUrl, { timeout: 30000 });
      const $hall = cheerio.load(hallRes.data);

      // 各機種の「出玉データ」リンク（URL）をすべて収集
      const modelLinks = [];
      $hall('a').each((_, el) => {
        const href = $hall(el).attr('href');
        const text = $hall(el).text().trim();
        if (href && (href.includes('Dadata') || href.includes('Hall') || text.includes('出玉データ'))) {
          const fullUrl = href.startsWith('http') ? href : `https://www.d-deltanet.com/pc/${href.replace(/^\//, '')}`;
          if (!modelLinks.includes(fullUrl)) {
            modelLinks.push(fullUrl);
          }
        }
      });

      console.log(`[${hall.name}] 発見した機種ページ数: ${modelLinks.length} 件`);

      const scrapedRecords = [];

      // 2. 収集したリンク（または直接全体をループ）から台データを解析
      // リンクが取れない場合のバックアップとして直接全体テキストもパース
      const targetsToScrape = modelLinks.length > 0 ? modelLinks.slice(0, 15) : [hallUrl];

      for (const targetUrl of targetsToScrape) {
        try {
          const proxyTargetUrl = `http://api.scraperapi.com?api_key=${apiKey}&url=${encodeURIComponent(targetUrl)}&country_code=jp`;
          const pageRes = await axios.get(proxyTargetUrl, { timeout: 20000 });
          const $page = cheerio.load(pageRes.data);

          $page('tr, div, table').each((_, element) => {
            const text = $page(element).text().replace(/\s+/g, ' ').trim();
            
            // 台番号、ゲーム数、BB、RB等の数値パターン
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
        } catch (e) {
          // 個別ページエラーはスキップして次へ
        }
      }

      // 重複削除
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
