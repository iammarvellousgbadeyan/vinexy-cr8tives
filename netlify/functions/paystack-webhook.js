const { json } = require('./_lib');
const { verifyPaystackSignature } = require('./_logic');
const { settleReference } = require('./_settle');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'POST only' });
  const raw = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body;
  const sig = event.headers['x-paystack-signature'];
  if (!verifyPaystackSignature(raw, sig, process.env.PAYSTACK_SECRET_KEY)) return json(401, { error: 'Bad signature' });

  let evt; try { evt = JSON.parse(raw); } catch { return json(400, { error: 'Bad body' }); }
  if (evt.event === 'charge.success' && evt.data && evt.data.reference) {
    const r = await settleReference(evt.data.reference);
    if (!r.ok && r.retry) return json(500, { error: 'Temporary problem, please retry' }); // Paystack will resend
  }
  return json(200, { received: true });
};
