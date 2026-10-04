// Admin-only actions that need server power (image processing, emails, payment recording). Requires a Supabase admin login.
const sharp = require('sharp');
const { db, json, parse, requireAdmin, portalLink, logEvent } = require('./_lib');
const { sendEmail, notifyPaid, esc } = require('./_notify');
const { naira } = require('./_logic');

const wmSvg = (w, h, text) => {
  const step = 260, rows = [];
  for (let y = 40; y < h + step; y += step) for (let x = -step; x < w + step; x += step * 1.3)
    rows.push(`<text x="${x + ((y / step) % 2) * 130}" y="${y}" transform="rotate(-28 ${x} ${y})" font-family="Arial" font-size="26" font-weight="700" fill="rgba(255,255,255,.38)" stroke="rgba(0,0,0,.25)" stroke-width="1">${esc(text)}</text>`);
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${rows.join('')}</svg>`);
};

async function processProof(body) {
  const { data: order } = await db().from('orders').select('*').eq('id', body.order_id).single();
  if (!order) return [404, { error: 'Order not found' }];
  const originals = Array.isArray(body.originals) ? body.originals : [];
  if (!originals.length || originals.length > 40) return [400, { error: 'Add between 1 and 40 page images' }];

  const { data: last } = await db().from('proofs').select('version').eq('order_id', order.id).order('version', { ascending: false }).limit(1).maybeSingle();
  const version = (last ? last.version : 0) + 1;
  const pages = [];
  for (let i = 0; i < originals.length; i++) {
    const p = originals[i];
    if (!p.startsWith(`${order.order_no}/`)) return [400, { error: 'Original files must be stored under this order' }];
    const { data: blob, error } = await db().storage.from('production').download(p);
    if (error) return [400, { error: `Could not read ${p}` }];
    const input = Buffer.from(await blob.arrayBuffer());
    const resized = await sharp(input).rotate().resize({ width: 1000, withoutEnlargement: true }).toBuffer({ resolveWithObject: true });
    const { width, height } = resized.info;
    const out = await sharp(resized.data)
      .composite([{ input: wmSvg(width, height, `${order.order_no} · VINEXY PROOF · NOT FOR PRINT`) }])
      .jpeg({ quality: 55 }).toBuffer();
    const previewPath = `${order.order_no}/v${version}/page-${String(i + 1).padStart(2, '0')}.jpg`;
    const { error: ue } = await db().storage.from('previews').upload(previewPath, out, { contentType: 'image/jpeg', upsert: true });
    if (ue) return [500, { error: 'Could not save preview' }];
    pages.push({ preview: previewPath, original: p });
  }
  await db().from('proofs').insert({ order_id: order.id, version, pages, status: 'sent' });
  await db().from('orders').update({ status: 'design_proof_sent', updated_at: new Date().toISOString() }).eq('id', order.id);
  await sendEmail(order.id, order.email, `Your design proof is ready (${order.order_no})`,
    `<p>Hi ${esc(order.customer_name)}, your design proof (version ${version}) is ready.</p><p><a href="${portalLink(order)}">Open your private order page</a> to view it, approve it or request changes.</p><p>Vinexy Cre8tive Studios</p>`);
  return [200, { ok: true, version, pages: pages.length }];
}

async function sendQuote(body) {
  const { data: order } = await db().from('orders').select('*').eq('id', body.order_id).single();
  if (!order) return [404, { error: 'Order not found' }];
  const qty = parseInt(body.qty, 10), price = parseInt(body.price, 10), discount = parseInt(body.discount || 0, 10);
  if (![qty, price, discount].every(Number.isInteger) || qty < 1 || price < 1 || discount < 0 || discount >= price) return [400, { error: 'Enter a valid quantity, price and discount (whole naira)' }];
  const total = price - discount;
  if (total <= order.amount_paid) return [400, { error: 'Quote total must be more than what the customer has already paid' }];
  await db().from('orders').update({
    qty, custom_qty: true, base_price: price, discount, total, balance: total - order.amount_paid,
    quote_status: 'sent', quote_note: String(body.note || '').slice(0, 1500), updated_at: new Date().toISOString()
  }).eq('id', order.id);
  await sendEmail(order.id, order.email, `Your quotation ${order.order_no}`,
    `<p>Hi ${esc(order.customer_name)}, here is your quotation for ${qty} copies (${esc(order.size)} ${esc(order.cover)} cover):</p><p>Price: ${naira(price)}<br>Discount: ${naira(discount)}<br><b>Total: ${naira(total)}</b></p>${body.note ? `<p>${esc(body.note)}</p>` : ''}<p><a href="${portalLink(order)}">Open your order page</a> to accept the quotation and pay.</p>`);
  return [200, { ok: true, total }];
}

async function recordPayment(body, user) {
  const { data: order } = await db().from('orders').select('*').eq('id', body.order_id).single();
  if (!order || !order.total) return [400, { error: 'Order has no payable total yet' }];
  const amount = parseInt(body.amount, 10);
  if (!Number.isInteger(amount) || amount < 1) return [400, { error: 'Enter the amount received in whole naira' }];
  if (amount > order.balance) return [400, { error: `Amount is more than the balance (${naira(order.balance)})` }];
  const reference = `MANUAL-${order.order_no}-${Date.now()}`;
  const { error } = await db().from('payments').insert({ order_id: order.id, reference, amount, method: String(body.method || 'bank_transfer').slice(0, 30), confirmed_by: user.id, raw: { note: String(body.note || '').slice(0, 300) } });
  if (error) return [500, { error: 'Could not record payment' }];
  const { data: fresh } = await db().from('orders').select('*').eq('id', order.id).single();
  await logEvent(order.id, 'manual_payment', { amount, by: user.email });
  await notifyPaid(fresh, { amount, reference });
  return [200, { ok: true }];
}

async function resendLink(body) {
  const { data: order } = await db().from('orders').select('*').eq('id', body.order_id).single();
  if (!order) return [404, { error: 'Order not found' }];
  const ok = await sendEmail(order.id, order.email, `Your private order page ${order.order_no}`, `<p>Hi ${esc(order.customer_name)}, here is your private order page: <a href="${portalLink(order)}">${esc(order.order_no)}</a>. Keep it private.</p>`);
  return [200, { ok, link: portalLink(order) }];
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'POST only' });
  const user = await requireAdmin(event);
  if (!user) return json(401, { error: 'Admin login required' });
  const b = parse(event);
  try {
    const map = { process_proof: () => processProof(b), send_quote: () => sendQuote(b), record_payment: () => recordPayment(b, user), resend_link: () => resendLink(b) };
    if (!map[b.action]) return json(400, { error: 'Unknown action' });
    const [code, body] = await map[b.action]();
    return json(code, body);
  } catch (e) { return json(500, { error: 'Server error', detail: String(e).slice(0, 200) }); }
};
