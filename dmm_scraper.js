const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const { createClient } = require('@supabase/supabase-js');
const WebSocket = require('ws');

// Supabase初期化（Node.js 20用のWebSocket指定を追加）
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
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

async function runDmmScraper() {
  console.log('【DMMぱちタウン / アナスロ】データ取得＆DB保存処理を開始...');
  const today = new Date().toISOString().split('T')[0];

  // ステルスモードでブラウザを起動して403ブロックを回避
  const browser = await puppeteer.launch({
    headless: "new",
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

  for (const hall of TARGET_HALLS) {
    console.log(`\nアクセス中: ${hall.name} (${hall.url})`);
    const scrapedRecords = [];

    try {
      await page.goto(hall.url, { waitUntil: 'domcontentloaded', timeout: 35000 });
      await new Promise(r => setTimeout(r, 3000));

      // ページのテキストを抽出して解析
      const pageText = await page.evaluate(() => document.body ? document.body.innerText : '');
      const lines = pageText.split('\n').map(l => l.trim()).filter(Boolean);

      for (const line of lines) {
        const match = line.match(/(\d{3,4})\s*番台?.*?(\d+)\s*G.*?(\d+)\s*回.*?(\d+)\s*回/i) ||
                      line.match(/(\d{3,4})\s+(\d+)\s+(\d+)\s+(\d+)/);

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
      }

      const uniqueRecords = Array.from(new Map(scrapedRecords.map(item => [item.machine_no, item])).values());
      console.log(`${hall.name}: 抽出されたデータ数: ${uniqueRecords.length}件`);

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

  await browser.close();
  console.log('処理完了。ブラウザを閉じました。');
}

runDmmScraper();
