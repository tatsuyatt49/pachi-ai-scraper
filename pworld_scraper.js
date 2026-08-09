// pworld_scraper.js
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

async function scrapeDmmPTown() {
  console.log('【DMMぱちタウン】スケジュール・新着エリアの抽出中...');
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: '/usr/bin/chromium',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--window-size=1280,800']
  });

  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

  try {
    const targetUrl = 'https://p-town.dmm.com/shops/chiba/11722';
    await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 60000 });

    const title = await page.title();
    console.log(`ページタイトル: ${title}`);

    // DMMぱちタウンのスケジュールや取材イベントの要素をピンポイント抽出
    const events = await page.evaluate(() => {
      // スケジュールや新着情報枠に含まれそうなテキストブロックを取得
      const textNodes = Array.from(document.querySelectorAll('.p-shop_schedule, .p-shop_news, [class*="schedule"], [class*="event"]'));
      if (textNodes.length > 0) {
        return textNodes.map(el => el.innerText.trim());
      }
      // 見つからない場合はbodyから日付っぽい行を抽出
      return [document.body.innerText.substring(0, 800)];
    });

    console.log('--- 検出されたイベント・スケジュールエリア ---');
    console.log(events);

  } catch (err) {
    console.error('エラー:', err.message);
  } finally {
    await browser.close();
    console.log('ブラウザを終了しました。');
  }
}

scrapeDmmPTown();