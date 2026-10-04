const { db, json, parse, portalLink } = require('./_lib');
const { orderNumber, checkFileMeta, safeName } = require('./_logic');
const { notifyAdminText } = require('./_notify');

const clean = (v, max = 2000) => String(v ?? '').trim().slice(0, max);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'POST only' });
  const b = parse(event);
  if (b.hp) return json(200, { ok: true }); // honeypot for bots

  const c = b.customer || {};
  const name = clean(c.name, 120), email = clean(c.email, 160).toLowerCase(), phone = clean(c.phone, 30);
  if (name.length < 2) return json(400, { error: 'Please enter your full name' });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json(400, { error: 'Please enter a valid email address' });
  if (phone.replace(/\D/g, '').length < 10) return json(400, { error: 'Please enter a valid phone number' });
  if (!['A5', 'A6'].includes(b.size) || !['Soft', 'Hard'].includes(b.cover)) return json(400, { error: 'Choose a size and cover type' });
  if (!b.details || b.details.rights !== true) return json(400, { error: 'Please confirm you have the right to use the uploaded photos' });

  const custom = b.custom === true;
  let qty, total = null, base = null;
  if (custom) {
    qty = parseInt(b.customQty, 10);
    if (!Number.isInteger(qty) || qty < 1 || qty > 100000) return json(400, { error: 'Enter a valid quantity' });
    if (qty === 50 || qty === 100) return json(400, { error: 'Use the 50 or 100 copy option for standard pricing' });
  } else {
    qty = parseInt(b.qty, 10);
    const { data: p } = await db().from('prices').select('price').eq('size', b.size).eq('cover', b.cover).eq('qty', qty).eq('active', true).maybeSingle();
    if (!p) return json(400, { error: 'That package is not available' });
    total = p.price; base = p.price;
  }

  const files = Array.isArray(b.files) ? b.files : [];
  const photos = files.filter((f) => f.field === 'photo'), refs = files.filter((f) => f.field === 'colour_ref');
  if (photos.length > 20 || refs.length > 1) return json(400, { error: 'Too many files (max 20 photos and 1 colour picture)' });
  for (const f of files) { const err = checkFileMeta(f); if (err) return json(400, { error: err }); }

  const { data: seq, error: seqErr } = await db().rpc('next_order_no');
  if (seqErr) return json(500, { error: 'Could not create order' });
  const order_no = orderNumber(seq, new Date().getFullYear());

  const d = b.details, col = b.colours || {};
  const row = {
    order_no, size: b.size, cover: b.cover, qty, custom_qty: custom, base_price: base, total,
    balance: total, quote_status: custom ? 'requested' : 'none',
    status: custom ? 'new_order' : 'payment_pending',
    customer_name: name, email, phone,
    details: {
      displayName: clean(d.displayName, 120), school: clean(d.school, 200), faculty: clean(d.faculty, 200), department: clean(d.department, 200),
      programme: clean(d.programme, 200), gradYear: clean(d.gradYear, 10), gradDate: clean(d.gradDate, 60), classSet: clean(d.classSet, 120),
      message: clean(d.message, 3000), handles: clean(d.handles, 300), extra: clean(d.extra, 3000), contactMethod: clean(d.contactMethod, 40),
      style: clean(d.style, 600), rightsConfirmedAt: new Date().toISOString()
    },
    colours: { picked: (Array.isArray(col.picked) ? col.picked : []).filter((x) => /^#[0-9a-fA-F]{6}$/.test(x)).slice(0, 5), description: clean(col.description, 600) }
  };
  const { data: order, error } = await db().from('orders').insert(row).select('*').single();
  if (error) return json(500, { error: 'Could not save order' });

  const uploads = [];
  const fileRows = [];
  let i = 0;
  for (const f of files) {
    const folder = f.field === 'photo' ? 'photos' : 'colour';
    const path = `${order_no}/${folder}/${String(++i).padStart(2, '0')}-${safeName(f.name)}`;
    const { data: s, error: se } = await db().storage.from('uploads').createSignedUploadUrl(path);
    if (se) return json(500, { error: 'Could not prepare upload' });
    uploads.push({ field: f.field, index: f.index, path, signedUrl: s.signedUrl, type: f.type });
    fileRows.push({ order_id: order.id, kind: f.field === 'photo' ? 'photo' : 'colour_ref', bucket: 'uploads', path, name: clean(f.name, 120) });
  }
  if (fileRows.length) await db().from('files').insert(fileRows);

  if (custom) await notifyAdminText(order, 'New custom quantity quote request', `${name} wants ${qty} copies of ${b.size} ${b.cover} cover. Open the admin dashboard to send a quote.`);

  return json(200, { order_no, token: order.access_token, portal: portalLink(order), custom, total, uploads });
};
