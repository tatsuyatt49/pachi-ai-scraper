const axios = require('axios');
const cheerio = require('cheerio');

const TARGET_HALLS = [
  { name: 'パラッツォ船橋店パートII', id: '13130009' }
];

async function runDeltaNetScraper() {
  console.log('=== DeltaNet 内部テキスト構造 診断モード ===');
  const apiKey = process.env.SCRAPERAPI_KEY;

  if (!apiKey) {
    console.error('❌ SCRAPERAPI_KEY 未設定');
    return;
  }

  const hall = TARGET_HALLS[0];
  console.log(`\n▶ [${hall.name}] 診断開始...`);

  try {
    const hallUrl = `https://www.d-deltanet.com/pc/HallSelectLink.do?hallcode=${hall.id}`;
    const proxyHallUrl = `http://api.scraperapi.com?api_key=${apiKey}&url=${encodeURIComponent(hallUrl)}&country_code=jp`;

    const hallRes = await axios.get(proxyHallUrl, { timeout: 30000 });
    const $hall = cheerio.load(hallRes.data);

    // 機種ページのURLを収集
    const modelLinks = [];
    $hall('a').each((_, el) => {
      const href = $hall(el).attr('href');
      if (href && (href.includes('Dadata') || href.includes('Hall') || href.includes('do'))) {
        const fullUrl = href.startsWith('http') ? href : `https://www.d-deltanet.com/pc/${href.replace(/^\//, '')}`;
        if (!modelLinks.includes(fullUrl) && fullUrl !== hallUrl) {
          modelLinks.push(fullUrl);
        }
      }
    });

    console.log(`抽出したURL数: ${modelLinks.length}`);
    if (modelLinks.length > 0) {
      const targetUrl = modelLinks[0];
      console.log(`アクセス先URL: ${targetUrl}`);

      const proxyTargetUrl = `http://api.scraperapi.com?api_key=${apiKey}&url=${encodeURIComponent(targetUrl)}&country_code=jp`;
      const pageRes = await axios.get(proxyTargetUrl, { timeout: 30000 });
      const $page = cheerio.load(pageRes.data);

      console.log('\n--- ページから取得された生テキスト (一部抜粋) ---');
      const bodyText = $page('body').text().replace(/\s+/g, ' ').trim();
      console.log(bodyText.substring(0, 500));
      console.log('--------------------------------------------------\n');
    }
  } catch (error) {
    console.error('エラー:', error.message);
  }
}

runDeltaNetScraper();
