(async function () {
  const FN = '/.netlify/functions/';
  const N = (n) => '₦' + Number(n || 0).toLocaleString('en-NG');
  const app = document.getElementById('app');
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const LABEL = { new_order: 'New Order', payment_pending: 'Payment Pending', partially_paid: 'Partially Paid', fully_paid: 'Fully Paid', information_received: 'Information Received', design_in_progress: 'Design in Progress', design_proof_sent: 'Design Proof Sent', revision_requested: 'Revision Requested', awaiting_approval: 'Awaiting Approval', approved: 'Approved', in_production: 'In Production', completed: 'Completed' };
  const PAYL = { pending: 'Not paid', partially_paid: 'Partially paid', fully_paid: 'Fully paid' };
  const safe = (n) => String(n).replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80);

  const cfg = await (await fetch(FN + 'config')).json();
  const sb = window.supabase.createClient(cfg.url, cfg.anonKey);
  const call = async (action, body) => {
    const { data: { session } } = await sb.auth.getSession();
    const r = await fetch(FN + 'admin', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + session.access_token }, body: JSON.stringify({ action, ...body }) });
    const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Request failed'); return j;
  };

  let orders = [], filt = { q: '', pay: '', st: '' }, tab = 'orders', openId = null;

  document.getElementById('out').onclick = async () => { await sb.auth.signOut(); location.reload(); };
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return loginView();
  const { data: adm } = await sb.from('admins').select('user_id').maybeSingle();
  if (!adm) { app.textContent = ''; app.appendChild(el('div', 'panel', 'This account is not an administrator. Ask the owner to add you to the admins table.')); document.getElementById('out').hidden = false; return; }
  document.getElementById('who').textContent = session.user.email + ' '; document.getElementById('out').hidden = false;
  await loadOrders(); shell();

  function loginView() {
    app.textContent = ''; const p = el('div', 'panel'); p.style.maxWidth = '420px'; p.appendChild(el('h2', '', 'Admin sign in'));
    const e = el('input'); e.type = 'email'; e.placeholder = 'Email'; e.autocomplete = 'username'; e.setAttribute('aria-label', 'Email');
    const w = el('input'); w.type = 'password'; w.placeholder = 'Password'; w.autocomplete = 'current-password'; w.setAttribute('aria-label', 'Password'); w.style.marginTop = '10px';
    const err = el('div', 'err'); const b = el('button', 'btn', 'Sign in'); b.style.marginTop = '12px';
    b.onclick = async () => { b.disabled = true; const { error } = await sb.auth.signInWithPassword({ email: e.value, password: w.value }); if (error) { err.textContent = 'Sign in failed. Check your email and password.'; b.disabled = false; } else location.reload(); };
    p.append(e, w, err, b); app.appendChild(p);
  }

  async function loadOrders() {
    const { data, error } = await sb.from('orders').select('*').order('created_at', { ascending: false }).limit(1000);
    if (error) { app.textContent = 'Could not load orders: ' + error.message; return; } orders = data;
  }

  function shell() {
    app.textContent = '';
    const tabs = el('div', 'tabs');
    [['orders', 'Orders'], ['prices', 'Package prices']].forEach(([k, l]) => { const b = el('button', 'btn sm' + (tab === k ? '' : ' ghost'), l); b.onclick = () => { tab = k; openId = null; shell(); }; tabs.appendChild(b); });
    app.appendChild(tabs);
    if (tab === 'prices') return pricesView();
    if (openId) return detailView(orders.find((o) => o.id === openId));
    listView();
  }

  function listView() {
    const paid = orders.filter((o) => o.total);
    const outstanding = paid.reduce((s, o) => s + (o.balance || 0), 0);
    const stats = el('div', 'stats');
    [['Orders', orders.length], ['Awaiting payment', orders.filter((o) => o.payment_status === 'pending' && o.total).length], ['Partially paid', orders.filter((o) => o.payment_status === 'partially_paid').length], ['Fully paid', orders.filter((o) => o.payment_status === 'fully_paid').length], ['Quotes to send', orders.filter((o) => o.quote_status === 'requested').length], ['Outstanding balances', N(outstanding)], ['Collected', N(orders.reduce((s, o) => s + o.amount_paid, 0))]].forEach(([a, b]) => { const d = el('div'); d.appendChild(el('small', '', a)); d.appendChild(el('b', '', String(b))); stats.appendChild(d); });
    app.appendChild(stats);

    const bar = el('div', 'bar');
    const s = el('input'); s.placeholder = 'Search name, order ID, phone, school'; s.value = filt.q; s.setAttribute('aria-label', 'Search');
    const ps = el('select'); ps.setAttribute('aria-label', 'Payment status'); [['', 'All payment statuses'], ['pending', 'Not paid'], ['partially_paid', 'Partially paid'], ['fully_paid', 'Fully paid']].forEach(([v, l]) => { const o = el('option', '', l); o.value = v; ps.appendChild(o); }); ps.value = filt.pay;
    const ss = el('select'); ss.setAttribute('aria-label', 'Order status'); const all = el('option', '', 'All order statuses'); all.value = ''; ss.appendChild(all); Object.entries(LABEL).forEach(([v, l]) => { const o = el('option', '', l); o.value = v; ss.appendChild(o); }); ss.value = filt.st;
    [s, ps, ss].forEach((x) => { const d = el('div'); d.appendChild(x); bar.appendChild(d); });
    app.appendChild(bar);
    const body = el('div', 'sc'); app.appendChild(body);
    const draw = () => {
      body.textContent = ''; filt = { q: s.value.toLowerCase(), pay: ps.value, st: ss.value };
      const rows = orders.filter((o) => (!filt.pay || o.payment_status === filt.pay) && (!filt.st || o.status === filt.st) &&
        (!filt.q || [o.customer_name, o.order_no, o.phone, o.email, o.details.school].join(' ').toLowerCase().includes(filt.q)));
      const t = el('table', 'ot'); const th = el('tr'); ['Order', 'Customer', 'Package', 'Copies', 'Total', 'Paid', 'Balance', 'Payment', 'Status', 'Date'].forEach((h) => th.appendChild(el('th', '', h))); t.appendChild(th);
      rows.forEach((o) => { const tr = el('tr', 'row'); tr.tabIndex = 0;
        [o.order_no, o.customer_name, `${o.size} ${o.cover}`, o.qty + (o.custom_qty ? ' *' : ''), o.total ? N(o.total) : (o.quote_status === 'requested' ? 'QUOTE NEEDED' : '-'), N(o.amount_paid), o.total ? N(o.balance) : '-', PAYL[o.payment_status], LABEL[o.status] || o.status, new Date(o.created_at).toLocaleDateString('en-NG')].forEach((v) => tr.appendChild(el('td', '', v)));
        tr.onclick = () => { openId = o.id; shell(); }; tr.onkeydown = (e) => { if (e.key === 'Enter') tr.onclick(); }; t.appendChild(tr); });
      body.appendChild(t); if (!rows.length) body.appendChild(el('p', 'hint', 'No orders match.'));
    };
    [s, ps, ss].forEach((x) => (x.oninput = x.onchange = draw)); draw();
  }

  async function detailView(o) {
    const back = el('button', 'btn sm ghost', '← All orders'); back.onclick = async () => { openId = null; await loadOrders(); shell(); }; app.appendChild(back);
    const title = el('h2', '', `${o.order_no} · ${o.customer_name}`); title.style.marginTop = '14px'; app.appendChild(title);
    const flash = el('div', 'err'); app.appendChild(flash);
    const msg = (t, ok) => { flash.textContent = t; flash.className = 'err' + (ok ? ' okmsg' : ''); };
    const refresh = async () => { await loadOrders(); shell(); };
    const grid = el('div', 'det'); app.appendChild(grid);

    const kv = (parent, pairs) => { const t = el('table', 'rev'); const b = el('tbody'); pairs.forEach(([a, c]) => { const tr = el('tr'); tr.appendChild(el('td', '', a)); tr.appendChild(el('td', '', c || '-')); b.appendChild(tr); }); t.appendChild(b); parent.appendChild(t); };

    // order + payment
    const c1 = el('div', 'panel'); c1.appendChild(el('h3', '', 'Order and payment'));
    kv(c1, [['Package', `${o.size} ${o.cover} Cover, ${o.qty} copies${o.custom_qty ? ' (custom)' : ''}`], ['Total', o.total ? N(o.total) : 'Not quoted yet'], ['Discount', N(o.discount)], ['Paid', N(o.amount_paid)], ['Balance', o.total ? N(o.balance) : '-'], ['Payment status', PAYL[o.payment_status]], ['Payment plan', o.payment_plan || '-'], ['Quote', o.quote_status]]);
    const stSel = el('select'); Object.entries(LABEL).forEach(([v, l]) => { const op = el('option', '', l); op.value = v; stSel.appendChild(op); }); stSel.value = o.status; stSel.setAttribute('aria-label', 'Order status');
    const stBtn = el('button', 'btn sm', 'Update status'); stBtn.onclick = async () => { const { error } = await sb.from('orders').update({ status: stSel.value, updated_at: new Date().toISOString() }).eq('id', o.id); error ? msg(error.message) : (msg('Status updated', 1), refresh()); };
    const sr = el('div', 'bar'); sr.style.marginTop = '12px'; const d1 = el('div'); d1.appendChild(stSel); sr.append(d1, stBtn); c1.appendChild(sr);
    grid.appendChild(c1);

    // customer
    const c2 = el('div', 'panel'); c2.appendChild(el('h3', '', 'Customer and graduation'));
    const d = o.details; kv(c2, [['Phone', o.phone], ['Email', o.email], ['Contact via', d.contactMethod], ['Name on jotter', d.displayName], ['School', d.school], ['Faculty', d.faculty], ['Department', d.department], ['Programme', d.programme], ['Year', d.gradYear], ['Date', d.gradDate], ['Class/set', d.classSet], ['Message', d.message], ['Handles', d.handles], ['Other info', d.extra], ['Colour notes', o.colours.description]]);
    const sw = el('div'); (o.colours.picked || []).forEach((c) => { const s = el('span', 'dot'); s.style.background = c; s.title = c; sw.appendChild(s); sw.appendChild(el('span', 'mono', c + ' '))}); c2.appendChild(sw);
    const links = el('div', 'bar'); links.style.marginTop = '12px';
    const wa = el('a', 'btn sm ghost', 'WhatsApp customer'); wa.href = `https://wa.me/${(o.phone.replace(/\D/g, '').replace(/^0/, '234'))}?text=${encodeURIComponent(`Hello ${o.customer_name}, this is Vinexy Cre8tive Studios about order ${o.order_no}.`)}`; wa.target = '_blank'; wa.rel = 'noopener';
    const cp = el('button', 'btn sm ghost', 'Copy customer link'); cp.onclick = () => { navigator.clipboard.writeText(`${location.origin}/portal.html?o=${o.order_no}&t=${o.access_token}`); msg('Link copied', 1); };
    const rs = el('button', 'btn sm ghost', 'Email link to customer'); rs.onclick = async () => { try { const r = await call('resend_link', { order_id: o.id }); msg(r.ok ? 'Email sent' : 'Email not configured or failed. Use Copy customer link.', r.ok); } catch (e) { msg(e.message); } };
    links.append(wa, cp, rs); c2.appendChild(links); grid.appendChild(c2);

    // quote
    if (o.custom_qty) {
      const q = el('div', 'panel'); q.appendChild(el('h3', '', 'Custom quotation')); q.appendChild(el('p', 'hint', `Requested: ${o.qty} copies. Quote status: ${o.quote_status}. Enter the full price for the quantity, then any discount. Deposit and balance are calculated automatically.`));
      const g = el('div', 'grid2'); const mk = (l, v) => { const w = el('div'); w.appendChild(el('label', '', l)); const i = el('input'); i.type = 'number'; i.min = 0; i.value = v ?? ''; w.appendChild(i); g.appendChild(w); return i; };
      const qq = mk('Quantity', o.qty), qp = mk('Price for this quantity (₦)', o.base_price), qd = mk('Discount (₦)', o.discount || 0);
      const nt = el('textarea'); nt.placeholder = 'Note to customer (optional)'; nt.value = o.quote_note || ''; nt.className = 'full'; g.appendChild(nt);
      const prev = el('p', 'hint'); const upd = () => { const t = (parseInt(qp.value, 10) || 0) - (parseInt(qd.value, 10) || 0); prev.textContent = t > 0 ? `Total ${N(t)} · 60% deposit ${N(Math.round(t * 0.6))} · balance ${N(t - Math.round(t * 0.6))}` : ''; }; qp.oninput = qd.oninput = upd; upd();
      const sb2 = el('button', 'btn sm', o.quote_status === 'sent' || o.quote_status === 'accepted' ? 'Update and resend quotation' : 'Send quotation'); sb2.onclick = async () => { try { sb2.disabled = true; await call('send_quote', { order_id: o.id, qty: qq.value, price: qp.value, discount: qd.value, note: nt.value }); msg('Quotation sent', 1); refresh(); } catch (e) { msg(e.message); sb2.disabled = false; } };
      q.append(g, prev, sb2); app.appendChild(q);
    }

    // manual payment
    if (o.total && o.balance > 0) {
      const p = el('div', 'panel'); p.appendChild(el('h3', '', 'Confirm a payment received outside Paystack')); p.appendChild(el('p', 'hint', 'For bank transfers or cash. Only record money you have actually received. This updates the payment status.'));
      const a = el('input'); a.type = 'number'; a.min = 1; a.max = o.balance; a.placeholder = `Amount (max ${N(o.balance)})`; a.setAttribute('aria-label', 'Amount');
      const m = el('select'); ['bank_transfer', 'cash', 'pos'].forEach((x) => m.appendChild(el('option', '', x)));
      const nt = el('input'); nt.placeholder = 'Note (e.g. transfer from J. Doe)';
      const b = el('button', 'btn sm', 'Record payment'); b.onclick = async () => { if (!confirm(`Record ${N(a.value)} received?`)) return; try { b.disabled = true; await call('record_payment', { order_id: o.id, amount: a.value, method: m.value, note: nt.value }); msg('Payment recorded', 1); refresh(); } catch (e) { msg(e.message); b.disabled = false; } };
      const r = el('div', 'bar'); [a, m, nt].forEach((x) => { const dd = el('div'); dd.appendChild(x); r.appendChild(dd); }); r.appendChild(b); p.appendChild(r); app.appendChild(p);
    }

    // uploads from customer
    const up = el('div', 'panel'); up.appendChild(el('h3', '', 'Customer uploads')); app.appendChild(up);
    const { data: files } = await sb.from('files').select('*').eq('order_id', o.id).order('created_at');
    const cust = (files || []).filter((f) => f.kind !== 'final');
    if (!cust.length) up.appendChild(el('p', 'hint', 'No files.'));
    else {
      const { data: urls } = await sb.storage.from('uploads').createSignedUrls(cust.map((f) => f.path), 3600);
      ['photo', 'colour_ref'].forEach((k) => { const list = cust.filter((f) => f.kind === k); if (!list.length) return; up.appendChild(el('p', 'lbl', k === 'photo' ? `Photos (${list.length})` : 'Colour reference')); const im = el('div', 'imgs');
        list.forEach((f) => { const u = (urls || []).find((x) => x.path === f.path); const a = el('a'); if (u && u.signedUrl) { a.href = u.signedUrl; a.target = '_blank'; a.rel = 'noopener'; const i = el('img'); i.src = u.signedUrl; i.alt = f.name || 'upload'; i.loading = 'lazy'; a.appendChild(i); } else a.appendChild(el('span', 'ev bad', f.name + ' (missing)')); if (!f.uploaded) a.title = 'Upload not confirmed'; im.appendChild(a); }); up.appendChild(im); });
    }

    // proofs
    const pr = el('div', 'panel'); pr.appendChild(el('h3', '', 'Design proofs')); app.appendChild(pr);
    const { data: proofs } = await sb.from('proofs').select('*').eq('order_id', o.id).order('version', { ascending: false });
    (proofs || []).forEach((p) => pr.appendChild(el('p', '', `v${p.version} · ${p.pages.length} page(s) · ${p.status.replace('_', ' ')} · ${new Date(p.created_at).toLocaleString('en-NG')}`)));
    pr.appendChild(el('p', 'hint', 'Upload each page of the design as a JPG or PNG (export from your design tool). We store the originals privately, then create low-resolution watermarked previews for the customer and email them. Uploading creates a new version.'));
    const pf = el('input'); pf.type = 'file'; pf.multiple = true; pf.accept = 'image/jpeg,image/png'; pf.setAttribute('aria-label', 'Proof pages');
    const pb = el('button', 'btn sm', 'Upload proof and notify customer'); pb.style.marginTop = '8px';
    pb.onclick = async () => {
      const fl = Array.from(pf.files).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })); if (!fl.length) return msg('Choose the page images first.');
      try {
        pb.disabled = true; const stamp = Date.now(); const paths = [];
        for (let i = 0; i < fl.length; i++) { msg(`Uploading ${i + 1} of ${fl.length}…`, 1); const path = `${o.order_no}/proofs/${stamp}/${String(i + 1).padStart(2, '0')}-${safe(fl[i].name)}`; const { error } = await sb.storage.from('production').upload(path, fl[i], { contentType: fl[i].type }); if (error) throw new Error(error.message); paths.push(path); }
        msg('Creating protected previews…', 1); const r = await call('process_proof', { order_id: o.id, originals: paths }); msg(`Proof v${r.version} sent to customer`, 1); refresh();
      } catch (e) { msg(e.message); pb.disabled = false; }
    };
    pr.append(pf, el('br'), pb);

    // final files
    const fp = el('div', 'panel'); fp.appendChild(el('h3', '', 'Final production files')); app.appendChild(fp);
    (files || []).filter((f) => f.kind === 'final').forEach((f) => fp.appendChild(el('p', '', f.name)));
    fp.appendChild(el('p', 'hint', `Customer can download these only when the order is Fully Paid and you tick Release. Currently: ${o.final_released ? 'released' : 'not released'}${o.payment_status === 'fully_paid' ? '' : ' (order not fully paid)'}.`));
    const ff = el('input'); ff.type = 'file'; ff.multiple = true; ff.setAttribute('aria-label', 'Final files');
    const fb = el('button', 'btn sm', 'Upload final files'); fb.onclick = async () => { try { fb.disabled = true; for (const f of Array.from(ff.files)) { const path = `${o.order_no}/final/${Date.now()}-${safe(f.name)}`; const { error } = await sb.storage.from('production').upload(path, f); if (error) throw new Error(error.message); await sb.from('files').insert({ order_id: o.id, kind: 'final', bucket: 'production', path, name: f.name, uploaded: true }); } msg('Final files uploaded', 1); refresh(); } catch (e) { msg(e.message); fb.disabled = false; } };
    const rl = el('button', 'btn sm ghost', o.final_released ? 'Withdraw release' : 'Release to customer'); rl.onclick = async () => { await sb.from('orders').update({ final_released: !o.final_released }).eq('id', o.id); refresh(); };
    const fr = el('div', 'bar'); fr.append(ff, fb, rl); fp.appendChild(fr);

    // history
    const hist = el('div', 'panel'); hist.appendChild(el('h3', '', 'Revisions, payments and activity')); app.appendChild(hist);
    const [{ data: revs }, { data: pays }, { data: evs }] = await Promise.all([
      sb.from('revisions').select('*').eq('order_id', o.id).order('created_at', { ascending: false }),
      sb.from('payments').select('*').eq('order_id', o.id).order('paid_at'),
      sb.from('events').select('*').eq('order_id', o.id).order('created_at', { ascending: false }).limit(40)]);
    hist.appendChild(el('p', 'lbl', 'Revision history')); (revs || []).forEach((r) => hist.appendChild(el('p', '', `${new Date(r.created_at).toLocaleString('en-NG')} · v${r.version} · ${r.action}${r.comment ? ': ' + r.comment : ''}`))); if (!(revs || []).length) hist.appendChild(el('p', 'hint', 'None yet.'));
    hist.appendChild(el('p', 'lbl', 'Payments')); (pays || []).forEach((p) => hist.appendChild(el('p', '', `${new Date(p.paid_at).toLocaleString('en-NG')} · ${N(p.amount)} · ${p.method} · ${p.reference}`))); if (!(pays || []).length) hist.appendChild(el('p', 'hint', 'No verified payments yet.'));
    hist.appendChild(el('p', 'lbl', 'Activity and notifications (check for failed or skipped ones)')); (evs || []).forEach((e) => hist.appendChild(el('p', 'ev' + (/failed|mismatch/.test(e.type) ? ' bad' : ''), `${new Date(e.created_at).toLocaleString('en-NG')} · ${e.type}${e.detail && e.detail.reason ? ' · ' + e.detail.reason : ''}`)));
  }

  async function pricesView() {
    const { data } = await sb.from('prices').select('*').order('size').order('cover').order('qty');
    app.appendChild(el('p', 'hint', 'Changing a price here updates the website immediately. It affects new orders only. Existing orders keep the price they were created with.'));
    const t = el('table', 'ot'); const th = el('tr'); ['Package', 'Copies', 'Price (₦)', 'Active', ''].forEach((h) => th.appendChild(el('th', '', h))); t.appendChild(th);
    (data || []).forEach((p) => { const tr = el('tr'); tr.appendChild(el('td', '', `${p.size} ${p.cover} Cover`)); tr.appendChild(el('td', '', p.qty));
      const pi = el('input'); pi.type = 'number'; pi.min = 1; pi.value = p.price; pi.setAttribute('aria-label', `Price ${p.size} ${p.cover} ${p.qty}`); const ac = el('input'); ac.type = 'checkbox'; ac.checked = p.active; ac.setAttribute('aria-label', 'Active');
      const b = el('button', 'btn sm', 'Save'); const st = el('span', 'ev'); b.onclick = async () => { const v = parseInt(pi.value, 10); if (!v || v < 1) return (st.textContent = 'Enter a valid price'); const { error } = await sb.from('prices').update({ price: v, active: ac.checked }).eq('id', p.id); st.textContent = error ? error.message : 'Saved'; };
      [pi, ac, b].forEach((x) => { const td = el('td'); td.appendChild(x); if (x === b) td.appendChild(st); tr.appendChild(td); }); t.appendChild(tr); });
    const sc = el('div', 'sc'); sc.appendChild(t); app.appendChild(sc);
  }
})();
