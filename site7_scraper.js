const puppeteer = require('puppeteer');
const { createClient } = require('@supabase/supabase-js');
const WebSocket = require('ws');

// Node.js 20環境用：wsモジュールを明示的に指定してSupabase初期化
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = (supabaseUrl && supabaseKey) 
  ? createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false },
      realtime: { transport: WebSocket }
    })
  : null;

const TARGET_HALLS = [
  { name: 'パラッツォ船橋店パートII', id: '13130009' }
];

async function runDeltaNetScraper() {
  console.log('=== DeltaNet 接続＆レスポンス確認デバッグ ===');

  const browser = await puppeteer.launch({
    headless: "new",
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

  for (const hall of TARGET_HALLS) {
    try {
      const hallUrl = `https://www.d-deltanet.com/pc/HallSelectLink.do?hallcode=${hall.id}`;
      const response = await page.goto(hallUrl, { waitUntil: 'networkidle2', timeout: 30000 });

      console.log(`[HTTPステータス]: ${response ? response.status() : 'N/A'}`);
      console.log(`[最終遷移先URL]: ${page.url()}`);

      const title = await page.title();
      console.log(`[ページタイトル]: ${title}`);

      const bodyText = await page.evaluate(() => document.body ? document.body.innerText.substring(0, 300) : 'EMPTY');
      console.log(`[本文テキスト（先頭300文字）]:\n${bodyText}`);

    } catch (error) {
      console.error(`[実行エラー]:`, error.message);
    }
  }

  await browser.close();
  console.log('=== デバッグ終了 ===');
}

runDeltaNetScraper();
