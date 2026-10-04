const { createClient } = require('@supabase/supabase-js');

let _db;
const db = () => (_db = _db || createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } }));

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  body: JSON.stringify(body)
});

const siteUrl = () => (process.env.SITE_URL || process.env.URL || '').replace(/\/$/, '');
const portalLink = (o) => `${siteUrl()}/portal.html?o=${encodeURIComponent(o.order_no)}&t=${o.access_token}`;

function parse(event) {
  try { return JSON.parse(event.body || '{}'); } catch { return {}; }
}

async function orderByToken(orderNo, token) {
  if (!orderNo || !token) return null;
  const { data } = await db().from('orders').select('*').eq('order_no', orderNo).eq('access_token', token).maybeSingle();
  return data || null;
}

async function logEvent(orderId, type, detail) {
  try { await db().from('events').insert({ order_id: orderId, type, detail }); } catch (_) {}
}

async function requireAdmin(event) {
  const h = event.headers.authorization || event.headers.Authorization || '';
  const jwt = h.startsWith('Bearer ') ? h.slice(7) : '';
  if (!jwt) return null;
  const { data, error } = await db().auth.getUser(jwt);
  if (error || !data.user) return null;
  const { data: row } = await db().from('admins').select('user_id').eq('user_id', data.user.id).maybeSingle();
  return row ? data.user : null;
}

module.exports = { db, json, siteUrl, portalLink, parse, orderByToken, logEvent, requireAdmin };
