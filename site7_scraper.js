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
  console.log('=== site7 3店舗 台データ＆差枚 収集開始 (HTML解析版) ===');
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

      // Shift_JISの文字化けを防ぐため binary で取得
      const response = await axios.get(proxyApiUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Cookie': cookie || ''
        },
        responseType: 'arraybuffer',
        timeout: 30000
      });

      // Shift_JISからUTF-8へデコード
      const decoder = new TextDecoder('shift-jis');
      const htmlText = decoder.decode(response.data);

      // HTML解析
      const $ = cheerio.load(htmlText);
      const scrapedRecords = [];

      // テーブルやリスト要素から台データを抽出
      $('tr, .machine-item, .data-row').each((_, element) => {
        const text = $(element).text().replace(/\s+/g, ' ');
        
        // 台番号（数値3〜4桁）を含む行を特定
        const match = text.match(/(\d{3,4})\s*番台?/);
        if (match) {
          const machineNo = match[1];
          
          // 数値の抽出（G数、BB、RB）
          const numbers = text.match(/\d+/g) || [];
          const totalGames = Number(numbers[1] || 0);
          const bbCount = Number(numbers[2] || 0);
          const rbCount = Number(numbers[3] || 0);

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
      });

      console.log(`[${hall.name}] 抽出完了: ${scrapedRecords.length} 件`);

      if (supabase && scrapedRecords.length > 0) {
        const { error } = await supabase
          .from('site7_daidata')
          .upsert(scrapedRecords, { onConflict: 'date, hall_id, machine_no' });

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

  console.log('\n=== site7 全店舗のデータ収集終了 ===');
}

runSite7Scraper();
