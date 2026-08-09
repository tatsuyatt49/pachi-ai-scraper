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
  console.log('=== DeltaNet 全フレーム＆UA偽装取得モード ===');
  const today = new Date().toISOString().split('T')[0];

  const browser = await puppeteer.launch({
    headless: "new",
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  
  // User-Agentを一般的なPCブラウザに偽装
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  await page.setViewport({ width: 1280, height: 800 });

  for (const hall of TARGET_HALLS) {
    console.log(`\n▶ [${hall.name}] (ID: ${hall.id}) データ収集開始...`);
    const scrapedRecords = [];

    try {
      const hallUrl = `https://www.d-deltanet.com/pc/HallSelectLink.do?hallcode=${hall.id}`;
      await page.goto(hallUrl, { waitUntil: 'networkidle2', timeout: 30000 });

      // 全フレーム（iframe含む）からリンクを収集
      const collectedLinks = new Set();
      const frames = page.frames();

      for (const frame of frames) {
        try {
          const frameLinks = await frame.$$eval('a', anchors => {
            return anchors.map(a => {
              const href = a.getAttribute('href');
              if (!href || href.startsWith('javascript') || href === '#') return null;
              return href.startsWith('http') ? href : `https://www.d-deltanet.com/pc/${href.replace(/^\//, '')}`;
            }).filter(Boolean);
          });
          frameLinks.forEach(link => collectedLinks.add(link));
        } catch (e) {
          // フレームアクセスのエラーはスキップ
        }
      }

      const targetLinks = Array.from(collectedLinks);
      console.log(`[${hall.name}] 検出した対象リンク数: ${targetLinks.length} 個`);

      // リンクが取得できない場合のフォールバック（直接トップ画面を解析）
      if (targetLinks.length === 0) {
        targetLinks.push(hallUrl);
      }

      const limit = Math.min(targetLinks.length, 15);

      for (let i = 0; i < limit; i++) {
        try {
          await page.goto(targetLinks[i], { waitUntil: 'domcontentloaded', timeout: 20000 });

          // メイン画面＋フレーム両方からテキスト取得
          for (const frame of page.frames()) {
            const rows = await frame.$$eval('tr, div, td', elements => 
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
          }
        } catch (e) {
          // 個別ページの取得エラーは無視
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
