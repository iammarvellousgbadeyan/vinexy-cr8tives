// Called by the portal when Paystack sends the customer back. Gives instant feedback; the webhook is the safety net.
const { db, json, parse, orderByToken } = require('./_lib');
const { settleReference } = require('./_settle');

exports.handler = async (event) => {
  const b = parse(event);
  const order = await orderByToken(b.o, b.t);
  if (!order) return json(404, { error: 'Order not found' });
  const { data: reqRow } = await db().from('payment_requests').select('order_id').eq('reference', b.ref).maybeSingle();
  if (!reqRow || reqRow.order_id !== order.id) return json(404, { error: 'Payment reference not found' });
  const r = await settleReference(b.ref);
  if (!r.ok && r.retry) return json(202, { status: 'pending', message: 'Still confirming your payment. This page will update shortly.' });
  if (!r.ok) return json(200, { status: 'failed', reason: r.reason });
  return json(200, { status: 'success' });
};
