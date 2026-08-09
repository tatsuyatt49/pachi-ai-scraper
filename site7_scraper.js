// site7_scraper.js
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

async function scrapeSite7() {
  console.log('【サイトセブン】アクセス開始...');
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: '/usr/bin/chromium',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--window-size=1280,800']
  });

  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

  try {
    const url = 'https://m.site777.jp/f/D0300.do?pmc=13130009&clc=03&urt=2173&pan=1';
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
    
    const title = await page.title();
    console.log(`現在のタイトル: ${title}`);
    
    // 中身が取れているか確認用にHTMLの一部を表示
    const content = await page.evaluate(() => document.body.innerText.substring(0, 500));
    console.log('--- ページの中身（抜粋） ---');
    console.log(content);
    
  } catch (err) {
    console.error('サイトセブンへのアクセスでエラー:', err.message);
  } finally {
    await browser.close();
    console.log('ブラウザを終了しました。');
  }
}

scrapeSite7();