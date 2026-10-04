// The ONLY place a Paystack payment becomes a payment record.
// Called by both the Paystack webhook and the customer's return page. The unique reference makes it idempotent.
const { db, logEvent } = require('./_lib');
const { notifyPaid } = require('./_notify');

async function settleReference(reference) {
  const { data: reqRow } = await db().from('payment_requests').select('*').eq('reference', reference).maybeSingle();
  if (!reqRow) return { ok: false, reason: 'unknown_reference' };

  const { data: existing } = await db().from('payments').select('id').eq('reference', reference).maybeSingle();
  if (existing) return { ok: true, already: true, orderId: reqRow.order_id };

  let v;
  try {
    const r = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` }
    });
    v = await r.json();
  } catch (e) { return { ok: false, retry: true, reason: 'paystack_unreachable' }; }

  if (!v || !v.status || !v.data) return { ok: false, retry: true, reason: 'paystack_bad_response' };
  if (v.data.status !== 'success') return { ok: false, reason: `transaction_${v.data.status}`, orderId: reqRow.order_id };
  if (v.data.currency !== 'NGN' || v.data.amount !== reqRow.amount * 100) {
    await logEvent(reqRow.order_id, 'payment_amount_mismatch', { reference, expected: reqRow.amount * 100, got: v.data.amount, currency: v.data.currency });
    return { ok: false, reason: 'amount_mismatch', orderId: reqRow.order_id };
  }

  const { error } = await db().from('payments').insert({
    order_id: reqRow.order_id, reference, amount: reqRow.amount, method: 'paystack', status: 'success',
    paid_at: v.data.paid_at || new Date().toISOString(), raw: { channel: v.data.channel, id: v.data.id }
  });
  if (error) {
    if (error.code === '23505') return { ok: true, already: true, orderId: reqRow.order_id }; // other caller won the race
    return { ok: false, retry: true, reason: 'db_error', orderId: reqRow.order_id };
  }

  const { data: order } = await db().from('orders').select('*').eq('id', reqRow.order_id).single();
  await logEvent(order.id, 'payment_recorded', { reference, amount: reqRow.amount, plan: reqRow.plan });
  await notifyPaid(order, { amount: reqRow.amount, reference });
  return { ok: true, orderId: order.id };
}

module.exports = { settleReference };
