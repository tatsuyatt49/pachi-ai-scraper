const { createClient } = require('@supabase/supabase-js');
const WebSocket = require('ws');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const scraperApiKey = process.env.SCRAPERAPI_KEY;

const supabase = (supabaseUrl && supabaseKey) 
  ? createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false },
      realtime: { transport: WebSocket }
    })
  : null;

const TARGET_HALLS = [
  { name: 'パラッツォ船橋店パートII', id: '13130009' },
  { name: 'スーパーＤ’ステーション千葉みなと店', id: '10019024' },
  { name: 'マルハン千葉みなと店', id: '10015018' }
];

async function runDeltaNetScraper() {
  console.log('=== DeltaNet ScraperAPI直叩き ＆ サーバー側JSレンダリングモード ===');
  const today = new Date().toISOString().split('T')[0];

  if (!scraperApiKey) {
    console.error('エラー: SCRAPERAPI_KEY が設定されていません。GitHub Secretsを確認してください。');
    return;
  }

  for (const hall of TARGET_HALLS) {
    console.log(`\n▶ [${hall.name}] (ID: ${hall.id}) データ収集開始...`);
    const scrapedRecords = [];

    try {
      const targetUrl = `https://www.d-deltanet.com/pc/HallSelectLink.do?hallcode=${hall.id}`;
      // ScraperAPIのエンドポイントを直接叩き、render=trueで向こう側にJSを描画させる
      const apiEndpoint = `https://api.scraperapi.com?api_key=${scraperApiKey}&url=${encodeURIComponent(targetUrl)}&render=true`;

      console.log('ScraperAPIへリクエスト送信中...');
      const response = await fetch(apiEndpoint, {
        signal: AbortSignal.timeout(60000) // 60秒タイムアウト
      });

      if (!response.ok) {
        throw new Error(`ScraperAPI HTTP Error: ${response.status}`);
      }

      const html = await response.text();

      // HTMLからタグを除去してテキスト化
      const textContent = html
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
        .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, '\n');

      const lines = textContent.split('\n').map(l => l.trim()).filter(Boolean);

      for (const line of lines) {
        const match = line.match(/(\d{3,4})\s*番台?.*?(\d+)\s*G.*?(\d+)\s*回.*?(\d+)\s*回/i) ||
                      line.match(/(\d{3,4})\s+(\d+)\s+(\d+)\s+(\d+)/);

        if (match) {
          const machineNo = match[1];
          const totalGames = Number(match[2] || 0);
          const bbCount = Number(match[3] || 0);
          const rbCount = Number(match[4] || 0);

          if (totalGames > 0 || bbCount > 0) {
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
      console.log(`[${hall.name}] 取得成功: ${uniqueRecords.length} 件`);

      if (supabase && uniqueRecords.length > 0) {
        const { error } = await supabase
          .from('site7_daidata')
          .upsert(uniqueRecords, { onConflict: 'date, hall_id, machine_no' });

        if (error) {
          console.error(`[${hall.name}] Supabase保存エラー:`, error.message);
        } else {
          console.log(`[${hall.name}] Supabaseへ保存成功！`);
        }
      }

    } catch (error) {
      console.error(`[${hall.name}] 収集エラー:`, error.message);
    }
  }

  console.log('\n=== DeltaNet データ収集完了 ===');
}

runDeltaNetScraper();
