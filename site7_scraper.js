const axios = require('axios');
const cheerio = require('cheerio');
const { createClient } = require('@supabase/supabase-js');
const WebSocket = require('ws');

// Supabase初期化
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

async function runSite7Scraper() {
  console.log('=== site7 3店舗 台データ＆差枚 収集開始 (HTMLデバッグ調査版) ===');
  const today = new Date().toISOString().split('T')[0];
  const cookie = process.env.SITE7_COOKIE;
  const apiKey = process.env.SCRAPERAPI_KEY;

  if (!apiKey) {
    console.error('❌ エラー: SCRAPERAPI_KEY が設定されていません。');
    return;
  }

  for (const hall of TARGET_HALLS) {
    console.log(`\n▶ [${hall.name}] (ID: ${hall.id}) データ収集開始...`);

    try {
      const site7Url = `https://m.site777.jp/f/D0300.do?pmc=${hall.id}&clc=03`;
      const proxyApiUrl = `http://api.scraperapi.com?api_key=${apiKey}&url=${encodeURIComponent(site7Url)}&country_code=jp&keep_headers=true`;

      const response = await axios.get(proxyApiUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Cookie': cookie || ''
        },
        responseType: 'arraybuffer',
        timeout: 30000
      });

      const decoder = new TextDecoder('shift-jis');
      const htmlText = decoder.decode(response.data);
      const $ = cheerio.load(htmlText);

      // --- デバッグログ出力 ---
      console.log(`[${hall.name}] ページタイトル:`, $('title').text().trim());
      
      const bodyText = $('body').text().replace(/\s+/g, ' ').substring(0, 200);
      console.log(`[${hall.name}] 本文冒頭:`, bodyText);

      // テーブル行・リンク・DIV要素の数を確認
      console.log(`[${hall.name}] 発見したtr要素: ${$('tr').length}個 / a要素: ${$('a').length}個 / div: ${$('div').length}個`);

      const scrapedRecords = [];

      // 全ての要素から台番号っぽい記述を探す
      $('tr, div, li, a').each((_, element) => {
        const text = $(element).text().replace(/\s+/g, ' ');
        if (text.includes('番台') || text.includes('台番号') || /\b\d{3,4}\b/.test(text)) {
          const numbers = text.match(/\d+/g) || [];
          if (numbers.length >= 2) {
            const machineNo = numbers[0];
            const totalGames = Number(numbers[1] || 0);
            const bbCount = Number(numbers[2] || 0);
            const rbCount = Number(numbers[3] || 0);

            if (machineNo.length >= 3 && totalGames > 0) {
              scrapedRecords.push({
                date: today,
                hall_id: hall.id,
                hall_name: hall.name,
                machine_no: machineNo,
                model_name: '対象機種',
                total_games: totalGames,
                bb_count: bbCount,
                rb_count: rbCount,
                diff_coins: (bbCount * 240 + rbCount * 96) - (totalGames * 3),
                updated_at: new Date()
              });
            }
          }
        }
      });

      console.log(`[${hall.name}] 抽出結果: ${scrapedRecords.length} 件`);

      if (supabase && scrapedRecords.length > 0) {
        await supabase.from('site7_daidata').upsert(scrapedRecords, { onConflict: 'date, hall_id, machine_no' });
        console.log(`[${hall.name}] Supabaseへ保存成功！`);
      }
    } catch (error) {
      console.error(`[${hall.name}] 収集エラー:`, error.message);
    }
  }

  console.log('\n=== site7 全店舗のデータ収集終了 ===');
}

runSite7Scraper();
