const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { createClient } = require('@supabase/supabase-js');

puppeteer.use(StealthPlugin());

// Supabase初期化
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = (supabaseUrl && supabaseKey)
  ? createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false },
      realtime: { timeout: 0 }
    })
  : null;

const TARGET_URLS = [
  { name: 'パラッツォ船橋店', url: 'https://ana-slo.com/ホールデータ/千葉県/パラッツォ船橋店-データ一覧/' },
  { name: 'マルハン千葉みなと店', url: 'https://ana-slo.com/ホールデータ/千葉県/マルハン千葉みなと店-データ一覧/' }
];

async function runPachiScraper() {
  console.log('ステルスモードでブラウザを起動中...');

  // GitHub Actions環境でクラッシュを防ぐ必須オプション
  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--single-process',
      '--disable-gpu',
    ],
  });

  try {
    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(60000);

    for (const target of TARGET_URLS) {
      console.log(`アクセス中: ${target.name} (${target.url})`);
      try {
        await page.goto(target.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        const title = await page.title();
        console.log(`現在のタイトル: ${title}`);

        // テーブル要素の取得処理などを記述
        const scrapedCount = 0; // 例: 取得できたデータ数
        console.log(`${target.name}: 抽出されたデータ数: ${scrapedCount}件`);

      } catch (err) {
        console.error(`${target.name} アクセスエラー:`, err.message);
      }
    }
  } catch (error) {
    console.error('ブラウザ実行エラー:', error.message);
  } finally {
    console.log('処理完了。ブラウザを閉じました。');
    await browser.close();
  }
}

runPachiScraper();