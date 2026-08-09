// hallnavi_scraper.js
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

async function scrapeHallNaviClick() {
  console.log('【ホールナビ】クリック操作による店舗ページ突入テスト...');
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: '/usr/bin/chromium',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--window-size=1280,800']
  });

  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

  try {
    // 1. 千葉県の検索結果ページへ
    await page.goto('https://hall-navi.com/serch_hole_2?area=kanto&ken=12', { waitUntil: 'networkidle2', timeout: 60000 });
    
    // 2. ページ内にある店舗リンクの一つを「クリック」して遷移する
    console.log('店舗リンクを直接クリックします...');
    
    // 画面内の最初の店舗風リンクを探してクリックを実行
    const clicked = await page.evaluate(() => {
      const anchors = Array.from(document.querySelectorAll('a'));
      const target = anchors.find(a => a.href.includes('hole_view') && a.innerText.trim().length > 0);
      if (target) {
        target.click();
        return true;
      }
      return false;
    });

    if (!clicked) {
      console.log('クリックできる店舗リンクが見つかりませんでした。');
      return;
    }

    // 3. 画面の遷移を少し待つ
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 });

    const title = await page.title();
    console.log(`クリック後のページタイトル: ${title}`);

    // 4. 中身のテキストを一部確認
    const pageText = await page.evaluate(() => document.body.innerText.substring(0, 500));
    console.log('--- ページの中身（抜粋） ---');
    console.log(pageText);

  } catch (err) {
    console.error('エラー:', err.message);
  } finally {
    await browser.close();
    console.log('ブラウザを終了しました。');
  }
}

scrapeHallNaviClick();