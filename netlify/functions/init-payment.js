const crypto = require('crypto');
const { db, json, parse, orderByToken, siteUrl, logEvent } = require('./_lib');
const { amountDue } = require('./_logic');

// Confirms every registered upload really exists in storage before the customer is sent to pay.
async function verifyUploads(order) {
  const { data: rows } = await db().from('files').select('*').eq('order_id', order.id).eq('bucket', 'uploads');
  const missing = [];
  const folders = {};
  for (const r of rows || []) {
    if (r.uploaded) continue;
    const dir = r.path.slice(0, r.path.lastIndexOf('/'));
    if (!folders[dir]) {
      const { data } = await db().storage.from('uploads').list(dir, { limit: 100 });
      folders[dir] = new Set((data || []).map((x) => x.name));
    }
    const base = r.path.slice(r.path.lastIndexOf('/') + 1);
    if (folders[dir].has(base)) await db().from('files').update({ uploaded: true }).eq('id', r.id);
    else missing.push({ path: r.path, name: r.name });
  }
  return missing;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'POST only' });
  const b = parse(event);
  const order = await orderByToken(b.o, b.t);
  if (!order) return json(404, { error: 'Order not found' });

  if (order.custom_qty && order.quote_status !== 'accepted') return json(409, { error: 'Please accept your quotation before paying' });

  const missing = await verifyUploads(order);
  if (missing.length) return json(409, { error: 'Some files did not finish uploading', missing });

  const due = amountDue({ total: order.total, amountPaid: order.amount_paid, plan: b.plan });
  if (due.error) return json(400, { error: due.error });

  const reference = `${order.order_no}-${crypto.randomBytes(4).toString('hex')}`;
  const { error: reqErr } = await db().from('payment_requests').insert({ reference, order_id: order.id, amount: due.amount, plan: due.plan });
  if (reqErr) return json(500, { error: 'Could not start payment' });

  const callback = `${siteUrl()}/portal.html?o=${encodeURIComponent(order.order_no)}&t=${order.access_token}&ref=${encodeURIComponent(reference)}`;
  let res;
  try {
    const r = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ email: order.email, amount: due.amount * 100, currency: 'NGN', reference, callback_url: callback,
        metadata: { order_no: order.order_no, plan: due.plan, customer: order.customer_name } })
    });
    res = await r.json();
  } catch (e) { return json(502, { error: 'Payment service is unreachable. Please try again.' }); }
  if (!res.status) { await logEvent(order.id, 'paystack_init_failed', { message: res.message }); return json(502, { error: 'Could not start payment. Please try again.' }); }

  if (order.amount_paid === 0) await db().from('orders').update({ payment_plan: due.plan === 'full' ? 'full' : 'deposit', status: 'payment_pending', updated_at: new Date().toISOString() }).eq('id', order.id);
  return json(200, { url: res.data.authorization_url, reference, amount: due.amount });
};
