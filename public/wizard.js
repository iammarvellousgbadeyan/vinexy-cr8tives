(function () {
  const FN = '/.netlify/functions/';
  const $ = (s, r = document) => r.querySelector(s);
  const N = (n) => '₦' + Number(n).toLocaleString('en-NG');
  const STEPS = ['Package', 'Details', 'Photos', 'Colours', 'Review', 'Payment', 'Done'];
  const MAX_PHOTOS = 20, MAX_BYTES = 10 * 1024 * 1024, OK_TYPES = ['image/jpeg', 'image/png'];
  const SWATCHES = ['#211608', '#C9A22B', '#E5C67A', '#F8F0DD', '#FFD900', '#FFFFFF', '#111111', '#1F3A8A', '#2C7BE5', '#0E7C66', '#7A1F3D', '#C0392B', '#E67E22', '#8E44AD'];

  const S = { step: 1, size: 'A5', cover: 'Soft', qty: '50', customQty: '', d: {}, photos: [], ref: null, picked: [], colourDesc: '', plan: 'full', rights: false, busy: false, created: null };
  let PRICES = {};

  const post = async (name, body) => {
    const r = await fetch(FN + name, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    let j = {}; try { j = await r.json(); } catch (_) {}
    return { ok: r.ok, status: r.status, data: j };
  };
  const key = () => `${S.size}-${S.cover}-${S.qty}`;
  const isCustom = () => S.qty === 'custom';
  const total = () => (isCustom() ? null : PRICES[key()] ?? null);
  const deposit = (t) => Math.round(t * 0.6);
  const clone = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstChild; };

  // ---- price table + load
  fetch(FN + 'prices').then((r) => r.json()).then((j) => {
    PRICES = {};
    (j.prices || []).forEach((p) => (PRICES[`${p.size}-${p.cover}-${p.qty}`] = p.price));
    const tb = $('#ptable tbody'); tb.textContent = '';
    (j.prices || []).forEach((p) => {
      const tr = document.createElement('tr');
      [`${p.size} ${p.cover} Cover`, p.qty, N(p.price)].forEach((v, i) => { const td = document.createElement('td'); td.textContent = v; if (i === 2) td.className = 'n'; tr.appendChild(td); });
      tb.appendChild(tr);
    });
    render();
  }).catch(() => { $('#ptable tbody').innerHTML = '<tr><td colspan="3">Prices could not be loaded. Please refresh.</td></tr>'; });

  // ---- shell
  function renderProg() {
    const ol = $('#prog'); ol.textContent = '';
    STEPS.forEach((s, i) => {
      const li = document.createElement('li'); li.className = i + 1 === S.step ? 'on' : i + 1 < S.step ? 'done' : '';
      li.innerHTML = `${i + 1}<span> ${s}</span>`; ol.appendChild(li);
    });
  }
  function go(n) { S.step = n; render(); $('#order').scrollIntoView({ behavior: 'smooth' }); }
  function render() { renderProg(); const st = $('#stage'); st.textContent = ''; [null, step1, step2, step3, step4, step5, step6, step7][S.step](st); }
  const navRow = (st, back, next, nextLabel = 'Continue') => {
    const r = clone(`<div class="nav"><button class="btn ghost" type="button" ${back ? '' : 'style="visibility:hidden"'}>Back</button><button class="btn" type="button">${nextLabel}</button></div>`);
    const [b, n] = r.querySelectorAll('button'); if (back) b.onclick = back; n.onclick = next; st.appendChild(r); return n;
  };

  // ---- step 1
  function step1(st) {
    const seg = (name, vals) => vals.map(([v, l]) => `<label><input type="radio" name="${name}" value="${v}" ${S[name === 'size' ? 'size' : name === 'cover' ? 'cover' : 'qty'] === v ? 'checked' : ''}><span>${l}</span></label>`).join('');
    st.appendChild(clone(`<div>
      <h3>1. Choose your package</h3>
      <div class="lbl">Jotter size</div><div class="seg" id="g-size">${seg('size', [['A5', 'A5 (larger)'], ['A6', 'A6 (pocket)']])}</div>
      <div class="lbl" style="margin-top:16px">Cover type</div><div class="seg" id="g-cover">${seg('cover', [['Soft', 'Soft cover'], ['Hard', 'Hard cover']])}</div>
      <div class="lbl" style="margin-top:16px">Number of copies</div><div class="seg" id="g-qty">${seg('qty', [['50', '50 copies'], ['100', '100 copies'], ['custom', 'Custom quantity']])}</div>
      <div id="cq" style="margin-top:12px" hidden><label for="cqv">How many copies do you need?</label><input id="cqv" type="number" min="1" max="100000" inputmode="numeric" style="max-width:220px"><div class="hint">We will send you a quotation, with a discount, on your order page.</div></div>
      <div class="pricebox" aria-live="polite"><span class="big" id="pp"></span><small id="ps"></small></div>
      <div class="err" id="e1" role="alert"></div></div>`));
    const upd = () => {
      $('#cq').hidden = !isCustom();
      const t = total(), name = `${S.size} ${S.cover} Cover`;
      if (isCustom()) { $('#pp').textContent = 'Custom quote required'; $('#ps').textContent = `${name}, ${S.customQty || '…'} copies. We will send you a price.`; }
      else if (t) { $('#pp').textContent = N(t); $('#ps').textContent = `${name}, ${S.qty} copies. Design, printing and final files included.`; }
      else { $('#pp').textContent = '…'; $('#ps').textContent = 'Loading price'; }
    };
    ['size', 'cover', 'qty'].forEach((g) => st.querySelectorAll(`input[name=${g}]`).forEach((i) => i.addEventListener('change', () => { S[g] = i.value; upd(); })));
    const cqv = $('#cqv'); cqv.value = S.customQty; cqv.oninput = () => { S.customQty = cqv.value; upd(); };
    upd();
    navRow(st, null, () => {
      if (isCustom()) { const q = parseInt(S.customQty, 10); if (!q || q < 1) return ($('#e1').textContent = 'Enter the number of copies you need.'); if (q === 50 || q === 100) return ($('#e1').textContent = 'For 50 or 100 copies, pick the standard option to see the price.'); }
      else if (!total()) return ($('#e1').textContent = 'Price not available yet. Please wait a moment and try again.');
      go(2);
    });
  }

  // ---- step 2
  const FIELDS = [
    ['name', 'Your full name', 'text', 1], ['displayName', 'Name to display on the jotter', 'text', 0],
    ['phone', 'Phone or WhatsApp number', 'tel', 1], ['email', 'Email address', 'email', 1],
    ['school', 'School or institution', 'text', 1], ['faculty', 'Faculty', 'text', 0],
    ['department', 'Department', 'text', 1], ['programme', 'Course or programme', 'text', 1],
    ['gradYear', 'Graduation year', 'text', 1], ['gradDate', 'Graduation or convocation date', 'text', 0],
    ['classSet', 'Class or set', 'text', 0], ['contactMethod', 'Preferred contact method', 'select', 0]
  ];
  function step2(st) {
    const f = clone(`<div><h3>2. Tell us about your graduation</h3><div class="grid2" id="fg"></div><div class="err" id="e2" role="alert"></div></div>`);
    st.appendChild(f); const g = $('#fg');
    FIELDS.forEach(([id, label, type, req]) => {
      const w = document.createElement('div');
      const l = document.createElement('label'); l.htmlFor = 'f-' + id; l.textContent = label + (req ? ' *' : ''); w.appendChild(l);
      let inp;
      if (type === 'select') { inp = document.createElement('select'); ['WhatsApp', 'Phone call', 'Email'].forEach((o) => { const op = document.createElement('option'); op.textContent = o; inp.appendChild(op); }); }
      else { inp = document.createElement('input'); inp.type = type; if (id === 'phone') inp.autocomplete = 'tel'; if (id === 'email') inp.autocomplete = 'email'; if (id === 'name') inp.autocomplete = 'name'; }
      inp.id = 'f-' + id; inp.value = S.d[id] || (type === 'select' ? 'WhatsApp' : ''); inp.oninput = inp.onchange = () => (S.d[id] = inp.value);
      w.appendChild(inp); g.appendChild(w);
    });
    [['message', 'Personal message, quote or Bible verse', 'Anything you want printed on the jotter'], ['handles', 'Social media handles (optional)', '@yourhandle'], ['extra', 'Anything else we should know', '']].forEach(([id, label, ph]) => {
      const w = document.createElement('div'); w.className = 'full';
      w.innerHTML = `<label for="f-${id}">${label}</label>`;
      const t = document.createElement(id === 'handles' ? 'input' : 'textarea'); if (id === 'handles') t.type = 'text';
      t.id = 'f-' + id; t.placeholder = ph; t.value = S.d[id] || ''; t.oninput = () => (S.d[id] = t.value); w.appendChild(t); g.appendChild(w);
    });
    navRow(st, () => go(1), () => {
      for (const [id, label, , req] of FIELDS) if (req && !String(S.d[id] || '').trim()) return ($('#e2').textContent = `Please fill in: ${label}`);
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(S.d.email)) return ($('#e2').textContent = 'Please enter a valid email address.');
      if (String(S.d.phone).replace(/\D/g, '').length < 10) return ($('#e2').textContent = 'Please enter a valid phone number.');
      go(3);
    });
  }

  // ---- shared image picker
  function checkFile(f) {
    if (!OK_TYPES.includes(f.type)) return `${f.name}: only JPG and PNG files are accepted.`;
    if (f.size > MAX_BYTES) return `${f.name}: file is larger than 10 MB.`;
    return null;
  }
  function thumb(file, onRemove, onReplace) {
    const t = clone(`<div class="thumb"><img alt=""><div class="row"><button type="button">Replace</button><button type="button">Remove</button></div></div>`);
    const url = URL.createObjectURL(file); const im = t.querySelector('img'); im.src = url; im.alt = file.name; im.onload = () => URL.revokeObjectURL(url);
    const [rp, rm] = t.querySelectorAll('button'); rm.onclick = onRemove;
    rp.onclick = () => { const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/jpeg,image/png'; i.onchange = () => i.files[0] && onReplace(i.files[0]); i.click(); };
    return t;
  }

  // ---- step 3
  function step3(st) {
    st.appendChild(clone(`<div><h3>3. Upload your photos</h3>
      <p>Choose clear, high-resolution graduation photos. JPG or PNG, up to 10 MB each, up to ${MAX_PHOTOS} photos.</p>
      <div class="drop"><label class="btn" for="ph" style="margin:0">Choose photos</label><input id="ph" type="file" accept="image/jpeg,image/png" multiple hidden><div class="hint" id="cnt"></div></div>
      <div class="thumbs" id="th"></div><div class="err" id="e3" role="alert"></div></div>`));
    const draw = () => {
      const th = $('#th'); th.textContent = ''; $('#cnt').textContent = `${S.photos.length} of ${MAX_PHOTOS} photos added`;
      S.photos.forEach((f, i) => th.appendChild(thumb(f, () => { S.photos.splice(i, 1); draw(); }, (nf) => { const e = checkFile(nf); if (e) $('#e3').textContent = e; else { S.photos[i] = nf; $('#e3').textContent = ''; draw(); } })));
    };
    $('#ph').onchange = (ev) => {
      const errs = [];
      Array.from(ev.target.files).forEach((f) => { const e = checkFile(f); if (e) errs.push(e); else if (S.photos.length >= MAX_PHOTOS) errs.push(`Only ${MAX_PHOTOS} photos are allowed.`); else S.photos.push(f); });
      $('#e3').textContent = errs.slice(0, 3).join(' '); ev.target.value = ''; draw();
    };
    draw();
    navRow(st, () => go(2), () => { if (!S.photos.length) return ($('#e3').textContent = 'Please add at least one photo.'); go(4); });
  }

  // ---- step 4
  function step4(st) {
    st.appendChild(clone(`<div><h3>4. Colours and style</h3>
      <p>Give us colour direction in either or both ways.</p>
      <div class="lbl">Option 1: pick colours (up to 5)</div><div class="sw" id="sw"></div>
      <div style="display:flex;gap:10px;align-items:center;margin-top:12px"><input type="color" id="cp" value="#C9A22B" aria-label="Custom colour" style="width:54px;height:42px;border:0;padding:0;background:none"><button class="btn sm ghost" type="button" id="addc">Add this colour</button></div>
      <div class="lbl" style="margin-top:22px">Option 2: upload a picture of the colour</div>
      <div class="hint">A screenshot, photo or any image that shows the colour you want. JPG or PNG, up to 10 MB.</div>
      <div style="margin-top:8px"><label class="btn sm" for="rf">Choose picture</label><input id="rf" type="file" accept="image/jpeg,image/png" hidden></div>
      <div class="thumbs" id="rth" style="max-width:160px"></div>
      <div style="margin-top:18px"><label for="cd">Describe the colour or style you want, if possible</label><textarea id="cd" placeholder="e.g. deep green and gold, elegant, simple"></textarea></div>
      <div class="err" id="e4" role="alert"></div></div>`));
    const sw = $('#sw');
    const drawSw = () => {
      sw.textContent = '';
      const all = Array.from(new Set([...SWATCHES, ...S.picked]));
      all.forEach((c) => { const b = document.createElement('button'); b.type = 'button'; b.style.background = c; b.setAttribute('aria-label', 'Colour ' + c); b.setAttribute('aria-pressed', S.picked.includes(c)); b.onclick = () => { const i = S.picked.indexOf(c); if (i > -1) S.picked.splice(i, 1); else if (S.picked.length < 5) S.picked.push(c); else $('#e4').textContent = 'You can pick up to 5 colours.'; drawSw(); }; sw.appendChild(b); });
    };
    drawSw();
    $('#addc').onclick = () => { const c = $('#cp').value.toUpperCase(); if (!S.picked.includes(c)) { if (S.picked.length >= 5) return ($('#e4').textContent = 'You can pick up to 5 colours.'); S.picked.push(c); } drawSw(); };
    const drawRef = () => { const t = $('#rth'); t.textContent = ''; if (S.ref) t.appendChild(thumb(S.ref, () => { S.ref = null; drawRef(); }, (nf) => { const e = checkFile(nf); if (e) $('#e4').textContent = e; else { S.ref = nf; drawRef(); } })); };
    $('#rf').onchange = (ev) => { const f = ev.target.files[0]; ev.target.value = ''; if (!f) return; const e = checkFile(f); if (e) return ($('#e4').textContent = e); $('#e4').textContent = ''; S.ref = f; drawRef(); };
    drawRef();
    const cd = $('#cd'); cd.value = S.colourDesc; cd.oninput = () => (S.colourDesc = cd.value);
    navRow(st, () => go(3), () => go(5));
  }

  // ---- step 5
  function step5(st) {
    const t = total(), name = `${S.size} ${S.cover} Cover`;
    const rows = [['Package', name], ['Size', S.size], ['Cover type', S.cover + ' cover'], ['Number of copies', isCustom() ? S.customQty + ' (custom quantity)' : S.qty],
      ['Total price', isCustom() ? 'Custom quote required' : N(t)]];
    if (!isCustom()) rows.push(['60% deposit option', N(deposit(t))], ['Balance after deposit', N(t - deposit(t))]);
    rows.push(['Name', S.d.name], ['Contact', `${S.d.phone}, ${S.d.email}`], ['School', S.d.school], ['Department', S.d.department], ['Programme', S.d.programme], ['Graduation year', S.d.gradYear],
      ['Photos', `${S.photos.length} uploaded`], ['Colours', S.picked.join(', ') || 'None picked'], ['Colour picture', S.ref ? S.ref.name : 'None']);
    const wrap = clone(`<div><h3>5. Review your order</h3><table class="rev"><tbody></tbody></table>
      <div class="chk" style="margin-top:16px"><input type="checkbox" id="rt"><label for="rt" style="margin:0">I confirm the information is correct and I have the right to use the photos and materials I am uploading.</label></div>
      <div class="err" id="e5" role="alert"></div></div>`);
    const tb = wrap.querySelector('tbody');
    rows.forEach(([a, b]) => { const tr = document.createElement('tr'); const x = document.createElement('td'); x.textContent = a; const y = document.createElement('td'); y.textContent = b || '-'; tr.append(x, y); tb.appendChild(tr); });
    st.appendChild(wrap); const rt = $('#rt'); rt.checked = S.rights; rt.onchange = () => (S.rights = rt.checked);
    navRow(st, () => go(4), () => { if (!S.rights) return ($('#e5').textContent = 'Please tick the confirmation box.'); go(6); }, isCustom() ? 'Continue' : 'Continue to payment');
  }

  // ---- step 6
  function step6(st) {
    const t = total();
    if (isCustom()) {
      st.appendChild(clone(`<div><h3>6. Request your quotation</h3><p>Custom quantities are quoted by us, with a discount. Submit your details and photos now. We will send you a quotation on your private order page. You accept it, then pay.</p><div class="err" id="e6" role="alert"></div><div class="hint" id="pr6"></div></div>`));
      const n = navRow(st, () => { S.created = null; go(5); }, submit, 'Submit and request quotation'); n.id = 'sub';
      return;
    }
    st.appendChild(clone(`<div><h3>6. Choose how to pay</h3>
      <label class="opt"><input type="radio" name="plan" value="full"><span><b>Pay in full: ${N(t)}</b><br><span class="hint">Pay 100% now. Balance ₦0.</span></span></label>
      <label class="opt"><input type="radio" name="plan" value="deposit"><span><b>Pay 60% now: ${N(deposit(t))}</b><br><span class="hint">Then pay the remaining ${N(t - deposit(t))} (40%) before printing. You can pay it from your order page.</span></span></label>
      <div class="hint">Payments are processed securely by Paystack. Your order is only marked paid after Paystack confirms the payment.</div>
      <div class="err" id="e6" role="alert"></div><div class="hint" id="pr6"></div></div>`));
    st.querySelectorAll('input[name=plan]').forEach((i) => { i.checked = i.value === S.plan; i.onchange = () => { S.plan = i.value; lbl(); }; });
    const n = navRow(st, () => { S.created = null; go(5); }, submit, ''); n.id = 'sub';
    function lbl() { n.textContent = `Pay ${N(S.plan === 'full' ? t : deposit(t))} with Paystack`; } lbl();
  }

  // ---- submit
  const setBusy = (b, msg) => { S.busy = b; const s = $('#sub'); if (s) s.disabled = b; const p = $('#pr6'); if (p) p.textContent = msg || ''; };
  async function uploadAll(items) {
    const cfg = await (await fetch(FN + 'config')).json();
    const sb = window.supabase.createClient(cfg.url, cfg.anonKey, { auth: { persistSession: false } });
    let done = 0; const failed = [];
    const one = async (u, file) => {
      const token = new URL(u.signedUrl).searchParams.get('token');
      for (let a = 0; a < 3; a++) {
        const { error } = await sb.storage.from('uploads').uploadToSignedUrl(u.path, token, file, { contentType: file.type });
        if (!error) { setBusy(true, `Uploading files… ${++done} of ${items.length}`); return true; }
      }
      failed.push(u.path); return false;
    };
    const q = items.slice(); const workers = Array.from({ length: 3 }, async () => { while (q.length) { const [u, f] = q.shift(); await one(u, f); } });
    await Promise.all(workers); return failed;
  }
  async function submit() {
    if (S.busy) return; $('#e6').textContent = '';
    try {
      setBusy(true, 'Saving your order…');
      const fileObjs = [...S.photos.map((f) => ['photo', f]), ...(S.ref ? [['colour_ref', S.ref]] : [])];
      if (!S.created) {
        const r = await post('create-order', {
          size: S.size, cover: S.cover, qty: isCustom() ? null : S.qty, custom: isCustom(), customQty: S.customQty,
          customer: { name: S.d.name, email: S.d.email, phone: S.d.phone },
          details: { ...S.d, rights: true }, colours: { picked: S.picked, description: S.colourDesc }, hp: '',
          files: fileObjs.map(([field, f], i) => ({ field, name: f.name, type: f.type, size: f.size, index: i }))
        });
        if (!r.ok) throw new Error(r.data.error || 'Could not save your order. Please try again.');
        S.created = { o: r.data.order_no, t: r.data.token, portal: r.data.portal, map: r.data.uploads.map((u, i) => [u, fileObjs[i][1]]) };
        localStorage.setItem('vinexy_last_order', JSON.stringify({ o: r.data.order_no, t: r.data.token }));
        setBusy(true, 'Uploading files…');
        const failed = await uploadAll(S.created.map);
        S.created.failed = failed;
      }
      if (S.created.failed && S.created.failed.length) {
        setBusy(true, 'Retrying failed uploads…');
        const u = await post('upload-urls', { o: S.created.o, t: S.created.t, paths: S.created.failed });
        const items = (u.data.uploads || []).map((x) => [x, (S.created.map.find(([m]) => m.path === x.path) || [])[1]]).filter((p) => p[1]);
        S.created.failed = await uploadAll(items);
        if (S.created.failed.length) throw new Error('Some files did not upload. Check your connection and tap the button again.');
      }
      if (isCustom()) { S.step = 7; return render(); }
      setBusy(true, 'Opening Paystack…');
      let r = await post('init-payment', { o: S.created.o, t: S.created.t, plan: S.plan });
      if (r.status === 409 && r.data.missing) {
        setBusy(true, 'Retrying failed uploads…');
        const paths = r.data.missing.map((m) => m.path);
        const u = await post('upload-urls', { o: S.created.o, t: S.created.t, paths });
        const items = (u.data.uploads || []).map((x) => [x, (S.created.map.find(([m]) => m.path === x.path) || [])[1]]).filter((p) => p[1]);
        await uploadAll(items);
        r = await post('init-payment', { o: S.created.o, t: S.created.t, plan: S.plan });
      }
      if (!r.ok) throw new Error(r.data.error || 'Could not start payment. Please try again.');
      window.location.href = r.data.url;
    } catch (e) { $('#e6').textContent = e.message; setBusy(false, ''); }
  }

  // ---- step 7 (custom quote requested)
  function step7(st) {
    const d = clone(`<div><h3>7. Quotation requested</h3><p>Thank you. Your order <b id="on"></b> is saved. We will prepare a quotation for your custom quantity and show it on your private order page.</p><p><a class="btn" id="pl" href="#">Open my order page</a></p><p class="hint">Bookmark that page. It is the only place to see your quotation, proofs and payments.</p></div>`);
    st.appendChild(d); $('#on').textContent = S.created.o; $('#pl').href = S.created.portal;
  }

  render();
})();
