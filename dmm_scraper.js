const { createClient } = require('@supabase/supabase-js');
const WebSocket = require('ws');

// Supabase初期化（Node.js 20用のWebSocket指定を追加）
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = (supabaseUrl && supabaseKey)
  ? createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false },
      realtime: { transport: WebSocket }
    })
  : null;

async function runDmmScraper() {
  console.log('【DMMぱちタウン】イベント取得＆DB保存処理を開始...');

  // イベント取得ロジック
  const events = [];

  console.log('--- 抽出成功したイベントデータ ---');
  console.log(events);

  if (events.length === 0) {
    console.log('抽出できるイベントが見つかりませんでした。');
  }

  console.log('処理完了。ブラウザを閉じました。');
}

runDmmScraper();