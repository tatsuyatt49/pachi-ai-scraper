import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import ws from 'ws';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('エラー: .env ファイルに SUPABASE_URL または SUPABASE_SERVICE_ROLE_KEY が設定されていません。');
  process.exit(1);
}

// Node.js 20用に ws をオプションで明示的に渡す
const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
  global: { fetch: fetch },
  realtime: { transport: ws }
});

async function testConnection() {
  console.log('Supabaseへの接続をテスト中...');
  const { data, error } = await supabase.from('posts').select('*').limit(1);
  
  if (error) {
    console.error('接続エラー:', error.message);
  } else {
    console.log('接続成功！データ取得結果:', data);
  }
}

testConnection();