// Public values only. The anon key is designed to be public; access is enforced by row level security.
const { json } = require('./_lib');
exports.handler = async () => json(200, { url: process.env.SUPABASE_URL, anonKey: process.env.SUPABASE_ANON_KEY });
