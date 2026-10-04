const { db, json, orderByToken } = require('./_lib');
const { depositFor, STATUS_LABEL } = require('./_logic');

exports.handler = async (event) => {
  const q = event.queryStringParameters || {};
  const order = await orderByToken(q.o, q.t);
  if (!order) return json(404, { error: 'We could not find that order. Check your link.' });

  const [{ data: proofs }, { data: revs }, { data: pays }, { data: finals }] = await Promise.all([
    db().from('proofs').select('*').eq('order_id', order.id).order('version', { ascending: false }),
    db().from('revisions').select('version,action,comment,created_at').eq('order_id', order.id).order('created_at', { ascending: false }),
    db().from('payments').select('amount,paid_at,reference').eq('order_id', order.id).order('paid_at'),
    db().from('files').select('*').eq('order_id', order.id).eq('kind', 'final')
  ]);

  // Only low-resolution, watermarked previews are ever signed for the customer, and only for 2 minutes.
  const proofsOut = [];
  for (const p of proofs || []) {
    const pages = [];
    for (const pg of p.pages || []) {
      const { data } = await db().storage.from('previews').createSignedUrl(pg.preview, 120);
      if (data) pages.push(data.signedUrl);
    }
    proofsOut.push({ id: p.id, version: p.version, status: p.status, created_at: p.created_at, pages });
  }

  let finalFiles = [];
  if (order.payment_status === 'fully_paid' && order.final_released) {
    for (const f of finals || []) {
      const { data } = await db().storage.from(f.bucket).createSignedUrl(f.path, 300, { download: f.name || true });
      if (data) finalFiles.push({ name: f.name, url: data.signedUrl });
    }
  }

  const canPay = order.total && order.balance > 0 && (!order.custom_qty || order.quote_status === 'accepted');
  return json(200, {
    order: {
      order_no: order.order_no, customer_name: order.customer_name, size: order.size, cover: order.cover, qty: order.qty,
      custom_qty: order.custom_qty, total: order.total, discount: order.discount, amount_paid: order.amount_paid, balance: order.balance,
      payment_status: order.payment_status, status: order.status, status_label: STATUS_LABEL[order.status] || order.status,
      quote_status: order.quote_status, quote_note: order.quote_note, payment_plan: order.payment_plan,
      deposit: order.total ? depositFor(order.total) : null, can_pay: !!canPay, has_paid_any: order.amount_paid > 0,
      created_at: order.created_at, final_files: finalFiles
    },
    proofs: proofsOut, revisions: revs || [], payments: pays || []
  });
};
