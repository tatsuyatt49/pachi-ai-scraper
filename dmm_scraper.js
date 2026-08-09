const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const TARGET_HALL = { 
  name: 'マルハン千葉みなと店', 
  url: 'https://ana-slo.com/ホールデータ/千葉県/マルハン千葉みなと店-データ一覧/' 
};

async function investigateStructure() {
  console.log('=== アナスロ 構造徹底調査モード開始 ===');

  const browser = await puppeteer.launch({
    headless: "new",
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

  try {
    console.log(`アクセス中: ${TARGET_HALL.url}`);
    await page.goto(TARGET_HALL.url, { waitUntil: 'domcontentloaded', timeout: 40000 });
    await new Promise(r => setTimeout(r, 6000)); // しっかり待つ

    // ページ内にあるテーブルや主要な要素の構造を丸裸にしてログに出力
    const structureInfo = await page.evaluate(() => {
      const tables = Array.from(document.querySelectorAll('table')).map((t, i) => {
        return {
          tableIndex: i,
          className: t.className,
          id: t.id,
          rowCount: t.rows.length,
          firstRowText: t.rows.length > 0 ? t.rows[0].innerText.replace(/\s+/g, ' ').substring(0, 80) : ''
        };
      });

      const divs = Array.from(document.querySelectorAll('div')).filter(d => d.innerText.includes('G') && d.innerText.length < 500).slice(0, 5).map(d => ({
        className: d.className,
        textSnippet: d.innerText.replace(/\s+/g, ' ').substring(0, 80)
      }));

      return { tables, divs };
    });

    console.log('【検出されたテーブル一覧】\n', JSON.stringify(structureInfo.tables, null, 2));
    console.log('【検出された候補Div一覧】\n', JSON.stringify(structureInfo.divs, null, 2));

  } catch (error) {
    console.error('調査エラー:', error.message);
  } finally {
    await browser.close();
    console.log('=== 調査終了 ===');
  }
}

investigateStructure();
