const { chromium } = require('playwright');
const { createClient } = require('@supabase/supabase-js');

// Supabase初期化
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = (supabaseUrl && supabaseKey) 
  ? createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } })
  : null;

const TARGET_HALLS = [
  { name: 'パラッツォ船橋店パートII', id: '13130009' },
  { name: 'スーパーＤ’ステーション千葉みなと店', id: '10019024' },
  { name: 'マルハン千葉みなと店', id: '10015018' }
];

async function runDeltaNetScraper() {
  console.log('=== DeltaNet Playwright ブラウザ操作取得モード ===');
  const today = new Date().toISOString().split('T')[0];

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();

  for (const hall of TARGET_HALLS) {
    console.log(`\n▶ [${hall.name}] (ID: ${hall.id}) データ収集開始...`);
    const scrapedRecords = [];

    try {
      // 店舗のトップ（機種一覧画面）を開く
      const hallUrl = `https://www.d-deltanet.com/pc/HallSelectLink.do?hallcode=${hall.id}`;
      await page.goto(hallUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

      // 「出玉データ」ボタン/リンク要素をすべて特定
      const dataButtons = await page.$$('a:has-text("出玉データ"), input[value*="出玉"]');
      console.log(`[${hall.name}] 発見した出玉データボタン数: ${dataButtons.length} 個`);

      // 先頭から順に数機種分を巡回してデータを取得（タイムアウト防止のため最大10機種）
      const limit = Math.min(dataButtons.length, 10);

      for (let i = 0; i < limit; i++) {
        try {
          // 再度機種一覧へ戻って対象ボタンをクリック
          await page.goto(hallUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
          const buttons = await page.$$('a:has-text("出玉データ"), input[value*="出玉"]');
          if (!buttons[i]) continue;

          await Promise.all([
            page.waitForNavigation({ timeout: 15000 }).catch(() => {}),
            buttons[i].click()
          ]);

          // ページ内のテーブル行を取得して数値を解析
          const rows = await page.$$eval('tr', trs => trs.map(tr => tr.innerText.replace(/\s+/g, ' ').trim()));

          for (const text of rows) {
            const match = text.match(/(\d{3,4})\s*番台?.*?(\d+)\s*G.*?(\d+)\s*回.*?(\d+)\s*回/i) ||
                          text.match(/(\d{3,4})\s+(\d+)\s+(\d+)\s+(\d+)/);

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
        } catch (e) {
          // 個別ページの取得失敗はスキップして次へ
        }
      }

      // 重複台の排除
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

  await browser.close();
  console.log('\n=== DeltaNet データ収集完了 ===');
}

runDeltaNetScraper();
