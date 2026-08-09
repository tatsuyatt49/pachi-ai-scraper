const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const TARGET_HALL = { 
  name: 'マルハン千葉みなと店', 
  url: 'https://ana-slo.com/ホールデータ/千葉県/マルハン千葉みなと店-データ一覧/' 
};

async function dumpHtml() {
  console.log('=== アナスロ ページテキスト確認モード ===');

  const browser = await puppeteer.launch({
    headless: "new",
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

  try {
    console.log(`アクセス中: ${TARGET_HALL.url}`);
    await page.goto(TARGET_HALL.url, { waitUntil: 'networkidle2', timeout: 40000 });
    
    // データの動的描画をしっかり待つ
    await new Promise(r => setTimeout(r, 7000));

    // ページ全体のテキストを抽出して冒頭部分をログに出力
    const bodyText = await page.evaluate(() => {
      return document.body ? document.body.innerText : 'BODY_NULL';
    });

    console.log('--- 取得できたページ内テキスト（冒頭抜粋） ---');
    console.log(bodyText.substring(0, 2000));
    console.log('--------------------------------------------');

  } catch (error) {
    console.error('エラー:', error.message);
  } finally {
    await browser.close();
    console.log('=== 終了 ===');
  }
}

dumpHtml();
