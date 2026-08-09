const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

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
  console.log('【アナスロ】データ抽出・デバッグモード開始...');
  const today = new Date().toISOString().split('T')[0];

  const browser = await puppeteer.launch({
    headless: "new",
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

  for (const hall of TARGET_HALLS) {
    console.log(`\n▶ アクセス中: ${hall.name}`);
    const scrapedRecords = [];

    try {
      await page.goto(hall.url, { waitUntil: 'domcontentloaded', timeout: 40000 });
      await new Promise(r => setTimeout(r, 4000));

      // ページ内のすべてのテキスト行を取得
      const textContent = await page.evaluate(() => document.body ? document.body.innerText : '');
      const lines = textContent.split('\n').map(l => l.trim()).filter(Boolean);

      console.log(`${hall.name}: 取得した総行数 = ${lines.length} 行`);

      let matchedCount = 0;
      for (const line of lines) {
        // 台番号とゲーム数、BB、RBが含まれる行を探索
        const match = line.match(/(\d{3,4})\s+(\d+)\s+(\d+)\s+(\d+)/);

        if (match) {
          matchedCount++;
          const machineNo = match[1];
          const totalGames = Number(match[2]);
          const bbCount = Number(match[3]);
          const rbCount = Number(match[4]);

          if (totalGames >= 0 && totalGames <= 12000) {
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

      console.log(`${hall.name}: パターンマッチした行数 = ${matchedCount} 件`);
      const uniqueRecords = Array.from(new Map(scrapedRecords.map(item => [item.machine_no, item])).values());
      console.log(`${hall.name}: 最終有効データ数 = ${uniqueRecords.length} 件`);

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
