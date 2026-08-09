const { createClient } = require('@supabase/supabase-js');
const WebSocket = require('ws');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const scraperApiKey = process.env.SCRAPERAPI_KEY;

const supabase = (supabaseUrl && supabaseKey)
  ? createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false },
      realtime: { transport: WebSocket }
    })
  : null;

const TARGET_HALLS = [
  { 
    name: 'パラッツォ船橋店', 
    id: '13130009', 
    url: 'https://ana-slo.com/ホールデータ/千葉県/パラッツォ船橋店-データ一覧/' 
  },
  { 
    name: 'マルハン千葉みなと店', 
    id: '10015018', 
    url: 'https://ana-slo.com/ホールデータ/千葉県/マルハン千葉みなと店-データ一覧/' 
  }
];

async function runScraper() {
  console.log('=== ScraperAPI（JSレンダリング有効）でのデータ取得を開始 ===');
  const today = new Date().toISOString().split('T')[0];

  if (!scraperApiKey) {
    console.error('エラー: SCRAPERAPI_KEY が設定されていません。');
    return;
  }

  for (const hall of TARGET_HALLS) {
    console.log(`\n▶ 取得中: ${hall.name}`);
    const scrapedRecords = [];

    try {
      // &render=true を追加してJavaScriptの描画を有効化
      const scraperUrl = `https://api.scraperapi.com?api_key=${scraperApiKey}&render=true&url=${encodeURIComponent(hall.url)}`;
      
      const response = await fetch(scraperUrl);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const htmlText = await response.text();
      console.log(`${hall.name}: HTML取得成功 (文字数: ${htmlText.length})`);

      // HTMLタグを簡易的に除去してテキスト行に分解
      const lines = htmlText.split('\n').map(l => l.replace(/<[^>]*>/g, '').trim()).filter(Boolean);

      for (const line of lines) {
        const match = line.match(/(\d{3,4})\D+(\d{1,5})\D+(\d{1,3})\D+(\d{1,3})/);

        if (match) {
          const machineNo = match[1];
          const totalGames = Number(match[2]);
          const bbCount = Number(match[3]);
          const rbCount = Number(match[4]);

          if (totalGames >= 0 && totalGames <= 12000 && bbCount <= 100 && rbCount <= 100) {
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
      }

      const uniqueRecords = Array.from(new Map(scrapedRecords.map(item => [item.machine_no, item])).values());
      console.log(`${hall.name}: 抽出された有効データ数 = ${uniqueRecords.length} 件`);

      if (supabase && uniqueRecords.length > 0) {
        const { error } = await supabase
          .from('site7_daidata')
          .upsert(uniqueRecords, { onConflict: 'date, hall_id, machine_no' });

        if (error) {
          console.error(`${hall.name} Supabase保存エラー:`, error.message);
        } else {
          console.log(`${hall.name} Supabaseへ保存成功！`);
        }
      }

    } catch (error) {
      console.error(`${hall.name} 処理エラー:`, error.message);
    }
  }

  console.log('=== すべての処理が完了しました ===');
}

runScraper();
