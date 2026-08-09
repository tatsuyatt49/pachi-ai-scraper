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
  console.log('【アナスロ】データ抽出・待機強化版を開始...');
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
      // ネットワーク通信が落ち着くまでしっかり待つ
      await page.goto(hall.url, { waitUntil: 'networkidle0', timeout: 45000 });
      
      // テーブル要素が画面に出現するまで最大10秒待機
      try {
        await page.waitForSelector('table', { timeout: 10000 });
      } catch (e) {
        console.log(`${hall.name}: テーブル要素の待機タイムアウト。追加で待機します...`);
      }
      
      // 念のためさらに4秒待機して描画を確実に完了させる
      await new Promise(r => setTimeout(r, 4000));

      // ページ内のすべてのテーブル行（tr）からテキストを抽出
      const rowsData = await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll('tr'));
        return rows.map(r => r.innerText.replace(/\s+/g, ' ').trim()).filter(Boolean);
      });

      console.log(`${hall.name}: 検出したテーブル行数 = ${rowsData.length} 行`);

      for (const line of rowsData) {
        // 台番号、ゲーム数、BB、RBの並びをマッチング
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
      console.log(`${hall.name}: 抽出成功した有効データ数 = ${uniqueRecords.length} 件`);

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
