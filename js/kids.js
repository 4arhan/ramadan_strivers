/* =====================================================================================================
   Ramadan Strivers v8 — kids.js. For children (settings.level 'kids') and their families on a shared device.
   - Night sky: one star lights for each Ramadan day with a deed ticked (Today, kids mode).
   - Story of the day (RS.startData.stories, text ks.<n>.*), with a question and its answer.
   - Grown-up check: a parent confirms a child's day with the family PIN; optionally only checked days count on a
     competition leaderboard (settings.needCheck, read by cloud.js through RS.kids.dayChecked).
   - Short surahs to memorise (Al-Fatiha and the last ten), three states each.
   - Printable sticker chart and Eid certificate.
   API      RS.kids = {todayCardsHtml(day), quranCardHtml(), meCardHtml(), dayChecked(day), needCheck(), easyTf()}
   Actions  kd.check (arg day) · kd.pinSet · kd.pinSave · kd.pinOk · kd.need · kd.surah (arg id) · kd.chart · kd.cert · kd.answer
   Storage  rs-approve {r: {day: {ts}}} · rs-surahs {id: 1|2} (per profile) · rsf-pin (the family PIN's hash, this device)
   ===================================================================================================== */
(function () {
  'use strict';
  var RS = window.RS;
  if (!RS || !RS.ui) return;
  var ui = RS.ui, t = RS.t, tn = RS.tn, esc = RS.esc;
  function nf(n) { return RS.fmt.n(n, { maximumFractionDigits: 0 }); }
  function kids() { return RS.settings.level === 'kids'; }
  function isObj(x) { return !!x && typeof x === 'object' && !Array.isArray(x); }
  function T() { return RS.tracker || {}; }
  function dayRec(d) { var x = T().getDay ? T().getDay(d) : null; return x && x.done > 0 ? x : null; }

  /* ------------------------------------------------------------------ night sky */
  function rng(seed) { return function () { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; }; }
  function skyHtml() {
    var r = rng(7), stars = '', lit = 0;
    for (var d = 1; d <= 30; d++) {
      var on = !!dayRec(d), x = 14 + r() * 292, y = 12 + r() * 96, s = 0.8 + r() * 0.5;
      if (on) lit++;
      stars += '<path class="kd-star' + (on ? ' is-on' : '') + '" transform="translate(' + x.toFixed(1) + ' ' + y.toFixed(1) + ') scale(' + s.toFixed(2) + ')" d="M0-7l2 5 5 .4-3.900 3.300 1.300 5.300L0 4l-4.400 3 1.300-5.300L-7-1.600l5-.4z"/>';
    }
    var svg = '<svg class="kd-sky" viewBox="0 0 320 130" role="img" aria-label="' + esc(tn('kd.sky.label', lit)) + '"><rect width="320" height="130" rx="18" class="kd-sky-bg"/>' +
      '<path class="kd-moon" d="M292 30a22 22 0 1 1-25-24 18.800 18.800 0 1 0 25 24z"/>' + stars + '</svg>';
    return ui.card({ kicker: { icon: 'star', text: t('kd.sky.kicker') }, cls: 'kd-skycard', id: 'kd-sky', body: svg + '<p class="caption mt-2">' + esc(tn('kd.sky.count', lit)) + '</p>' });
  }

  /* ------------------------------------------------------------------ story of the day */
  function stories() { return (RS.startData && RS.startData.stories) || []; }
  function storyHtml(day) {
    var list = stories(), s = list[((day - 1) % Math.max(1, list.length))];
    if (!s || !RS.has('ks.' + s.n + '.x')) return '';
    var k = 'ks.' + s.n;
    return ui.card({ kicker: { icon: 'book-heart', text: t('kd.story.kicker') }, title: t(k + '.t'), cls: 'kd-story', id: 'kd-story',
      body: '<p class="st-p">' + esc(t(k + '.x')) + '</p>' + (s.ref ? '<div class="st-refs">' + ui.meta([ui.ref({ ref: s.ref, url: s.url, grade: '' })]) + '</div>' : '') +
        '<div class="kd-q mt-3"><p class="kd-q-t">' + esc(t(k + '.q')) + '</p><div id="kd-a">' + ui.btn(t('kd.story.show'), { act: 'kd.answer', arg: String(s.n), variant: 'secondary', icon: 'lightbulb' }) + '</div></div>' });
  }
  RS.act('kd.answer', function (n) { var el = document.getElementById('kd-a'); if (el && RS.has('ks.' + n + '.a')) { el.innerHTML = '<p class="kd-a-t" tabindex="-1">' + esc(t('ks.' + n + '.a')) + '</p>'; el.firstChild.focus(); } });

  /* ------------------------------------------------------------------ grown-up check */
  function approvals() { var a = RS.store.get('rs-approve', null); return isObj(a) && isObj(a.r) ? a : { r: {} }; }
  function dayChecked(d) { return !!approvals().r[d]; }
  function needCheck() { return kids() && !!RS.settings.needCheck; }
  function hash(pin) { var h = 5381, s = 'rs:' + pin; for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; return String(h); }
  function pinSet() { try { return !!localStorage.getItem('rsf-pin'); } catch (e) { return false; } }
  function pinOk(pin) { try { return localStorage.getItem('rsf-pin') === hash(pin); } catch (e) { return false; } }
  function checkCard(day) {
    var rec = dayRec(day), ok = dayChecked(day);
    var body = ok ? ui.note(t('kd.check.done', { n: nf(day) }), { icon: 'badge-check', tone: 'plain' })
      : '<p>' + esc(t(rec ? 'kd.check.ask' : 'kd.check.empty', { n: nf(day) })) + '</p>' +
        (rec ? '<div class="btn-row mt-3">' + ui.btn(t('kd.check.btn', { n: nf(day) }), { act: 'kd.check', arg: String(day), icon: 'user-check', block: true }) + '</div>' : '');
    body += '<ul class="list mt-3"><li class="li">' + ui.row({ icon: 'trophy', title: t('kd.need.title'), sub: t('kd.need.sub'), toggle: { on: !!RS.settings.needCheck, act: 'kd.need' }, id: 'kd-need' }) + '</li></ul>';
    return ui.card({ kicker: { icon: 'user-check', text: t('kd.check.kicker') }, cls: 'kd-check', id: 'kd-check', body: body });
  }
  var pending = null;      // what the PIN is being asked for: {kind: 'check', day} | {kind: 'need'}
  function askPin(what) {
    pending = what;
    if (!pinSet()) {
      RS.sheet.open({ title: t('kd.pin.setTitle'), body: '<p>' + esc(t('kd.pin.setBody')) + '</p><form id="kd-pin-form" data-act-submit="kd.pinSave" novalidate>' +
        ui.field({ id: 'kd-pin', name: 'pin', type: 'password', label: t('kd.pin.new'), inputmode: 'numeric', maxlength: 8, autocomplete: 'new-password', attrs: { dir: 'ltr' } }) + '<p class="cl-form-err" role="alert" hidden></p></form>',
        actions: [{ text: t('core.cancel'), act: 'sheet.close' }, { text: t('core.save'), variant: 'primary', type: 'submit', attrs: { form: 'kd-pin-form' } }], focus: '#kd-pin' });
      return;
    }
    RS.sheet.open({ title: t('kd.pin.title'), body: '<p>' + esc(t('kd.pin.body')) + '</p><form id="kd-pin-form" data-act-submit="kd.pinOk" novalidate>' +
      ui.field({ id: 'kd-pin', name: 'pin', type: 'password', label: t('kd.pin.label'), inputmode: 'numeric', maxlength: 8, autocomplete: 'off', attrs: { dir: 'ltr' } }) + '<p class="cl-form-err" role="alert" hidden></p></form>',
      actions: [{ text: t('core.cancel'), act: 'sheet.close' }, { text: t('kd.pin.ok'), variant: 'primary', type: 'submit', attrs: { form: 'kd-pin-form' } }], focus: '#kd-pin' });
  }
  function pinErr(form, msg) { var b = form.querySelector('.cl-form-err'); if (b) { b.textContent = msg; b.hidden = false; } var f = form.querySelector('#kd-pin'); if (f) { f.value = ''; f.focus(); } }
  function doPending() {
    var p = pending; pending = null;
    RS.sheet.close();
    if (!p) return;
    if (p.kind === 'check') {
      var a = approvals(); a.r[p.day] = { ts: Date.now() }; RS.store.set('rs-approve', a);
      RS.toast(t('kd.check.toast', { n: nf(p.day) }), { tone: 'success' });
    } else if (p.kind === 'need') { RS.settings.needCheck = !RS.settings.needCheck; RS.saveSettings(); }
    RS.emit('data', { source: 'kids' });
    RS.refresh();
  }
  RS.act('kd.check', function (d) { d = parseInt(d, 10); if (d >= 1 && d <= 30 && dayRec(d)) askPin({ kind: 'check', day: d }); });
  RS.act('kd.need', function () { askPin({ kind: 'need' }); });
  RS.act('kd.pinSave', function (vals, form) {
    var pin = String((vals && vals.pin) || '').trim();
    if (!/^\d{4,8}$/.test(pin)) { pinErr(form, t('kd.pin.bad')); return; }
    try { localStorage.setItem('rsf-pin', hash(pin)); } catch (e) { pinErr(form, t('err.generic')); return; }
    doPending();
  });
  RS.act('kd.pinOk', function (vals, form) { if (pinOk(String((vals && vals.pin) || '').trim())) doPending(); else pinErr(form, t('kd.pin.wrong')); });

  /* ------------------------------------------------------------------ short surahs */
  var SURAHS = [[1, 'Al-Fatiha'], [114, 'An-Nas'], [113, 'Al-Falaq'], [112, 'Al-Ikhlas'], [111, 'Al-Masad'], [110, 'An-Nasr'], [109, 'Al-Kafirun'], [108, 'Al-Kawthar'], [107, "Al-Ma'un"], [106, 'Quraysh'], [105, 'Al-Fil']];
  function surahState() { var s = RS.store.get('rs-surahs', null); return isObj(s) ? s : {}; }
  function quranCardHtml() {
    var st = surahState(), done = SURAHS.filter(function (s) { return st[s[0]] === 2; }).length;
    return ui.card({ kicker: { icon: 'book-marked', text: t('kd.surah.kicker') }, cls: 'kd-surahs', id: 'kd-surahs',
      body: '<p>' + esc(t('kd.surah.body')) + '</p><p class="caption mt-1">' + esc(t('kd.surah.count', { n: nf(done), total: nf(SURAHS.length) })) + '</p>' + ui.list(SURAHS.map(function (s) {
        var v = st[s[0]] === 2 ? 2 : (st[s[0]] === 1 ? 1 : 0);
        return ui.row({ lead: '<span class="kd-s-n" aria-hidden="true">' + esc(nf(s[0])) + '</span>', titleHtml: '<bdi lang="ar-Latn">' + esc(s[1]) + '</bdi>', sub: t('kd.surah.s' + v),
          act: 'kd.surah', arg: String(s[0]), cls: 'kd-s is-' + v, trail: '<span class="kd-s-dot" aria-hidden="true">' + (v === 2 ? RS.icon('check', { size: 16 }) : '') + '</span>' });
      }), { label: t('kd.surah.kicker') }) + '<p class="caption mt-2">' + esc(t('kd.surah.hint')) + '</p>' });
  }
  RS.act('kd.surah', function (id) {
    var st = surahState(), n = parseInt(id, 10);
    if (!SURAHS.some(function (s) { return s[0] === n; })) return;
    st[n] = ((st[n] || 0) + 1) % 3;
    if (!st[n]) delete st[n];
    RS.store.set('rs-surahs', st);
    RS.refresh();
  });

  /* ------------------------------------------------------------------ printable sticker chart and certificate */
  function profileName() { var f = RS.store.get('rsf-profiles', null); if (isObj(f) && Array.isArray(f.list)) { var p = f.list.filter(function (x) { return x.id === f.active; })[0]; if (p) return p.name; } var u = RS.cloud && RS.cloud.user ? RS.cloud.user() : null; return (u && u.name) || ''; }
  function openDoc(html, fileName) {
    var w = null;
    try { w = window.open('', '_blank'); } catch (e) { w = null; }
    if (w && !w.closed) { try { w.opener = null; w.document.open(); w.document.write(html); w.document.close(); return; } catch (e) { /* download instead */ } }
    var blob = new Blob([html], { type: 'text/html;charset=utf-8' }), url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = fileName + '.html'; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1500);
  }
  var DOC_CSS = '*{box-sizing:border-box}body{font:14px/1.4 Manrope,system-ui,-apple-system,"Segoe UI",Roboto,"Noto Sans Arabic","Noto Sans Bengali","Noto Sans Devanagari",Arial,sans-serif;color:#101915;margin:0;padding:18px}' +
    'h1{font-size:26px;margin:0}p{margin:4px 0;color:#4A5852}button{margin-top:14px;font:inherit;padding:8px 16px;border-radius:999px;border:0;background:#0B2219;color:#fff}@media print{button{display:none}body{padding:0}}';
  function docHead(title, extraCss, page) {
    return '<!doctype html><html lang="' + esc(RS.lang()) + '" dir="' + esc(RS.dir()) + '"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + esc(title) +
      '</title><style>@page{size:A4 ' + page + ';margin:10mm}' + DOC_CSS + extraCss + '</style></head><body>';
  }
  function chartHtml() {
    var deeds = (T().kidsList ? T().kidsList() : []).filter(function (id) { return RS.has('kid.' + id); }), head = '', rows = '';
    for (var d = 1; d <= 30; d++) head += '<th>' + esc(nf(d)) + '</th>';
    deeds.forEach(function (id) { var cells = ''; for (var i = 0; i < 30; i++) cells += '<td></td>'; rows += '<tr><th class="l">' + esc(t('kid.' + id)) + '</th>' + cells + '</tr>'; });
    return docHead(t('kd.chart.title'), 'table{width:100%;border-collapse:collapse;margin-top:12px;table-layout:fixed}th,td{border:1px solid #9DB3A8;height:30px;font-size:11px;text-align:center}th.l{width:200px;text-align:start;padding:0 8px;font-size:12.5px;background:#F2F5F3}thead th{background:#0B2219;color:#EEF8F2}.name{margin-top:8px;font-size:16px}.name span{display:inline-block;min-width:240px;border-bottom:1.5px solid #101915}', 'landscape') +
      '<h1>' + esc(t('kd.chart.title')) + '</h1><p class="name">' + esc(t('kd.doc.name')) + ' <span>' + esc(profileName()) + '&nbsp;</span></p><table><thead><tr><th class="l">' + esc(t('kd.chart.deed')) + '</th>' + head +
      '</tr></thead><tbody>' + rows + '</tbody></table><p>' + esc(t('kd.chart.hint')) + ' ramadanstrivers.com</p><button type="button" onclick="print()">' + esc(t('tl.tt.print')) + '</button></body></html>';
  }
  function certHtml() {
    var tot = T().totals ? T().totals() : {}, year = RS.hijri().year, name = profileName();
    return docHead(t('kd.cert.title'), '.c{border:6px double #047857;border-radius:18px;padding:48px 36px;text-align:center;min-height:170mm;display:flex;flex-direction:column;justify-content:center}.k{letter-spacing:.2em;text-transform:uppercase;color:#047857;font-weight:800}' +
      'h1{font-size:44px;margin:14px 0}.n{font-size:36px;font-weight:800;border-bottom:2px solid #101915;display:inline-block;min-width:60%;margin:18px auto 8px;padding-bottom:6px}.s{display:flex;justify-content:center;gap:40px;margin-top:26px}.s b{display:block;font-size:34px;color:#047857}.sig{margin-top:48px;display:flex;justify-content:space-around}.sig span{border-top:1.5px solid #101915;padding-top:6px;min-width:200px}', 'landscape') +
      '<div class="c"><div class="k">Ramadan Strivers</div><h1>' + esc(t('kd.cert.title')) + '</h1><p>' + esc(t('kd.cert.to')) + '</p><div class="n">' + esc(name) + '&nbsp;</div><p>' + esc(t('kd.cert.for', { year: String(year) })) + '</p>' +
      '<div class="s"><div><b>' + esc(nf(tot.daysLogged || 0)) + '</b>' + esc(t('kd.cert.days')) + '</div><div><b>' + esc(nf(tot.quranPages || 0)) + '</b>' + esc(t('kd.cert.pages')) + '</div></div>' +
      '<div class="sig"><span>' + esc(t('kd.cert.signed')) + '</span><span>' + esc(t('kd.cert.date')) + '</span></div></div><button type="button" onclick="print()">' + esc(t('tl.tt.print')) + '</button></body></html>';
  }
  RS.act('kd.chart', function () { openDoc(chartHtml(), 'ramadan-chart'); });
  RS.act('kd.cert', function () { openDoc(certHtml(), 'ramadan-certificate'); });

  /* ------------------------------------------------------------------ where the cards appear */
  function todayCardsHtml(day, ramadan) {
    if (!kids()) return '';
    return (ramadan ? skyHtml() : '') + storyHtml(ramadan ? day : RS.hijri().day) + (ramadan ? checkCard(day) : '');
  }
  function meCardHtml() {
    if (!kids()) return '';
    return ui.card({ kicker: { icon: 'star', text: t('kd.me.kicker') }, cls: 'kd-me', id: 'kd-me', body: ui.list([
      ui.row({ icon: 'printer', title: t('kd.chart.title'), sub: t('kd.chart.sub'), act: 'kd.chart', chevron: true }),
      ui.row({ icon: 'award', title: t('kd.cert.title'), sub: t('kd.cert.sub'), act: 'kd.cert', chevron: true })]) });
  }
  RS.kids = { todayCardsHtml: todayCardsHtml, quranCardHtml: function () { return kids() ? quranCardHtml() : ''; }, meCardHtml: meCardHtml, dayChecked: dayChecked, needCheck: needCheck,
    easyTf: function () { return kids() && RS.startData && Array.isArray(RS.startData.easyTf) && RS.startData.easyTf.length ? RS.startData.easyTf : null; } };
})();
