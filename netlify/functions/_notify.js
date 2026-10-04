// Notifications. Every channel is optional: if its env vars are missing it is skipped and the skip is logged,
// so the admin dashboard can show what did and did not go out.
const { db, logEvent, portalLink } = require('./_lib');
const { naira, STATUS_LABEL } = require('./_logic');

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const intl = (p) => { const d = String(p || '').replace(/\D/g, ''); return d.startsWith('0') ? '234' + d.slice(1) : d; };

async function sendEmail(orderId, to, subject, html) {
  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) { await logEvent(orderId, 'email_skipped', { to, subject, reason: 'RESEND_API_KEY/EMAIL_FROM not set' }); return false; }
  if (!to) return false;
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [to], subject, html })
    });
    const ok = r.ok;
    await logEvent(orderId, ok ? 'email_sent' : 'email_failed', { to, subject, status: r.status });
    return ok;
  } catch (e) { await logEvent(orderId, 'email_failed', { to, subject, error: String(e) }); return false; }
}

// Needs a Meta WhatsApp Cloud API template with 9 body variables (see README).
async function sendWhatsAppAdmin(order, paymentLine) {
  const { WHATSAPP_TOKEN, WHATSAPP_PHONE_ID, ADMIN_WHATSAPP, WHATSAPP_TEMPLATE } = process.env;
  if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_ID || !ADMIN_WHATSAPP || !WHATSAPP_TEMPLATE) {
    await logEvent(order.id, 'whatsapp_skipped', { reason: 'WhatsApp Cloud API env vars not set' }); return false;
  }
  const pkg = `${order.size} ${order.cover} Cover`;
  const vars = [order.order_no, order.customer_name, pkg, `${order.qty} copies`, naira(order.total), naira(order.amount_paid), naira(order.balance), STATUS_LABEL[order.payment_status === 'fully_paid' ? 'fully_paid' : 'partially_paid'], order.phone];
  try {
    const r = await fetch(`https://graph.facebook.com/v21.0/${WHATSAPP_PHONE_ID}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp', to: intl(ADMIN_WHATSAPP), type: 'template',
        template: { name: WHATSAPP_TEMPLATE, language: { code: process.env.WHATSAPP_LANG || 'en' },
          components: [{ type: 'body', parameters: vars.map((v) => ({ type: 'text', text: String(v ?? '-') })) }] }
      })
    });
    const body = await r.text();
    await logEvent(order.id, r.ok ? 'whatsapp_sent' : 'whatsapp_failed', { status: r.status, body: body.slice(0, 300) });
    return r.ok;
  } catch (e) { await logEvent(order.id, 'whatsapp_failed', { error: String(e) }); return false; }
}

async function driveSync(order) {
  const url = process.env.DRIVE_WEBHOOK_URL;
  if (!url) return false;
  const { data: prior } = await db().from('events').select('id').eq('order_id', order.id).eq('type', 'drive_sync_ok').limit(1);
  const synced = !!(prior && prior.length); // files are copied once; later payments only refresh the order record and log row
  const { data: files } = synced ? { data: [] } : await db().from('files').select('*').eq('order_id', order.id).eq('uploaded', true);
  const out = [];
  for (const f of files || []) {
    const { data } = await db().storage.from(f.bucket).createSignedUrl(f.path, 60 * 60 * 24 * 3);
    if (data) out.push({ kind: f.kind, name: f.name, url: data.signedUrl });
  }
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'text/plain' },
      body: JSON.stringify({ secret: process.env.DRIVE_WEBHOOK_SECRET || '', order: {
        order_no: order.order_no, customer: order.customer_name, email: order.email, phone: order.phone,
        package: `${order.size} ${order.cover} Cover`, qty: order.qty, total: order.total, paid: order.amount_paid,
        balance: order.balance, payment_status: order.payment_status, details: order.details, colours: order.colours,
        created_at: order.created_at }, files: out }) });
    await logEvent(order.id, r.ok ? 'drive_sync_ok' : 'drive_sync_failed', { status: r.status, files: out.length });
    return r.ok;
  } catch (e) { await logEvent(order.id, 'drive_sync_failed', { error: String(e) }); return false; }
}

async function notifyPaid(order, payment) {
  const label = order.payment_status === 'fully_paid' ? 'FULLY PAID' : 'PARTIALLY PAID';
  const link = portalLink(order);
  const adminHtml = `<h2>New Graduation Jotter Order Payment</h2><p>Order ID: <b>${esc(order.order_no)}</b><br>Customer: ${esc(order.customer_name)}<br>Package: ${esc(order.size)} ${esc(order.cover)} Cover<br>Quantity: ${order.qty} copies<br>Total: ${naira(order.total)}<br>Paid: ${naira(order.amount_paid)}<br>Balance: ${naira(order.balance)}<br>Status: <b>${label}</b><br>Phone: ${esc(order.phone)}<br>This payment: ${naira(payment.amount)} (ref ${esc(payment.reference)})</p>`;
  const custHtml = `<h2>Thank you, ${esc(order.customer_name)}!</h2><p>We received your payment of <b>${naira(payment.amount)}</b> for order <b>${esc(order.order_no)}</b>.</p><p>Total: ${naira(order.total)}<br>Paid so far: ${naira(order.amount_paid)}<br>Balance: ${naira(order.balance)}<br>Status: <b>${label}</b></p><p><a href="${link}">Open your private order page</a> to track your order and view your design proofs. Keep this link private.</p><p>Vinexy Cre8tive Studios</p>`;
  await Promise.allSettled([
    sendWhatsAppAdmin(order),
    sendEmail(order.id, process.env.ADMIN_EMAIL, `New order payment ${order.order_no}: ${label}`, adminHtml),
    sendEmail(order.id, order.email, `Payment received for ${order.order_no}`, custHtml),
    driveSync(order)
  ]);
}

async function notifyAdminText(order, subject, text) {
  await sendEmail(order.id, process.env.ADMIN_EMAIL, `${subject} (${order.order_no})`, `<p>${esc(text)}</p><p>Customer: ${esc(order.customer_name)} ${esc(order.phone)}</p>`);
}

module.exports = { sendEmail, notifyPaid, notifyAdminText, esc, driveSync };
