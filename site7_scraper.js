const puppeteer = require('puppeteer');
const { createClient } = require('@supabase/supabase-js');
const WebSocket = require('ws');

// Node.js 20環境用 Supabase初期化
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
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
  console.log('=== DeltaNet リンク全自動検出取得モード ===');
  const today = new Date().toISOString().split('T')[0];

  const browser = await puppeteer.launch({
    headless: "new",
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();

  for (const hall of TARGET_HALLS) {
    console.log(`\n▶ [${hall.name}] (ID: ${hall.id}) データ収集開始...`);
    const scrapedRecords = [];

    try {
      const hallUrl = `https://www.d-deltanet.com/pc/HallSelectLink.do?hallcode=${hall.id}`;
      await page.goto(hallUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

      // リンク判定条件を拡大（ナビ系を除外した全内部リンクを取得）
      const targetLinks = await page.$$eval('a', (anchors, currentUrl) => {
        const links = [];
        const ignoreKeywords = ['Top.do', 'FAQ', 'Mypage', 'Login', 'rule', 'privacy', 'index'];

        for (const a of anchors) {
          const href = a.getAttribute('href');
          const text = (a.textContent || '').trim();

          if (!href || href === '#' || href.startsWith('javascript:void')) continue;

          const isIgnore = ignoreKeywords.some(kw => href.includes(kw));
          if (!isIgnore && (href.includes('do') || href.includes('hall') || text.includes('出玉') || text.includes('データ'))) {
            const fullUrl = href.startsWith('http') ? href : `https://www.d-deltanet.com/pc/${href.replace(/^\//, '')}`;
            if (fullUrl !== currentUrl && !links.includes(fullUrl)) {
              links.push(fullUrl);
            }
          }
        }
        return links;
      }, hallUrl);

      console.log(`[${hall.name}] 検出した対象リンク数: ${targetLinks.length} 個`);

      // 万が一リンクが取れない場合はトップページ自体を解析候補に追加
      if (targetLinks.length === 0) {
        targetLinks.push(hallUrl);
      }

      const limit = Math.min(targetLinks.length, 15);

      for (let i = 0; i < limit; i++) {
        try {
          await page.goto(targetLinks[i], { waitUntil: 'domcontentloaded', timeout: 20000 });

          const rows = await page.$$eval('tr, div', elements => 
            elements.map(el => el.innerText ? el.innerText.replace(/\s+/g, ' ').trim() : '')
          );

          for (const text of rows) {
            if (!text) continue;

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
          // 個別リンク読み込みエラーはスキップ
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

  await browser.close();
  console.log('\n=== DeltaNet データ収集完了 ===');
}

runDeltaNetScraper();
