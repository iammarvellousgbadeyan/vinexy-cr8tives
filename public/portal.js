(function () {
  const FN = '/.netlify/functions/';
  const N = (n) => '₦' + Number(n || 0).toLocaleString('en-NG');
  const $ = (s, r = document) => r.querySelector(s);
  const app = $('#app');
  const STAGES = ['New Order', 'Payment Pending', 'Partially Paid', 'Fully Paid', 'Information Received', 'Design in Progress', 'Design Proof Sent', 'Revision Requested', 'Awaiting Approval', 'Approved', 'In Production', 'Completed'];

  const q = new URLSearchParams(location.search);
  let o = q.get('o'), t = q.get('t'); const ref = q.get('ref');
  if (!o || !t) { try { const l = JSON.parse(localStorage.getItem('vinexy_last_order') || '{}'); o = l.o; t = l.t; } catch (_) {} }
  if (!o || !t) { app.innerHTML = '<div class="panel"><h2>Open your private order link</h2><p>Use the link we emailed you. If you cannot find it, message us on WhatsApp with your order number.</p></div>'; return; }
  try { localStorage.setItem('vinexy_last_order', JSON.stringify({ o, t })); } catch (_) {}

  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const post = async (n, b) => { const r = await fetch(FN + n, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }); let j = {}; try { j = await r.json(); } catch (_) {} return { ok: r.ok, status: r.status, data: j }; };

  let banner = null, plan = 'full', proofDrawn = null;

  async function confirmPayment() {
    if (!ref) return;
    banner = { cls: 'wait', text: 'Confirming your payment with Paystack…' }; await load();
    for (let i = 0; i < 8; i++) {
      const r = await post('verify-payment', { o, t, ref });
      if (r.data.status === 'success') { banner = { cls: 'ok', text: 'Payment confirmed. Thank you! A confirmation has been sent to your email.' }; break; }
      if (r.data.status === 'failed') { banner = { cls: 'bad', text: 'Your payment was not completed. No money has been recorded. You can try again below.' }; break; }
      await new Promise((res) => setTimeout(res, 3000));
      if (i === 7) banner = { cls: 'wait', text: 'We are still confirming your payment. If you were charged, it will appear here shortly. Please do not pay twice.' };
    }
    history.replaceState(null, '', `portal.html?o=${encodeURIComponent(o)}&t=${t}`);
    await load();
  }

  async function load() {
    const r = await fetch(`${FN}get-order?o=${encodeURIComponent(o)}&t=${encodeURIComponent(t)}`);
    const j = await r.json();
    if (!r.ok) { app.textContent = ''; const p = el('div', 'panel'); p.appendChild(el('h2', '', 'Order not found')); p.appendChild(el('p', '', j.error || 'Check your link.')); app.appendChild(p); return; }
    draw(j);
  }

  function draw({ order, proofs, revisions, payments }) {
    app.textContent = '';
    if (banner) app.appendChild(el('div', 'banner ' + banner.cls, banner.text));

    // header
    const head = el('div', 'panel');
    head.appendChild(el('p', 'hint', 'Order ID'));
    head.appendChild(el('h2', '', order.order_no));
    const ps = order.payment_status;
    const badge = el('span', 'badge ' + (ps === 'fully_paid' ? 'full' : ps === 'partially_paid' ? 'part' : 'none'), ps === 'fully_paid' ? 'FULLY PAID' : ps === 'partially_paid' ? 'PARTIALLY PAID' : 'NOT YET PAID');
    head.appendChild(badge);
    if (ps === 'partially_paid') head.appendChild(el('p', '', `Outstanding balance: ${N(order.balance)}`)).style.marginTop = '10px';
    const kv = el('div', 'kv');
    [['Package', `${order.size} ${order.cover} Cover`], ['Copies', order.qty], ['Total price', order.total ? N(order.total) : 'Awaiting quotation'], ['Amount paid', N(order.amount_paid)], ['Balance', order.total ? N(order.balance) : '-']].forEach(([a, b]) => { const d = el('div'); d.appendChild(el('small', '', a)); d.appendChild(el('b', '', String(b))); kv.appendChild(d); });
    head.appendChild(kv);
    if (order.total) { const pb = el('div', 'pbar'); const i = el('i'); i.style.width = Math.min(100, Math.round((order.amount_paid / order.total) * 100)) + '%'; pb.appendChild(i); head.appendChild(pb); head.appendChild(el('p', 'hint', `${Math.round((order.amount_paid / order.total) * 100)}% paid`)); }
    app.appendChild(head);

    // stage
    const st = el('div', 'panel'); st.appendChild(el('h3', '', 'Order status: ' + order.status_label));
    const ul = el('ul', 'stages'); STAGES.forEach((s) => ul.appendChild(el('li', s === order.status_label ? 'cur' : '', s))); st.appendChild(ul); app.appendChild(st);

    // quote
    if (order.custom_qty && order.quote_status === 'requested') { const p = el('div', 'panel'); p.appendChild(el('h3', '', 'Quotation')); p.appendChild(el('p', '', 'We are preparing your quotation for a custom quantity. This page will show it as soon as it is ready.')); app.appendChild(p); }
    if (order.quote_status === 'sent') {
      const p = el('div', 'panel'); p.appendChild(el('h3', '', 'Your quotation'));
      p.appendChild(el('p', '', `${order.qty} copies, ${order.size} ${order.cover} cover. Total: ${N(order.total)}${order.discount ? ` (includes a discount of ${N(order.discount)})` : ''}.`));
      if (order.quote_note) p.appendChild(el('p', 'hint', order.quote_note));
      const b = el('button', 'btn', 'Accept quotation'); b.onclick = async () => { b.disabled = true; const r = await post('proof-action', { o, t, action: 'accept_quote' }); if (!r.ok) alert(r.data.error || 'Could not accept'); load(); }; p.appendChild(b); app.appendChild(p);
    }

    // payment
    if (order.can_pay) {
      const p = el('div', 'panel');
      if (order.has_paid_any) {
        p.appendChild(el('h3', '', 'Pay your remaining balance'));
        p.appendChild(el('p', '', `Balance due: ${N(order.balance)}. Paying it makes your order FULLY PAID.`));
        p.appendChild(payBtn(`Pay ${N(order.balance)} with Paystack`, 'balance'));
      } else {
        p.appendChild(el('h3', '', 'Complete your payment'));
        [['full', `Pay in full: ${N(order.total)}`, 'Balance ₦0'], ['deposit', `Pay 60% now: ${N(order.deposit)}`, `Remaining ${N(order.total - order.deposit)} before printing`]].forEach(([v, a, b]) => {
          const l = el('label', 'opt'); const i = el('input'); i.type = 'radio'; i.name = 'pp'; i.value = v; i.checked = v === plan; i.onchange = () => { plan = v; };
          const s = el('span'); s.appendChild(el('b', '', a)); s.appendChild(document.createElement('br')); s.appendChild(el('span', 'hint', b)); l.append(i, s); p.appendChild(l);
        });
        p.appendChild(payBtn('Continue to Paystack', plan));
      }
      app.appendChild(p);
    }

    // proofs
    const pr = el('div', 'panel'); pr.appendChild(el('h3', '', 'Your design proofs'));
    if (!proofs.length) pr.appendChild(el('p', '', 'Your design proof will appear here when it is ready. We will email you.'));
    else {
      const latest = proofs[0];
      pr.appendChild(el('p', '', `Version ${latest.version} · ${latest.status === 'sent' ? 'Waiting for your decision' : latest.status === 'approved' ? 'Approved' : 'Revision requested'}`));
      pr.appendChild(el('p', 'hint', 'These are protected previews: low resolution and watermarked. Printing, saving and copying are disabled. The final high-quality files are released after approval and full payment.'));
      viewer(pr, latest, order);
      if (latest.status === 'sent') {
        const box = el('div'); box.style.marginTop = '14px';
        const ta = el('textarea'); ta.placeholder = 'If you want changes, describe them here (required for a revision request).'; ta.setAttribute('aria-label', 'Revision comment');
        const err = el('div', 'err'); const row = el('div', 'nav');
        const rv = el('button', 'btn ghost', 'Request revision'), ap = el('button', 'btn', 'Approve design');
        const act = async (action) => {
          if (action === 'approve' && !confirm('Approve this design? After approval, further changes may attract an extra fee.')) return;
          rv.disabled = ap.disabled = true;
          const r = await post('proof-action', { o, t, proof_id: latest.id, action, comment: ta.value });
          if (!r.ok) { err.textContent = r.data.error || 'Something went wrong'; rv.disabled = ap.disabled = false; return; }
          banner = { cls: 'ok', text: action === 'approve' ? 'Design approved. Thank you!' : 'Revision request sent. We will update your design.' }; load();
        };
        rv.onclick = () => act('revise'); ap.onclick = () => act('approve'); row.append(rv, ap); box.append(ta, err, row); pr.appendChild(box);
      }
      if (proofs.length > 1) pr.appendChild(el('p', 'hint', `Earlier versions: ${proofs.slice(1).map((x) => 'v' + x.version).join(', ')} (replaced by the latest).`));
    }
    app.appendChild(pr);

    // revisions
    if (revisions.length) {
      const p = el('div', 'panel'); p.appendChild(el('h3', '', 'Revision history'));
      revisions.forEach((r) => p.appendChild(el('p', '', `${new Date(r.created_at).toLocaleString('en-NG')} · v${r.version} · ${r.action === 'approved' ? 'Approved' : 'Revision requested'}${r.comment ? ': ' + r.comment : ''}`)));
      app.appendChild(p);
    }

    // final files
    const fin = el('div', 'panel'); fin.appendChild(el('h3', '', 'Final files'));
    if (order.final_files.length) order.final_files.forEach((f) => { const a = el('a', 'btn sm', 'Download ' + (f.name || 'file')); a.href = f.url; a.style.marginRight = '8px'; fin.appendChild(a); });
    else fin.appendChild(el('p', '', ps === 'fully_paid' ? 'Your final files will appear here when we release them.' : 'Final files are released after full payment and approval.'));
    app.appendChild(fin);

    // payments
    if (payments.length) { const p = el('div', 'panel'); p.appendChild(el('h3', '', 'Payments received')); payments.forEach((x) => p.appendChild(el('p', '', `${new Date(x.paid_at).toLocaleDateString('en-NG')} · ${N(x.amount)} · ref ${x.reference}`))); app.appendChild(p); }
    app.appendChild(el('p', 'hint', 'Questions? WhatsApp us on 0704 218 6077 or 0704 478 5543 and quote your order ID.'));
  }

  function payBtn(label, which) {
    const wrap = el('div'); const err = el('div', 'err'); const b = el('button', 'btn', label);
    b.onclick = async () => { b.disabled = true; err.textContent = ''; const r = await post('init-payment', { o, t, plan: which === 'balance' ? 'full' : plan }); if (!r.ok) { err.textContent = r.data.error || 'Could not start payment'; b.disabled = false; return; } location.href = r.data.url; };
    wrap.append(b, err); return wrap;
  }

  // ---- protected viewer: pages are fetched, drawn onto canvases (no downloadable <img> or URL), watermarked again with the viewer's own details.
  // This deters casual copying. It cannot stop a photo of the screen or an OS-level screenshot.
  function viewer(parent, proof, order) {
    const wrap = el('div', 'proofwrap guard'); parent.appendChild(wrap);
    const status = el('p', 'hint', 'Loading preview…'); wrap.appendChild(status);
    ['contextmenu', 'dragstart', 'copy', 'cut', 'selectstart'].forEach((ev) => wrap.addEventListener(ev, (e) => e.preventDefault()));
    (async () => {
      let n = 0;
      for (const url of proof.pages) {
        try {
          const blob = await (await fetch(url)).blob(); const bmp = await createImageBitmap(blob);
          const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height; const g = c.getContext('2d'); g.drawImage(bmp, 0, 0);
          g.save(); g.globalAlpha = 0.16; g.fillStyle = '#000'; g.font = `700 ${Math.max(18, c.width / 30)}px Arial`; g.rotate(-0.45);
          const label = `${order.customer_name} · ${order.order_no}`; for (let y = -c.height; y < c.height * 2; y += c.width / 5) for (let x = -c.width; x < c.width * 2; x += c.width / 1.6) g.fillText(label, x, y);
          g.restore(); c.setAttribute('role', 'img'); c.setAttribute('aria-label', `Design proof page ${++n}`); wrap.appendChild(c);
        } catch (_) { wrap.appendChild(el('p', 'err', 'A page could not be loaded. Refresh to try again.')); }
      }
      status.remove(); proofDrawn = wrap;
    })();
  }
  const hideProof = (h) => { if (proofDrawn) proofDrawn.classList.toggle('hide', h); };
  document.addEventListener('visibilitychange', () => hideProof(document.hidden));
  window.addEventListener('blur', () => hideProof(true)); window.addEventListener('focus', () => hideProof(false));
  window.addEventListener('beforeprint', () => hideProof(true)); window.addEventListener('afterprint', () => hideProof(false));
  document.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && ['p', 's', 'c'].includes(e.key.toLowerCase())) e.preventDefault(); });
  document.addEventListener('keyup', (e) => { if (e.key === 'PrintScreen') { try { navigator.clipboard.writeText(''); } catch (_) {} hideProof(true); setTimeout(() => hideProof(false), 1500); } });

  confirmPayment().then(() => { if (!ref) load(); });
  setInterval(() => { if (!document.hidden && !document.querySelector('textarea:focus')) load(); }, 60000);
})();
