/* =====================================================================================================
   Ramadan Strivers v8 — social.js: family profiles, accountability buddies, calendar export, embeddable
   leaderboards, organiser insights, the home display and the data snapshot native widgets read.

   Hooks    RS.social.meCardsHtml() (Me) · toolsHtml(comp) and insightsHtml(comp) (organiser dashboard) ·
            widgetSnapshot() (native wrappers) · calendar()
   Routes   me/family · me/buddies · display
   Storage  rsf-profiles {active, list:[{id, name}]} and rsf-data-<id> {key: raw} hold the profiles that are not
            in use (the prefix is not "rs-", so "Reset all" of one profile never touches the others). The swap
            itself happens in index.html before any module reads storage: this file only asks for it
            (sessionStorage rsf-switch) and reloads. rs-buddy {mine:{code, token, name}, follow:[{code, name}],
            seen} belongs to the profile in use.
   Privacy  A buddy sees a summary only (day, today's completion, streak, days logged, Quran pages, last active
            date): never single deeds, the journal or sisters' mode. Encouragements are presets, never free text.
   ===================================================================================================== */
(function () {
  'use strict';
  var RS = window.RS, ui = RS.ui, esc = RS.esc;
  var API = String(window.RS_API_BASE || '').replace(/\/+$/, '');
  function t(k, v) { return RS.t(k, v); }
  function tn(k, n, v) { return RS.tn(k, n, v); }
  function num(n) { n = Number(n); return isFinite(n) ? n : 0; }
  function nf(n) { return RS.fmt.n(num(n), { maximumFractionDigits: 0 }); }
  function isObj(o) { return !!o && typeof o === 'object' && !Array.isArray(o); }
  function bdi(v) { return '<bdi>' + esc(v) + '</bdi>'; }
  function ltr(v) { return '<bdi dir="ltr">' + esc(v) + '</bdi>'; }
  function feat() { return (RS.cloud && RS.cloud.feat) || {}; }
  function route() { var c = RS.router.current(); return (c && c.route) || ''; }
  function refreshIf(r) { if (route() === r) RS.refresh(); }
  function api(path, o) {
    o = o || {};
    var init = { method: o.method || 'GET', headers: { 'Content-Type': 'application/json' }, cache: 'no-store' };
    if (o.token) init.headers.Authorization = 'Bearer ' + o.token;
    if (o.body !== undefined) init.body = JSON.stringify(o.body);
    return fetch(API + path, init).then(function (r) {
      return r.text().then(function (txt) {
        var j = null; try { j = txt ? JSON.parse(txt) : null; } catch (e) { j = null; }
        if (!r.ok) { var err = new Error((j && j.message) || ('HTTP ' + r.status)); err.status = r.status; err.code = (j && j.error) || ''; throw err; }
        return j;
      });
    }, function () { var err = new Error('network'); err.status = 0; err.code = 'network'; throw err; });
  }
  function failText(e) { return t(e && e.status === 0 ? 'err.network' : (e && e.status === 404 ? 'buddy.gone' : 'err.generic')); }
  function copy(text, ok) {
    var done = function () { RS.toast(ok || t('cloud.copied'), { tone: 'success' }); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function () { manual(text); });
    else manual(text);
  }
  function manual(text) {
    RS.sheet.open({ title: t('cloud.copy.title'), body: '<p>' + esc(t('cloud.copy.body')) + '</p>' +
      ui.textarea({ id: 'so-copy', label: t('cloud.copy.label'), value: text, rows: 5, attrs: { readonly: 'readonly', dir: 'ltr' } }) });
  }
  function shareOrCopy(p, ok) {
    if (typeof navigator.share === 'function') { navigator.share(p).then(function () {}, function (e) { if (!e || e.name !== 'AbortError') copy(p.text + (p.url ? ' ' + p.url : ''), ok); }); }
    else copy(p.text + (p.url ? ' ' + p.url : ''), ok);
  }
  function download(text, name, type) {
    var blob = new Blob([text], { type: type }), url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); if (a.parentNode) a.parentNode.removeChild(a); }, 1500);
  }
  function val(id) { var el = document.getElementById(id); return el ? String(el.value || '').trim() : ''; }

  /* ------------------------------------------------------------------ my progress in a few numbers */
  function summary() {
    var T = RS.tracker || {}, day = RS.clamp(num(T.todayIndex ? T.todayIndex() : RS.settings.day) || 1, 1, 30);
    var tot = T.totals ? T.totals() : {}, st = T.streaks ? T.streaks() : {};
    var streak = Math.max(num(st.fajr), num(st.night), num(st.quran), num(st.charity));
    var mode = RS.appMode(), pct = mode === 'ramadan' && T.dayPct ? num(T.dayPct(day)) : 0;
    return { d: day, p: pct, s: streak, dl: num(tot.daysLogged), q: num(tot.quranPages), pts: num(tot.totalPts), m: mode };
  }

  /* ================================================================== family profiles */
  var FKEY = 'rsf-profiles';
  var DEVICE = { 'rs-dev-sw': 1, 'rs-inst-x': 1, 'rs-push': 1 };            // belong to the browser, not to a person
  function fam() { var f = RS.store.get(FKEY, null); return isObj(f) && Array.isArray(f.list) && f.list.length ? f : null; }
  function famOn() { var f = fam(); return !!f && f.list.length > 1; }
  function activeProfile() { var f = fam(); return f ? f.list.filter(function (p) { return p.id === f.active; })[0] || null : null; }
  function cleanName(s) { return String(s || '').replace(/\s+/g, ' ').trim().slice(0, 24); }
  function newId() { return 'p' + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36); }
  // What a new profile starts with: the language, look and prayer location of the device, nothing personal.
  function seedSettings() {
    var s = RS.settings, out = {};
    ['lang', 'theme', 'prayer', 'hijriOff'].forEach(function (k) { if (s[k] !== undefined) out[k] = s[k]; });
    return out;
  }
  function askSwitch(id, settings) {
    try { sessionStorage.setItem('rsf-switch', JSON.stringify({ to: id, settings: settings || null })); } catch (e) { RS.toast(t('fam.failed'), { tone: 'error' }); return; }
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();    // let a field being typed in save first
    setTimeout(function () { location.reload(); }, 60);
  }
  function profileStats(p, f) {
    if (p.id === f.active) { var s = summary(), T = RS.tracker && RS.tracker.totals ? RS.tracker.totals() : {}; return { dl: s.dl, pts: s.pts, q: s.q, avg: num(T.avgPct) }; }
    var data = RS.store.get('rsf-data-' + p.id, null), dl = 0, pts = 0, sum = 0, q = 0;
    if (isObj(data)) {
      for (var d = 1; d <= 30; d++) {
        var rec = null; try { rec = JSON.parse(data['rs-day-' + d] || 'null'); } catch (e) { rec = null; }
        if (isObj(rec) && num(rec.pct) > 0) { dl++; sum += num(rec.pct); }
        if (isObj(rec)) pts += num(rec.pts);
      }
      var qp = null; try { qp = JSON.parse(data['rs-quran-pages'] || 'null'); } catch (e) { qp = null; }
      if (isObj(qp)) for (var k = 1; k <= 30; k++) q += num(qp[k]);
    }
    return { dl: dl, pts: pts, q: q, avg: dl ? Math.round(sum / dl) : 0 };
  }
  function profileCard(p, f) {
    var on = p.id === f.active, st = profileStats(p, f);
    var btns = [];
    if (!on) btns.push(ui.btn(t('fam.switch'), { act: 'fam.switch', arg: p.id, icon: 'repeat', size: 'sm' }));
    btns.push(ui.btn(t('fam.rename'), { act: 'fam.rename', arg: p.id, variant: 'secondary', icon: 'pencil', size: 'sm' }));
    if (!on) btns.push(ui.btn(t('fam.remove'), { act: 'fam.remove', arg: p.id, variant: 'ghost', icon: 'trash-2', size: 'sm' }));
    return ui.card({ cls: 'so-profile' + (on ? ' is-on' : ''), kicker: { icon: on ? 'user-check' : 'user-round', text: on ? t('fam.inUse') : t('fam.profile') },
      title: p.name, body: ui.metrics([{ label: t('fam.mDays'), value: nf(st.dl) }, { label: t('fam.mAvg'), value: RS.fmt.pct(st.avg) },
        { label: t('fam.mPts'), value: nf(st.pts) }, { label: t('fam.mQuran'), value: nf(st.q) }]) + '<div class="so-btns">' + btns.join('') + '</div>' });
  }
  function renderFamily(view) {
    RS.topbar({ title: t('fam.title'), back: 'me' });
    var f = fam(), h = [];
    if (!f) {
      h.push(ui.hero({ kicker: { icon: 'users', text: t('fam.kicker') }, text: t('fam.intro'), cta: { eyebrow: t('fam.ctaEyebrow'), text: t('fam.add'), act: 'fam.add' } }));
      h.push(ui.card({ kicker: { icon: 'info', text: t('fam.howKicker') }, body: '<p>' + esc(t('fam.how')) + '</p>' }));
    } else {
      h.push(ui.hero({ kicker: { icon: 'users', text: t('fam.kicker') }, number: nf(f.list.length), label: tn('fam.count', f.list.length),
        text: t('fam.heroText', { name: (activeProfile() || f.list[0]).name }), cta: { eyebrow: t('fam.ctaEyebrow'), text: t('fam.add'), act: 'fam.add' } }));
      f.list.forEach(function (p) { h.push(profileCard(p, f)); });
      h.push(ui.note(t('fam.note'), { icon: 'shield-check', tone: 'plain' }));
    }
    view.innerHTML = h.join('');
  }
  function openAdd() {
    var f = fam(), first = !f;
    if (f && f.list.length >= 8) { RS.toast(t('fam.max'), { tone: 'error' }); return; }
    var u = RS.cloud && RS.cloud.user ? RS.cloud.user() : null;
    RS.sheet.open({ title: t('fam.add'), body: '<form data-act-submit="fam.create" novalidate>' +
      (first ? ui.field({ id: 'fam-mine', name: 'mine', label: t('fam.mineLabel'), value: (u && u.name) || '', maxlength: 24, hint: t('fam.mineHint'), required: true }) : '') +
      ui.field({ id: 'fam-new', name: 'name', label: t('fam.newLabel'), maxlength: 24, placeholder: t('fam.newPh'), required: true }) +
      '<p class="so-hint">' + esc(t('fam.addHint')) + '</p>' +
      ui.btn(t('fam.create'), { type: 'submit', block: true, icon: 'user-plus' }) + '</form>', focus: first ? '#fam-mine' : '#fam-new' });
  }
  RS.act('fam.add', openAdd);
  RS.act('fam.create', function (vals) {
    var f = fam(), name = cleanName(vals && vals.name), mine = cleanName(vals && vals.mine);
    if (!name || (!f && !mine)) { RS.toast(t('fam.nameNeeded'), { tone: 'error' }); return; }
    if (!f) f = { active: 'p1', list: [{ id: 'p1', name: mine }] };
    var id = newId();
    f.list.push({ id: id, name: name });
    if (!RS.store.set(FKEY, f)) { RS.toast(t('fam.failed'), { tone: 'error' }); return; }
    RS.sheet.close();
    askSwitch(id, seedSettings());
  });
  RS.act('fam.switch', function (id) {
    var f = fam();
    if (!f || id === f.active || !f.list.some(function (p) { return p.id === id; })) return;
    askSwitch(id, null);
  });
  RS.act('fam.rename', function (id) {
    var f = fam(), p = f && f.list.filter(function (x) { return x.id === id; })[0];
    if (!p) return;
    RS.sheet.open({ title: t('fam.rename'), body: '<form data-act-submit="fam.renameSave" data-arg="' + esc(id) + '" novalidate>' +
      ui.field({ id: 'fam-rn', name: 'name', label: t('fam.nameLabel'), value: p.name, maxlength: 24, required: true }) +
      ui.btn(t('core.save'), { type: 'submit', block: true }) + '</form>', focus: '#fam-rn' });
  });
  RS.act('fam.renameSave', function (vals, form) {
    var f = fam(), id = form.getAttribute('data-arg'), name = cleanName(vals && vals.name);
    if (!f || !name) return;
    f.list.forEach(function (p) { if (p.id === id) p.name = name; });
    RS.store.set(FKEY, f); RS.sheet.close(); RS.refresh();
  });
  RS.act('fam.remove', function (id) {
    var f = fam(), p = f && f.list.filter(function (x) { return x.id === id; })[0];
    if (!p || id === f.active) return;
    RS.confirm({ title: t('fam.removeTitle', { name: p.name }), body: t('fam.removeBody'), ok: t('fam.remove'), danger: true }).then(function (yes) {
      if (!yes) return;
      f.list = f.list.filter(function (x) { return x.id !== id; });
      RS.store.del('rsf-data-' + id);
      if (f.list.length <= 1) RS.store.del(FKEY); else RS.store.set(FKEY, f);
      RS.toast(t('fam.removed'), { tone: 'success' }); RS.refresh();
    });
  });
  function famRow() {
    var f = fam(), a = activeProfile();
    return ui.row({ icon: 'users', title: t('fam.title'), subHtml: f && a ? esc(t('fam.rowOn', { name: a.name })) : esc(t('fam.rowOff')), act: 'nav.go', arg: 'me/family', chevron: true });
  }

  /* ================================================================== accountability buddies */
  var KINDS = ['dua', 'keepGoing', 'proud', 'salam'];
  var bud = { views: {}, loading: {}, nudges: null, err: '', pushT: null, pending: null };
  function bstate() { var s = RS.store.get('rs-buddy', null); s = isObj(s) ? s : {}; if (!Array.isArray(s.follow)) s.follow = []; return s; }
  function bsave(s) { RS.store.set('rs-buddy', s); }
  function buddyUrl(code) { return location.origin + '/?buddy=' + code; }
  function daysAgo(iso) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(iso || ''))) return null;
    var p = iso.split('-'), then = new Date(+p[0], +p[1] - 1, +p[2], 12), now = new Date();
    return Math.max(0, Math.round((new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12) - then) / 864e5));
  }
  function activeText(iso) {
    var n = daysAgo(iso);
    if (n == null) return t('buddy.activeNever');
    return n === 0 ? t('buddy.activeToday') : (n === 1 ? t('buddy.activeYesterday') : tn('buddy.activeAgo', n));
  }
  function pushSummary(now) {
    var st = bstate();
    if (!st.mine || !feat().db) return;
    clearTimeout(bud.pushT);
    bud.pushT = setTimeout(function () {
      var s = bstate(); if (!s.mine) return;
      var sum = summary();
      if (sum.p > 0) { s.last = RS.todayISO(); bsave(s); }
      sum.last = s.last || undefined; delete sum.pts;
      api('/api/buddy/' + s.mine.code, { method: 'PUT', body: { token: s.mine.token, summary: sum } }).then(function (r) {
        var had = (bud.nudges || []).length; bud.nudges = (r && r.nudges) || [];
        if (bud.nudges.length !== had) { refreshIf('me/buddies'); refreshIf('me'); }
      }, function (e) { if (e.status === 404) { var x = bstate(); delete x.mine; bsave(x); refreshIf('me/buddies'); } });
    }, now ? 0 : 4000);
  }
  function loadBuddy(code) {
    if (bud.loading[code]) return;
    bud.loading[code] = true;
    api('/api/buddy/' + code).then(function (r) { bud.views[code] = r; var s = bstate(); s.follow.forEach(function (b) { if (b.code === code && r.name) b.name = r.name; }); bsave(s); },
      function (e) { bud.views[code] = { error: e.status === 404 ? 'gone' : 'failed' }; })
      .then(function () { bud.loading[code] = false; refreshIf('me/buddies'); });
  }
  function nudgeText(n) { return RS.has('buddy.nudge.' + n.k) ? t('buddy.nudge.' + n.k) : ''; }
  function summaryLine(v) {
    var s = (v && v.summary) || {}, parts = [];
    if (s.m === 'ramadan') { parts.push(t('buddy.sumDay', { day: nf(s.d || 1) })); parts.push(t('buddy.sumPct', { pct: RS.fmt.pct(num(s.p)) })); }
    else parts.push(t(s.m === 'prep' ? 'core.mode.prep' : 'core.mode.year'));
    if (num(s.s) > 0) parts.push(tn('buddy.sumStreak', num(s.s)));
    if (num(s.q) > 0) parts.push(tn('buddy.sumPages', num(s.q)));
    return ui.meta(parts.map(esc));
  }
  function followCard(b) {
    var v = bud.views[b.code];
    if (!v) { loadBuddy(b.code); return ui.card({ kicker: { icon: 'user-round', text: t('buddy.buddy') }, title: b.name || b.code, body: ui.loading() }); }
    if (v.error) {
      return ui.card({ kicker: { icon: 'user-round', text: t('buddy.buddy') }, title: b.name || b.code, body: ui.note(t(v.error === 'gone' ? 'buddy.gone' : 'err.generic'), { icon: 'circle-alert', tone: 'plain' }) +
        '<div class="so-btns">' + (v.error === 'gone' ? '' : ui.btn(t('core.retry'), { act: 'buddy.reload', arg: b.code, variant: 'secondary', size: 'sm', icon: 'refresh-cw' })) +
        ui.btn(t('buddy.unfollow'), { act: 'buddy.unfollow', arg: b.code, variant: 'ghost', size: 'sm', icon: 'x' }) + '</div>' });
    }
    var s = v.summary || {}, ring = s.m === 'ramadan' ? ui.ring(num(s.p), { size: 56, text: RS.fmt.pct(num(s.p)), label: t('buddy.sumPct', { pct: RS.fmt.pct(num(s.p)) }) }) : '';
    return ui.card({ cls: 'so-buddy', kicker: { icon: 'user-round', text: activeText(s.last) }, title: v.name,
      body: '<div class="so-buddy-row">' + ring + '<div>' + summaryLine(v) + '<p class="so-hint">' + esc(tn('buddy.sumDays', num(s.dl))) + '</p></div></div>' +
        '<div class="so-btns">' + ui.btn(t('buddy.encourage'), { act: 'buddy.nudgeOpen', arg: b.code, icon: 'heart-handshake', size: 'sm' }) +
        ui.btn(t('buddy.unfollow'), { act: 'buddy.unfollow', arg: b.code, variant: 'ghost', size: 'sm', icon: 'x' }) + '</div>' });
  }
  function mineCard() {
    var st = bstate();
    if (!feat().db) return ui.card({ kicker: { icon: 'heart-handshake', text: t('buddy.mineKicker') }, body: ui.note(t(feat().offline ? 'err.network' : 'buddy.unavailable'), { icon: 'cloud-off', tone: 'plain' }) });
    if (!st.mine) {
      var u = RS.cloud && RS.cloud.user ? RS.cloud.user() : null, a = activeProfile();
      return ui.card({ kicker: { icon: 'heart-handshake', text: t('buddy.mineKicker') }, title: t('buddy.startTitle'),
        body: '<p>' + esc(t('buddy.startBody')) + '</p><form data-act-submit="buddy.start" novalidate>' +
          ui.field({ id: 'bud-name', name: 'name', label: t('buddy.nameLabel'), value: (a && a.name) || (u && u.name) || st.from || '', maxlength: 24, hint: t('buddy.nameHint'), required: true }) +
          ui.btn(t('buddy.start'), { type: 'submit', block: true, icon: 'link' }) + '</form>' });
    }
    return ui.card({ kicker: { icon: 'heart-handshake', text: t('buddy.mineKicker') }, title: t('buddy.sharingAs', { name: st.mine.name }),
      body: '<p>' + esc(t('buddy.shareBody')) + '</p><p class="so-link">' + ltr(buddyUrl(st.mine.code)) + '</p>' +
        '<div class="so-btns">' + ui.btn(t('buddy.invite'), { act: 'buddy.invite', icon: 'send', size: 'sm' }) + ui.btn(t('buddy.copy'), { act: 'buddy.copy', variant: 'secondary', icon: 'copy', size: 'sm' }) +
        ui.btn(t('buddy.stop'), { act: 'buddy.stop', variant: 'ghost', icon: 'eye-off', size: 'sm' }) + '</div>' + ui.note(t('buddy.privacy'), { icon: 'shield-check', tone: 'plain' }) });
  }
  function nudgesCard() {
    var list = bud.nudges || [];
    if (!list.length) return '';
    var rows = list.slice().reverse().map(function (n) {
      var txt = nudgeText(n); if (!txt) return '';
      return ui.row({ icon: n.k === 'dua' ? 'hand-heart' : 'heart', titleHtml: bdi(n.from), sub: txt });
    }).filter(Boolean);
    if (!rows.length) return '';
    return ui.card({ id: 'bud-nudges', kicker: { icon: 'message-circle', text: t('buddy.received') }, action: { text: t('buddy.clear'), act: 'buddy.ack', icon: 'check' }, body: ui.list(rows) });
  }
  function pendingCard() {
    var p = bud.pending;
    if (!p) return '';
    var name = p.view ? p.view.name : p.code;
    return ui.card({ id: 'bud-pending', kicker: { icon: 'user-plus', text: t('buddy.pendingKicker') }, title: p.error ? t('buddy.gone') : t('buddy.pendingTitle', { name: name }),
      body: p.error ? '<div class="so-btns">' + ui.btn(t('core.close'), { act: 'buddy.pendingNo', variant: 'secondary', size: 'sm' }) + '</div>'
        : (p.view ? '<p>' + esc(t('buddy.pendingBody', { name: name })) + '</p><div class="so-btns">' + ui.btn(t('buddy.follow'), { act: 'buddy.pendingYes', icon: 'check', size: 'sm' }) +
          ui.btn(t('core.cancel'), { act: 'buddy.pendingNo', variant: 'ghost', size: 'sm' }) + '</div>' : ui.loading()) });
  }
  function renderBuddies(view) {
    RS.topbar({ title: t('buddy.title'), back: 'me' });
    var st = bstate(), h = [];
    h.push(ui.hero({ kicker: { icon: 'heart-handshake', text: t('buddy.kicker') }, number: nf(st.follow.length), label: tn('buddy.count', st.follow.length), text: t('buddy.intro') }));
    h.push(pendingCard());
    h.push(nudgesCard());
    h.push(mineCard());
    if (st.follow.length) st.follow.forEach(function (b) { h.push(followCard(b)); });
    else h.push(ui.card({ body: ui.empty({ icon: 'users', title: t('buddy.emptyTitle'), body: t('buddy.empty') }) }));
    view.innerHTML = h.join('');
  }
  RS.act('buddy.start', function (vals) {
    var name = cleanName(vals && vals.name);
    if (!name) { RS.toast(t('fam.nameNeeded'), { tone: 'error' }); return; }
    var sum = summary(); delete sum.pts;
    api('/api/buddy', { method: 'POST', body: { name: name, summary: sum } }).then(function (r) {
      var s = bstate(); s.mine = { code: r.code, token: r.token, name: r.name }; s.from = r.name; bsave(s);
      RS.toast(t('buddy.started'), { tone: 'success' }); RS.refresh();
    }, function (e) { RS.toast(failText(e), { tone: 'error' }); });
  });
  function inviteMsg() { var s = bstate(); return { title: t('core.app'), text: t('buddy.inviteText', { name: s.mine.name }), url: buddyUrl(s.mine.code) }; }
  RS.act('buddy.invite', function () { if (bstate().mine) shareOrCopy(inviteMsg(), t('buddy.copied')); });
  RS.act('buddy.copy', function () { var m = bstate().mine; if (m) copy(inviteMsg().text + ' ' + buddyUrl(m.code), t('buddy.copied')); });
  RS.act('buddy.stop', function () {
    RS.confirm({ title: t('buddy.stopTitle'), body: t('buddy.stopBody'), ok: t('buddy.stop'), danger: true }).then(function (yes) {
      var s = bstate(); if (!yes || !s.mine) return;
      var m = s.mine; delete s.mine; bsave(s); bud.nudges = null;
      api('/api/buddy/' + m.code, { method: 'DELETE', body: { token: m.token } }).then(function () {}, function () {});
      RS.toast(t('buddy.stopped'), { tone: 'success' }); RS.refresh();
    });
  });
  RS.act('buddy.ack', function () {
    var s = bstate(); bud.nudges = [];
    if (s.mine) api('/api/buddy/' + s.mine.code, { method: 'PUT', body: { token: s.mine.token, ack: true } }).then(function () {}, function () {});
    RS.refresh();
  });
  RS.act('buddy.reload', function (code) { delete bud.views[code]; RS.refresh(); });
  RS.act('buddy.unfollow', function (code) {
    var s = bstate(); s.follow = s.follow.filter(function (b) { return b.code !== code; }); bsave(s); delete bud.views[code]; RS.refresh();
  });
  RS.act('buddy.nudgeOpen', function (code) {
    var s = bstate(), v = bud.views[code] || {};
    RS.sheet.open({ title: t('buddy.encourageTitle', { name: v.name || '' }), body: '<p>' + esc(t('buddy.encourageBody')) + '</p>' +
      ui.field({ id: 'bud-from', label: t('buddy.fromLabel'), value: s.from || (s.mine && s.mine.name) || '', maxlength: 24 }) +
      ui.list(KINDS.map(function (k) { return ui.row({ icon: k === 'dua' ? 'hand-heart' : 'heart', title: t('buddy.nudge.' + k), act: 'buddy.nudge', arg: code + ':' + k, chevron: true }); })) });
  });
  RS.act('buddy.nudge', function (arg) {
    var p = String(arg).split(':'), from = cleanName(val('bud-from'));
    if (!from) { RS.toast(t('fam.nameNeeded'), { tone: 'error' }); return; }
    var s = bstate(); s.from = from; bsave(s);
    api('/api/buddy/' + p[0] + '/nudge', { method: 'POST', body: { kind: p[1], from: from } }).then(function () {
      RS.sheet.close(); RS.toast(t('buddy.sent'), { tone: 'success' });
    }, function (e) { RS.toast(failText(e), { tone: 'error' }); });
  });
  RS.act('buddy.pendingNo', function () { bud.pending = null; RS.refresh(); });
  RS.act('buddy.pendingYes', function () {
    var p = bud.pending, s = bstate();
    if (!p || !p.view) return;
    if (!s.follow.some(function (b) { return b.code === p.code; })) { s.follow.push({ code: p.code, name: p.view.name }); if (s.follow.length > 20) s.follow = s.follow.slice(-20); bsave(s); }
    bud.views[p.code] = p.view; bud.pending = null;
    RS.toast(t('buddy.following', { name: p.view.name }), { tone: 'success' }); RS.refresh();
  });
  function takeParams(p) {
    if (!p || !p.buddy) return;
    var code = String(p.buddy).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12), s = bstate();
    if (!code || (s.mine && s.mine.code === code)) return;
    if (s.follow.some(function (b) { return b.code === code; })) return;
    bud.pending = { code: code, view: null };
    api('/api/buddy/' + code).then(function (r) { if (bud.pending && bud.pending.code === code) bud.pending.view = r; },
      function () { if (bud.pending && bud.pending.code === code) bud.pending.error = true; }).then(function () { refreshIf('me/buddies'); });
  }
  function buddyRow() {
    var s = bstate(), n = (bud.nudges || []).length;
    var sub = n ? tn('buddy.rowNew', n) : (s.follow.length || s.mine ? tn('buddy.count', s.follow.length) : t('buddy.rowOff'));
    return ui.row({ icon: 'heart-handshake', title: t('buddy.title'), sub: sub, act: 'nav.go', arg: 'me/buddies', chevron: true });
  }

  /* ================================================================== calendar export (.ics) */
  function p2(n) { return (n < 10 ? '0' : '') + n; }
  function icsDate(d) { return d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate()); }
  function icsUtc(d) { return d.getUTCFullYear() + p2(d.getUTCMonth() + 1) + p2(d.getUTCDate()) + 'T' + p2(d.getUTCHours()) + p2(d.getUTCMinutes()) + '00Z'; }
  function icsText(s) { return String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/([,;])/g, '\\$1'); }
  function fold(line) {                                    // RFC 5545: lines of at most 75 octets
    var out = [], cur = '', bytes = 0;
    Array.from(line).forEach(function (ch) {
      var b = unescape(encodeURIComponent(ch)).length;
      if (bytes + b > 73) { out.push(cur); cur = ' '; bytes = 1; }
      cur += ch; bytes += b;
    });
    out.push(cur);
    return out.join('\r\n');
  }
  function addDays(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, 12); }
  // 1 Ramadan as this device counts it (the moon-sighting adjustment included): the Ramadan we are in, else the next.
  function ramadanStart() {
    var today = new Date(), base = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12);
    for (var i = -30; i <= 400; i++) {
      var d = addDays(base, i), h = RS.hijri(d);
      if (h.month === 9 && h.day === 1 && (i >= 0 || RS.hijri(base).month === 9)) return { date: d, year: h.year };
    }
    return null;
  }
  function buildIcs(events, name) {
    var stamp = icsUtc(new Date()), L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Ramadan Strivers//Calendar//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:' + icsText(name)];
    events.forEach(function (e, i) {
      L.push('BEGIN:VEVENT', 'UID:rs-' + e.uid + '-' + i + '@ramadanstrivers', 'DTSTAMP:' + stamp);
      if (e.at) { L.push('DTSTART:' + icsUtc(e.at), 'DTEND:' + icsUtc(new Date(e.at.getTime() + (e.mins || 30) * 60000))); }
      else { L.push('DTSTART;VALUE=DATE:' + icsDate(e.day), 'DTEND;VALUE=DATE:' + icsDate(addDays(e.day, 1)), 'TRANSP:TRANSPARENT'); }
      L.push('SUMMARY:' + icsText(e.title));
      if (e.desc) L.push('DESCRIPTION:' + icsText(e.desc));
      if (e.url) L.push('URL:' + e.url);
      L.push('END:VEVENT');
    });
    L.push('END:VCALENDAR');
    return L.map(fold).join('\r\n') + '\r\n';
  }
  var ODD = { 20: 21, 22: 23, 24: 25, 26: 27, 28: 29 };     // the evening of day 20 begins night 21, and so on
  function personalEvents(start, withTimes) {
    var ev = [], P = RS.cloud && RS.cloud.prayer, canTimes = withTimes && P && P.configured() && P.loaded();
    for (var n = 1; n <= 30; n++) {
      var d = addDays(start.date, n - 1), desc = [], pt = canTimes ? P.times(d) : null;
      if (pt && pt.fajr && pt.maghrib) desc.push(t('cal.times', { fajr: RS.fmt.time(pt.fajr), maghrib: RS.fmt.time(pt.maghrib) }));
      if (n === 20) desc.push(t('cal.lastTen'));
      if (ODD[n]) desc.push(t('cal.oddNight', { n: nf(ODD[n]) }));
      ev.push({ uid: 'day' + n, day: d, title: t('cal.day', { n: nf(n) }), desc: desc.join('\n'), url: location.origin + '/' });
      if (pt && pt.maghrib) ev.push({ uid: 'iftar' + n, at: pt.maghrib, mins: 30, title: t('cal.iftar', { n: nf(n) }), desc: t('cal.iftarDesc') });
    }
    ev.push({ uid: 'eid', day: addDays(start.date, 30), title: t('cal.eid'), desc: t('cal.moonNote') });
    return ev;
  }
  function openCalendar() {
    var start = ramadanStart(), P = RS.cloud && RS.cloud.prayer, hasTimes = !!(P && P.configured() && P.loaded());
    if (!start) { RS.toast(t('err.generic'), { tone: 'error' }); return; }
    RS.sheet.open({ title: t('cal.title'), body: '<p>' + esc(t('cal.body', { date: RS.fmt.date(start.date, { day: 'numeric', month: 'long', year: 'numeric' }), year: String(start.year) })) + '</p>' +
      ui.note(t(hasTimes ? 'cal.withTimes' : 'cal.noTimes'), { icon: hasTimes ? 'clock' : 'map-pin', tone: 'plain' }) + ui.note(t('cal.moonNote'), { icon: 'moon', tone: 'plain' }) +
      ui.btn(t('cal.download'), { act: 'cal.download', block: true, icon: 'download' }) });
  }
  RS.act('cal.open', openCalendar);
  RS.act('cal.download', function () {
    var start = ramadanStart(); if (!start) return;
    download(buildIcs(personalEvents(start, true), t('cal.name', { year: String(start.year) })), 'ramadan-' + start.year + '.ics', 'text/calendar;charset=utf-8');
    RS.sheet.close(); RS.toast(t('cal.done'), { tone: 'success' });
  });
  RS.act('cal.comp', function () {
    var c = curComp, start = ramadanStart(); if (!c || !start) return;
    var url = location.origin + '/?join=' + c.code, join = t('cal.compJoin', { code: c.code, url: url });
    var ev = [
      { uid: 'c1', day: start.date, title: t('cal.compStart', { name: c.name }), desc: join, url: url },
      { uid: 'c2', day: addDays(start.date, 19), title: t('cal.compLastTen', { name: c.name }), desc: t('cal.lastTen') + '\n' + join, url: url },
      { uid: 'c3', day: addDays(start.date, 29), title: t('cal.compEnd', { name: c.name }), desc: join, url: url },
      { uid: 'c4', day: addDays(start.date, 30), title: t('cal.compEid', { name: c.name }), desc: t('cal.moonNote'), url: url }
    ];
    download(buildIcs(ev, c.name), 'ramadan-' + String(c.code).toLowerCase() + '.ics', 'text/calendar;charset=utf-8');
    RS.toast(t('cal.done'), { tone: 'success' });
  });

  /* ================================================================== organiser: embed + insights */
  var curComp = null;
  var emb = { theme: 'light', view: 'individuals', n: '10' };
  function embedUrl(c) {
    return location.origin + '/embed.html?code=' + encodeURIComponent(c.code) + '&lang=' + RS.lang() + '&theme=' + emb.theme + '&view=' + emb.view + '&n=' + emb.n;
  }
  function embedCode(c) {
    return '<iframe src="' + embedUrl(c) + '" title="' + esc(c.name) + '" width="100%" height="' + (120 + Number(emb.n) * 44) + '" style="border:0;max-width:480px" loading="lazy"></iframe>';
  }
  function embedBody(c) {
    return '<p>' + esc(t('embed.body')) + '</p>' +
      ui.seg([{ value: 'individuals', text: t('compete.board.individuals') }, { value: 'teams', text: t('compete.board.teams') }], emb.view, { act: 'embed.view', label: t('embed.viewLabel') }) +
      ui.seg([{ value: 'light', text: t('theme.light') }, { value: 'dark', text: t('theme.dark') }], emb.theme, { act: 'embed.theme', label: t('embed.themeLabel') }) +
      ui.seg([{ value: '5', text: nf(5) }, { value: '10', text: nf(10) }, { value: '20', text: nf(20) }], emb.n, { act: 'embed.n', label: t('embed.nLabel') }) +
      ui.textarea({ id: 'embed-code', label: t('embed.codeLabel'), value: embedCode(c), rows: 5, attrs: { readonly: 'readonly', dir: 'ltr' } }) +
      '<div class="so-btns">' + ui.btn(t('embed.copy'), { act: 'embed.copy', icon: 'copy' }) + ui.btn(t('embed.preview'), { href: embedUrl(c), variant: 'secondary', icon: 'external-link' }) + '</div>' +
      ui.note(t('embed.note'), { icon: 'shield-check', tone: 'plain' });
  }
  function openEmbed() { if (curComp) RS.sheet.open({ title: t('embed.title'), body: '<div id="embed-body">' + embedBody(curComp) + '</div>', cls: 'so-embed' }); }
  function reEmbed() { var el = document.getElementById('embed-body'); if (el && curComp) el.innerHTML = embedBody(curComp); }
  RS.act('embed.open', openEmbed);
  RS.act('embed.view', function (v) { emb.view = v === 'teams' ? 'teams' : 'individuals'; reEmbed(); });
  RS.act('embed.theme', function (v) { emb.theme = v === 'dark' ? 'dark' : 'light'; reEmbed(); });
  RS.act('embed.n', function (v) { emb.n = ['5', '10', '20'].indexOf(v) >= 0 ? v : '10'; reEmbed(); });
  RS.act('embed.copy', function () { if (curComp) copy(embedCode(curComp), t('embed.copied')); });
  // Rows the organiser's Tools tab adds to its "Reports and printouts" list.
  function toolsRows(c) {
    curComp = c;
    return [
      ui.row({ icon: 'link', title: t('embed.row'), sub: t('embed.rowSub'), act: 'embed.open', chevron: true }),
      ui.row({ icon: 'calendar-days', title: t('cal.compRow'), sub: t('cal.compRowSub'), act: 'cal.comp', chevron: true })
    ];
  }

  var ins = { code: '', data: null, err: false, loading: false, at: 0 };
  function loadInsights(c, force) {
    if (ins.loading || (!force && ins.code === c.code && ins.data && Date.now() - ins.at < 60000)) return;
    var tok = RS.store.get('rs-auth', null);
    if (ins.code !== c.code) { ins.data = null; ins.err = false; }
    ins.code = c.code; ins.loading = true;
    api('/api/comp/' + c.code + '/analytics', { token: typeof tok === 'string' ? tok : (tok && tok.token) || '' }).then(function (r) { ins.data = r; ins.err = false; ins.at = Date.now(); },
      function () { ins.err = true; }).then(function () { ins.loading = false; if (route().indexOf('compete') === 0) RS.refresh(); });
  }
  function hbar(label, value, max, valueText) {
    var w = max > 0 ? Math.max(value > 0 ? 3 : 0, Math.round(value / max * 100)) : 0;
    return '<div class="so-hbar"><span class="so-hbar-l">' + label + '</span><span class="so-hbar-t" aria-hidden="true"><i style="inline-size:' + w + '%"></i></span><span class="so-hbar-v">' + esc(valueText) + '</span></div>';
  }
  function insightsHtml(c) {
    curComp = c; loadInsights(c, false);
    var d = ins.code === c.code ? ins.data : null;
    if (!d) {
      return ui.card({ id: 'cmp-insights', body: ins.err && !ins.loading ? ui.empty({ icon: 'cloud-off', title: t('ins.failed'), action: { text: t('core.retry'), act: 'ins.reload', icon: 'refresh-cw' } }) : ui.loading(t('ins.loading')) });
    }
    var T = d.totals, h = [];
    if (!T.started) return ui.card({ id: 'cmp-insights', body: ui.empty({ icon: 'chart-column', title: t('ins.emptyTitle'), body: t('ins.empty') }) });
    h.push(ui.card({ id: 'cmp-insights', kicker: { icon: 'chart-column', text: t('ins.overview') }, body: ui.metrics([
      { label: t('ins.mJoined'), value: nf(T.joined) }, { label: t('ins.mActive'), value: nf(T.activeNow) },
      { label: t('ins.mAvg'), value: RS.fmt.pct(T.avgPct) }, { label: t('ins.mDays'), value: RS.fmt.n(T.avgDays, { maximumFractionDigits: 1 }) }]) +
      '<div class="so-m2">' + ui.metrics([{ label: t('ins.mPts'), value: nf(T.totalPts) }, { label: t('ins.mPages'), value: nf(T.quranPages) },
        { label: t('ins.mKhatm'), value: RS.fmt.n(T.quranPages / 604, { maximumFractionDigits: 1 }) }, { label: t('ins.mInvited'), value: nf(T.invited) }]) + '</div><p class="so-hint">' + esc(t('ins.overviewSub')) + '</p>' }));
    var upto = Math.max(7, Math.min(30, d.today || 1)), days = d.daily.slice(0, upto);
    var labels = days.map(function (x) { return x.day === 1 || x.day % 5 === 0 ? nf(x.day) : ''; });
    h.push(ui.card({ kicker: { icon: 'users', text: t('ins.activeTitle') }, body: '<p class="so-hint">' + esc(t('ins.activeSub')) + '</p>' +
      ui.bars(days.map(function (x) { return x.active; }), { max: Math.max(1, T.joined), highlight: (d.today || 1) - 1, labels: labels, label: t('ins.activeTitle') }) }));
    h.push(ui.card({ kicker: { icon: 'chart-line', text: t('ins.pctTitle') }, body: '<p class="so-hint">' + esc(t('ins.pctSub')) + '</p>' +
      ui.bars(days.map(function (x) { return x.avgPct; }), { max: 100, highlight: (d.today || 1) - 1, labels: labels, label: t('ins.pctTitle') }) }));
    h.push(ui.card({ kicker: { icon: 'footprints', text: t('ins.retTitle') }, body: '<p class="so-hint">' + esc(t('ins.retSub')) + '</p>' +
      hbar(esc(t('ins.retJoined')), T.joined, T.joined, nf(T.joined)) +
      d.retention.map(function (r) { return hbar(esc(tn('ins.retDays', r.days)), r.count, T.joined, nf(r.count)); }).join('') }));
    var sp = d.spread, spMax = Math.max.apply(null, sp.concat([1]));
    h.push(ui.card({ kicker: { icon: 'layers', text: t('ins.spreadTitle') }, body: '<p class="so-hint">' + esc(t('ins.spreadSub')) + '</p>' +
      ['0–25', '25–50', '50–75', '75–100'].map(function (r, i) { return hbar(ltr(r + '%'), sp[i], spMax, nf(sp[i])); }).join('') }));
    if (d.teams.length) {
      var tm = Math.max.apply(null, d.teams.map(function (x) { return x.avgPts; }).concat([1]));
      h.push(ui.card({ kicker: { icon: 'school', text: t('ins.teamsTitle') }, body: '<p class="so-hint">' + esc(t('ins.teamsSub')) + '</p>' +
        d.teams.slice(0, 12).map(function (x) { return hbar(bdi(x.grp) + '<small>' + esc(t('ins.teamMeta', { active: nf(x.active), members: nf(x.members), pct: RS.fmt.pct(x.avgPct) })) + '</small>', x.avgPts, tm, nf(x.avgPts)); }).join('') }));
    }
    if (d.momentum.length) {
      h.push(ui.card({ kicker: { icon: 'flame', text: t('ins.momTitle') }, body: '<p class="so-hint">' + esc(t('ins.momSub')) + '</p>' + ui.list(d.momentum.map(function (x) {
        return ui.row({ icon: 'arrow-up-right', titleHtml: bdi(x.name), subHtml: x.grp ? bdi(x.grp) : '', value: tn('compete.ptsN', x.pts) }); })) }));
    }
    if (d.quiet.length || T.neverStarted) {
      var rows = d.quiet.map(function (x) { return ui.row({ icon: 'hourglass', titleHtml: bdi(x.name), subHtml: ui.meta([x.grp ? bdi(x.grp) : '', esc(t('ins.quietLast', { day: nf(x.lastDay) }))].filter(Boolean)) }); });
      h.push(ui.card({ kicker: { icon: 'bell', text: t('ins.quietTitle') }, body: '<p class="so-hint">' + esc(t('ins.quietSub')) + '</p>' +
        (T.neverStarted ? ui.note(tn('ins.never', T.neverStarted), { icon: 'user-plus', tone: 'plain' }) : '') + (rows.length ? ui.list(rows) : '') }));
    }
    h.push('<div class="so-btns so-end">' + ui.btn(t('ins.csv'), { act: 'ins.csv', variant: 'secondary', icon: 'download' }) + ui.btn(t('compete.refresh'), { act: 'ins.reload', variant: 'ghost', icon: 'refresh-cw' }) + '</div>');
    return h.join('');
  }
  RS.act('ins.reload', function () { if (curComp) { ins.data = null; loadInsights(curComp, true); RS.refresh(); } });
  RS.act('ins.csv', function () {
    if (!ins.data) return;
    var q = function (c) { return '"' + String(c).replace(/"/g, '""') + '"'; };
    var lines = [[t('ins.csvDay'), t('ins.csvActive'), t('ins.csvPct'), t('ins.csvPts'), t('ins.csvPages')].map(q).join(',')];
    ins.data.daily.forEach(function (x) { lines.push([x.day, x.active, x.avgPct, x.pts, x.pages].join(',')); });
    download('\ufeff' + lines.join('\r\n') + '\r\n', 'insights-' + String(ins.code).toLowerCase() + '.csv', 'text/csv;charset=utf-8');
  });

  /* ================================================================== home display + widget snapshot */
  // What a native widget (phone, watch) shows. Texts are already translated, times are epoch milliseconds, so the
  // native side only lays the values out. Sent to Capacitor Preferences (group "rs.widget") when the app runs in the
  // native wrapper; the web app itself does not need it.
  function widgetSnapshot() {
    var s = summary(), h = RS.hijri(), P = RS.cloud && RS.cloud.prayer, nx = P ? P.next() : null, pt = P && P.configured() && P.loaded() ? P.times(new Date()) : null;
    var out = { v: 1, at: Date.now(), lang: RS.lang(), dir: RS.dir(), mode: s.m, day: s.d, pct: s.p, streak: s.s, pages: s.q,
      title: s.m === 'ramadan' ? t('disp.day', { n: nf(s.d) }) : t('core.mode.' + s.m), hijri: RS.fmt.hijri(new Date()),
      pctText: RS.fmt.pct(s.p), streakText: tn('buddy.sumStreak', s.s), hijriMonth: h.month, labels: { iftar: t('disp.iftar'), suhoor: t('disp.suhoor'), next: t('disp.next'), open: t('core.app') } };
    if (pt) { out.fajr = +pt.fajr; out.maghrib = +pt.maghrib; out.fajrText = RS.fmt.time(pt.fajr); out.maghribText = RS.fmt.time(pt.maghrib); }
    if (nx) { out.nextName = nx.name; out.nextAt = +nx.time; out.nextText = RS.fmt.time(nx.time); }
    return out;
  }
  function pushWidget() {
    var C = window.Capacitor, Pref = C && C.Plugins && C.Plugins.Preferences;
    if (!Pref || !Pref.set) return;
    try {
      var go = function () { Pref.set({ key: 'snapshot', value: JSON.stringify(widgetSnapshot()) }); };
      if (Pref.configure) Pref.configure({ group: 'group.com.ramadanstrivers.app' }).then(go, go); else go();
    } catch (e) { /* the web app works without the native bridge */ }
  }
  var disp = { timer: null, lock: null };
  function dispHtml() {
    var now = new Date(), s = summary(), P = RS.cloud && RS.cloud.prayer, nx = P ? P.next() : null, pt = P && P.configured() && P.loaded() ? P.times(now) : null;
    var hd = s.m === 'ramadan' && RS.has('hadith.' + s.d) ? t('hadith.' + s.d) : '';
    var h = ['<div class="so-disp-top"><p class="so-disp-date">' + esc(RS.fmt.date(now, { weekday: 'long', day: 'numeric', month: 'long' })) + '</p><p class="so-disp-hijri">' + esc(RS.fmt.hijri(now)) + '</p></div>'];
    h.push('<p class="so-disp-clock" aria-live="off">' + esc(RS.fmt.time(now)) + '</p>');
    if (nx) h.push('<p class="so-disp-next">' + esc(t('disp.nextIn', { prayer: nx.name, time: RS.fmt.dur(Math.max(0, nx.inMs)) })) + '</p>');
    else h.push('<p class="so-disp-next">' + ui.btn(t('disp.setLocation'), { act: 'prayer.setup', variant: 'secondary', icon: 'map-pin' }) + '</p>');
    var tiles = [];
    if (pt) { tiles.push({ label: t('disp.suhoor'), value: RS.fmt.time(pt.fajr) }); tiles.push({ label: t('disp.iftar'), value: RS.fmt.time(pt.maghrib) }); }
    if (s.m === 'ramadan') { tiles.push({ label: t('disp.day', { n: nf(s.d) }), value: RS.fmt.pct(s.p) }); }
    if (s.s > 0) tiles.push({ label: t('disp.streak'), value: nf(s.s) });
    if (tiles.length) h.push('<div class="so-disp-tiles">' + ui.metrics(tiles, { onDark: true }) + '</div>');
    var hrec = hd ? ((RS.content && RS.content.hadith) || []).filter(function (x) { return x && x.n === s.d; })[0] : null;
    if (hd) h.push('<p class="so-disp-quote">' + esc(hd) + (hrec && hrec.ref ? '<br><small>' + ltr(hrec.ref) + '</small>' : '') + '</p>');
    h.push('<div class="so-disp-foot">' + ui.btn(t('disp.exit'), { act: 'disp.exit', variant: 'secondary', icon: 'x' }) + '</div>');
    return '<section class="so-disp" aria-label="' + esc(t('disp.title')) + '">' + h.join('') + '</section>';
  }
  function renderDisplay(view) { RS.topbar({ title: t('disp.title'), back: 'me' }); view.innerHTML = dispHtml(); }
  function dispShow() {
    document.documentElement.classList.add('is-display');
    clearInterval(disp.timer);
    disp.timer = setInterval(function () { var v = document.getElementById('view'); if (route() === 'display' && v && !RS.sheet.isOpen()) v.innerHTML = dispHtml(); }, 20000);
    try { if (navigator.wakeLock && navigator.wakeLock.request) navigator.wakeLock.request('screen').then(function (l) { disp.lock = l; }, function () {}); } catch (e) { /* optional */ }
  }
  function dispHide() {
    document.documentElement.classList.remove('is-display');
    clearInterval(disp.timer); disp.timer = null;
    try { if (disp.lock) disp.lock.release(); } catch (e) { /* ignore */ } disp.lock = null;
  }
  RS.act('disp.exit', function () { RS.router.back('me'); });
  function toolsCard() {
    return ui.card({ id: 'so-tools', kicker: { icon: 'users', text: t('so.kicker') }, body: ui.list([
      famRow(), buddyRow(),
      ui.row({ icon: 'calendar-days', title: t('cal.title'), sub: t('cal.rowSub'), act: 'cal.open', chevron: true }),
      ui.row({ icon: 'house', title: t('disp.title'), sub: t('disp.rowSub'), act: 'nav.go', arg: 'display', chevron: true })
    ]) });
  }

  /* ------------------------------------------------------------------ routes, events, hooks */
  RS.router.register('me/family', { tab: 'me', parent: 'me', title: function () { return t('fam.title'); }, render: renderFamily });
  RS.router.register('me/buddies', { tab: 'me', parent: 'me', title: function () { return t('buddy.title'); }, render: renderBuddies,
    onShow: function () { bud.views = {}; if (bstate().mine) pushSummary(true); } });
  RS.router.register('display', { tab: 'me', parent: 'me', title: function () { return t('disp.title'); }, render: renderDisplay, onShow: dispShow, onHide: dispHide });
  RS.on('params', takeParams);
  RS.on('data', function () { pushSummary(false); pushWidget(); });
  RS.on('lang', pushWidget);
  RS.on('boot', function () {
    if (RS.bootParams) takeParams(RS.bootParams);
    if (RS.cloud && RS.cloud.ready) RS.cloud.ready.then(function () { if (bstate().mine) pushSummary(true); pushWidget(); });
  });

  RS.social = {
    meCardsHtml: toolsCard,
    toolsRows: toolsRows,
    insightsHtml: insightsHtml,
    widgetSnapshot: widgetSnapshot,
    summary: summary,
    profile: activeProfile,
    familyOn: famOn,
    calendar: openCalendar,
    _ics: buildIcs
  };
})();
