// Fresh signed upload URLs for files that belong to this order and failed to upload the first time.
const { db, json, parse, orderByToken } = require('./_lib');

exports.handler = async (event) => {
  const b = parse(event);
  const order = await orderByToken(b.o, b.t);
  if (!order) return json(404, { error: 'Order not found' });
  const { data: rows } = await db().from('files').select('path').eq('order_id', order.id).eq('uploaded', false);
  const allowed = new Set((rows || []).map((r) => r.path));
  const out = [];
  for (const p of Array.isArray(b.paths) ? b.paths : []) {
    if (!allowed.has(p)) continue;
    await db().storage.from('uploads').remove([p]); // clear any partial object so the upload can be repeated
    const { data } = await db().storage.from('uploads').createSignedUploadUrl(p);
    if (data) out.push({ path: p, signedUrl: data.signedUrl });
  }
  return json(200, { uploads: out });
};
