const { db, json, parse, orderByToken, logEvent } = require('./_lib');
const { notifyAdminText } = require('./_notify');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'POST only' });
  const b = parse(event);
  const order = await orderByToken(b.o, b.t);
  if (!order) return json(404, { error: 'Order not found' });
  if (!['approve', 'revise', 'accept_quote'].includes(b.action)) return json(400, { error: 'Unknown action' });

  if (b.action === 'accept_quote') {
    if (order.quote_status !== 'sent' || !order.total) return json(409, { error: 'There is no quotation waiting for acceptance' });
    await db().from('orders').update({ quote_status: 'accepted', status: 'payment_pending', updated_at: new Date().toISOString() }).eq('id', order.id);
    await logEvent(order.id, 'quote_accepted', { total: order.total });
    await notifyAdminText(order, 'Quotation accepted', `Customer accepted the quote of ₦${order.total.toLocaleString('en-NG')}.`);
    return json(200, { ok: true });
  }

  const { data: latest } = await db().from('proofs').select('*').eq('order_id', order.id).order('version', { ascending: false }).limit(1).maybeSingle();
  if (!latest || latest.id !== b.proof_id) return json(409, { error: 'This is not the latest proof. Please refresh the page.' });
  if (latest.status !== 'sent') return json(409, { error: 'You have already responded to this proof.' });

  const comment = String(b.comment || '').trim().slice(0, 3000);
  if (b.action === 'revise' && comment.length < 5) return json(400, { error: 'Please describe the changes you want' });

  const approve = b.action === 'approve';
  await db().from('proofs').update({ status: approve ? 'approved' : 'revision_requested' }).eq('id', latest.id);
  await db().from('revisions').insert({ order_id: order.id, proof_id: latest.id, version: latest.version, action: approve ? 'approved' : 'revision_requested', comment: comment || null });
  await db().from('orders').update({ status: approve ? 'approved' : 'revision_requested', updated_at: new Date().toISOString() }).eq('id', order.id);
  await notifyAdminText(order, approve ? 'Design approved' : 'Revision requested', approve ? `Customer approved design v${latest.version}.` : `Revision on v${latest.version}: ${comment}`);
  return json(200, { ok: true });
};
