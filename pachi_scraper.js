import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import ws from 'ws';

puppeteer.use(StealthPlugin());

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { realtime: { transport: ws } }
);

const targetStores = [
  {
    store_name: 'パラッツォ船橋店',
    url: 'https://ana-slo.com/ホールデータ/千葉県/パラッツォ船橋店-データ一覧/'
  },
  {
    store_name: 'マルハン千葉みなと店',
    url: 'https://ana-slo.com/ホールデータ/千葉県/マルハン千葉みなと店-データ一覧/'
  }
];

async function scrapeData() {
  console.log('ステルスモードでブラウザを起動中...');
  
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: '/usr/bin/chromium',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--window-size=1280,800']
  });

  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

  try {
    for (const target of targetStores) {
      console.log(`アクセス中: ${target.store_name} (${target.url})`);

      try {
        await page.goto(target.url, { waitUntil: 'networkidle2', timeout: 60000 });
        
        const title = await page.title();
        console.log(`現在のタイトル: ${title}`);

        const parsedData = await page.evaluate((storeName) => {
          const results = [];
          const bodyText = document.body.innerText;
          const lines = bodyText.split('\n').map(l => l.trim());
          
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            if (/^\d{4}\/\d{2}\/\d{2}/.test(line)) {
              const dateStr = line.substring(0, 10);
              
              let totalDiff = null;
              let winRate = null;
              
              for (let j = i + 1; j < i + 15 && j < lines.length; j++) {
                const nextLine = lines[j];
                
                if (totalDiff === null && /^-?[\d,]+$/.test(nextLine) && nextLine.includes(',')) {
                  totalDiff = parseInt(nextLine.replace(/,/g, ''), 10);
                  continue;
                }
                
                if (winRate === null && /^\d+(\.\d+)?%$/.test(nextLine)) {
                  winRate = parseFloat(nextLine.replace('%', ''));
                  continue;
                }
              }

              results.push({
                store_name: storeName,
                date: dateStr,
                total_diff_coins: totalDiff,
                avg_diff_coins: null,
                win_rate: winRate
              });
            }
          }
          
          const uniqueMap = new Map();
          results.forEach(item => uniqueMap.set(item.date, item));
          return Array.from(uniqueMap.values());
        }, target.store_name);

        console.log(`${target.store_name}: 抽出されたデータ数: ${parsedData.length}件`);

        if (parsedData.length > 0) {
          console.log(`${target.store_name} のデータを分割してSupabaseへ保存・更新中...`);
          
          // 一度に送信する負荷を減らすため、500件ずつのチャンクに分割して送信
          const chunkSize = 500;
          let hasError = false;

          for (let i = 0; i < parsedData.length; i += chunkSize) {
            const chunk = parsedData.slice(i, i + chunkSize);
            const { error } = await supabase
              .from('pachi_data')
              .upsert(chunk, { onConflict: ['store_name', 'date'] });

            if (error) {
              console.error(`保存エラー (チャンク ${i}〜):`, error.message);
              hasError = true;
            }
          }

          if (!hasError) {
            console.log(`${target.store_name} のデータ保存処理が完了しました！`);
          }
        }

      } catch (innerErr) {
        console.error(`${target.store_name} の処理中にエラー:`, innerErr.message);
      }
    }

  } catch (err) {
    console.error('スクレイピングエラー:', err.message);
  } finally {
    await browser.close();
    console.log('ブラウザを終了しました。');
  }
}

scrapeData();