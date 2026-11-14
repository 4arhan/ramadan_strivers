/* =====================================================================================================
   Ramadan Strivers v8 — admin.js: the super admin area (the people who run Ramadan Strivers itself).

   Who      Accounts whose email is listed in the server's SUPER_ADMIN_EMAILS setting. The server checks every
            request; this file only decides what to show.
   Route    me/admin: numbers for the whole platform, every competition (verify, suspend, remove), leagues and
            divisions (create, approve organisations), notes to organisers, feature switches and the change log.
   Hook     RS.admin.meCardHtml() (Me): the way in, shown to super admins only.
   ===================================================================================================== */
(function () {
  'use strict';
  var RS = window.RS, ui = RS.ui, esc = RS.esc;
  function t(k, v) { return RS.t(k, v); }
  function tn(k, n, v) { return RS.tn(k, n, v); }
  function num(n) { n = Number(n); return isFinite(n) ? n : 0; }
  function nf(n) { return RS.fmt.n(num(n), { maximumFractionDigits: 0 }); }
  function bdi(v) { return '<bdi>' + esc(v) + '</bdi>'; }
  function ltr(v) { return '<bdi dir="ltr">' + esc(v) + '</bdi>'; }
  function enc(v) { return encodeURIComponent(v); }
  function api(path, o) { return RS.cloud.api(path, o); }
  function fail(e) { if (e && e.handled) return; RS.toast(RS.cloud.errText(e), { tone: 'error' }); }
  function ok(msg) { RS.toast(msg, { tone: 'success' }); }
  function route() { var c = RS.router.current(); return (c && c.route) || ''; }
  function val(v, k) { return String(v[k] == null ? '' : v[k]).trim(); }
  function day(d) { return d ? RS.fmt.date(new Date(d), { day: 'numeric', month: 'short', year: 'numeric' }) : '–'; }
  function isSuper() { var m = RS.cloud && RS.cloud.cmp ? RS.cloud.cmp().mine : null; return !!(m && m.isSuper); }

  var TABS = [['overview', 'chart-column'], ['comps', 'building-2'], ['leagues', 'globe'], ['notices', 'bell'], ['switches', 'settings'], ['log', 'file-text']];
  var SWITCHES = ['leagues', 'signups', 'checkin', 'stories', 'ask', 'storyImages'];
  var st = { tab: 'overview', q: '', loading: {} };
  // st[key]: undefined = not asked or loading, null = failed, otherwise the answer
  function load(key, path) {
    if (st[key] !== undefined || st.loading[key]) return st[key];
    st.loading[key] = 1;
    api(path).then(function (r) { st[key] = r || null; }, function (e) { st[key] = null; st.err = e && e.status === 403 ? 'forbidden' : 'failed'; })
      .then(function () { delete st.loading[key]; if (route() === 'me/admin') RS.refresh(); });
    return undefined;
  }
  function again(key) { delete st[key]; }
  function wait(x) { return x === undefined ? ui.card({ body: ui.loading() }) : (x === null ? ui.card({ body: ui.empty({ icon: 'wifi-off', body: t(st.err === 'forbidden' ? 'adm.forbidden' : 'err.generic') }) }) : ''); }

  /* ------------------------------------------------------------------ overview */
  function overviewHtml() {
    var r = load('main', '/api/admin');
    if (!r) return wait(r);
    var T = r.totals || {}, h = [];
    h.push(ui.hero({ kicker: { icon: 'shield-check', text: t('adm.title') }, number: nf(T.participants), label: t('adm.m.participants'),
      metrics: [{ label: t('adm.m.comps'), value: nf(T.competitions) }, { label: t('adm.m.accounts'), value: nf(T.users) }, { label: t('adm.m.activeWeek'), value: nf(T.activeWeek) }] }));
    h.push(ui.card({ kicker: { icon: 'chart-column', text: t('adm.numbers') }, body: ui.list([
      ui.row({ icon: 'star', title: t('adm.m.points'), value: nf(T.points) }),
      ui.row({ icon: 'book-open', title: t('adm.m.pages'), value: nf(T.quranPages) }),
      ui.row({ icon: 'user-plus', title: t('adm.m.newWeek'), value: nf(T.newUsersWeek) }),
      ui.row({ icon: 'cloud', title: t('adm.m.sync'), value: nf(T.syncAccounts) }),
      ui.row({ icon: 'users', title: t('adm.m.buddies'), value: nf(T.buddies) }),
      ui.row({ icon: 'bell', title: t('adm.m.push'), value: nf(T.pushSubs) })
    ]) + '<p class="caption mt-2">' + esc(t('adm.numbersNote')) + '</p>' }));
    var types = Object.keys(r.byType || {}).sort(function (a, b) { return r.byType[b] - r.byType[a]; });
    if (types.length) h.push(ui.card({ kicker: { icon: 'building-2', text: t('adm.byType') }, body: ui.list(types.map(function (k) {
      return ui.row({ title: RS.has('compete.type.' + k) ? t('compete.type.' + k) : k, value: nf(r.byType[k]) }); })) }));
    var cc = Object.keys(r.byCountry || {}).sort(function (a, b) { return r.byCountry[b] - r.byCountry[a]; }).slice(0, 15);
    if (cc.length) h.push(ui.card({ kicker: { icon: 'globe', text: t('adm.byCountry') }, body: ui.list(cc.map(function (k) {
      return ui.row({ title: k === '??' ? t('adm.noCountry') : countryName(k), value: nf(r.byCountry[k]) }); })) + '<p class="caption mt-2">' + esc(t('adm.byCountryNote')) + '</p>' }));
    return h.join('');
  }
  function countryName(cc) { try { return new Intl.DisplayNames([RS.lang()], { type: 'region' }).of(cc) || cc; } catch (e) { return cc; } }

  /* ------------------------------------------------------------------ competitions */
  function compsHtml() {
    var r = load('main', '/api/admin');
    if (!r) return wait(r);
    var q = st.q.toLowerCase(), list = (r.competitions || []).filter(function (c) { return !q || (c.name + ' ' + c.code + ' ' + (c.owner || '') + ' ' + c.type).toLowerCase().indexOf(q) >= 0; });
    var rows = list.slice(0, 100).map(function (c) {
      var marks = (c.verified ? ' <span class="or-ver">' + RS.icon('badge-check', { size: 15 }) + '<span class="sr-only">' + esc(t('org.lg.verified')) + '</span></span>' : '') + (c.suspended ? ' ' + ui.chip(t('adm.suspended'), { icon: 'lock' }) : '');
      var sub = [ltr(c.code), esc(RS.has('compete.type.' + c.type) ? t('compete.type.' + c.type) : c.type), c.country ? esc(c.country) : '', esc(nf(c.participants) + ' ' + tn('compete.participantsWord', num(c.participants))),
        esc(t('adm.activeN', { n: nf(c.active) }))].filter(Boolean).join(' · ') + '<br>' + (c.owner ? ltr(c.owner) + ' · ' : '') + esc(t('adm.created', { date: day(c.created) }));
      var acts = ui.btn(t(c.verified ? 'adm.unverify' : 'adm.verify'), { size: 'sm', variant: 'secondary', icon: 'badge-check', act: 'adm.set', arg: c.code + ':verified:' + (c.verified ? 0 : 1) }) + ' ' +
        ui.btn(t(c.suspended ? 'adm.unsuspend' : 'adm.suspend'), { size: 'sm', variant: 'secondary', icon: 'lock', act: 'adm.set', arg: c.code + ':suspended:' + (c.suspended ? 0 : 1) }) + ' ' +
        ui.btn(t('adm.open'), { size: 'sm', variant: 'secondary', act: 'adm.openComp', arg: c.code }) + ' ' +
        ui.iconBtn('trash-2', { act: 'adm.del', arg: c.code, label: t('adm.remove', { name: c.name }), cls: 'cl-danger' });
      return ui.row({ titleHtml: bdi(c.name) + marks, subHtml: sub, extra: '<div class="or-row-acts">' + acts + '</div>', cls: c.suspended ? 'is-dim' : '' });
    });
    return ui.card({ kicker: { icon: 'building-2', text: t('adm.comps', { n: nf((r.competitions || []).length) }) },
      body: ui.field({ id: 'adm-q', label: t('adm.search'), value: st.q, placeholder: t('adm.searchPh'), actInput: 'adm.q', attrs: { autocomplete: 'off' } }) +
        '<div id="adm-comps" class="mt-2">' + (rows.length ? ui.list(rows) : ui.empty({ icon: 'search', body: t('adm.none') })) + '</div>' +
        (list.length > 100 ? '<p class="caption mt-2">' + esc(t('adm.first100')) + '</p>' : '') });
  }
  var qT = null;
  RS.act('adm.q', function (v, el) {
    st.q = String((el && el.value) || '').trim();
    clearTimeout(qT);
    qT = setTimeout(function () { if (route() !== 'me/admin') return; RS.refresh(); var i = document.getElementById('adm-q'); if (i) { i.focus(); try { i.setSelectionRange(i.value.length, i.value.length); } catch (e) { /* ignore */ } } }, 350);
  });
  RS.act('adm.set', function (arg) {
    var p = String(arg).split(':'), body = { code: p[0] };
    body[p[1]] = p[2] === '1';
    var go = function () { api('/api/admin', { method: 'PATCH', body: body }).then(function () { ok(t('org.saved')); again('main'); again('audit'); RS.refresh(); }, fail); };
    if (p[1] === 'suspended' && p[2] === '1') RS.confirm({ title: t('adm.suspendQ'), body: t('adm.suspendBody'), ok: t('adm.suspend') }).then(function (y) { if (y) go(); }); else go();
  });
  RS.act('adm.del', function (code) {
    RS.confirm({ title: t('adm.removeQ', { code: code }), body: t('adm.removeBody'), ok: t('adm.removeOk'), danger: true }).then(function (y) {
      if (y) api('/api/admin?code=' + enc(code), { method: 'DELETE' }).then(function () { again('main'); again('audit'); RS.refresh(); }, fail);
    });
  });
  RS.act('adm.openComp', function (code) { RS.cloud.openUrl((String(window.RS_API_BASE || '').replace(/\/+$/, '') || location.origin) + '/o/' + code, code); });

  /* ------------------------------------------------------------------ leagues */
  function leaguesHtml() {
    var r = load('leagues', '/api/admin/leagues');
    if (!r) return wait(r);
    var h = [];
    (r.leagues || []).forEach(function (l) {
      var rows = (l.members || []).map(function (m) {
        var acts = (m.status !== 'approved' ? ui.btn(t('adm.lg.approve'), { size: 'sm', act: 'adm.lgMember', arg: l.slug + ':' + m.code + ':approved' }) + ' ' : '') +
          (m.status !== 'rejected' ? ui.btn(t('adm.lg.reject'), { size: 'sm', variant: 'secondary', act: 'adm.lgMember', arg: l.slug + ':' + m.code + ':rejected' }) + ' ' : '') +
          ui.btn(t('adm.lg.division'), { size: 'sm', variant: 'secondary', act: 'adm.lgDiv', arg: l.slug + ':' + m.code + ':' + m.division });
        return ui.row({ titleHtml: bdi(m.name), subHtml: [ltr(m.code), esc(RS.org.divName(m.division)), esc(t('org.lg.st.' + m.status)), esc(nf(m.participants))].join(' · '), extra: '<div class="or-row-acts">' + acts + '</div>' });
      });
      h.push(ui.card({ kicker: { icon: 'globe', text: l.name }, body: '<p class="caption">' + ltr('/l/' + l.slug) + (l.country ? ' · ' + bdi(l.country) : '') + ' · ' + esc(t(l.open ? 'adm.lg.open' : 'adm.lg.closed')) + '</p>' +
        (rows.length ? ui.list(rows, { cls: 'mt-2' }) : ui.empty({ icon: 'globe', body: t('adm.lg.noMembers') })) +
        '<div class="or-row-acts mt-3">' + ui.btn(t('org.lg.table'), { size: 'sm', variant: 'secondary', icon: 'chart-column', act: 'org.lgOpen', arg: l.slug }) + ' ' +
        ui.btn(t(l.open ? 'adm.lg.close' : 'adm.lg.reopen'), { size: 'sm', variant: 'secondary', act: 'adm.lgOpen', arg: l.slug + ':' + (l.open ? 0 : 1) }) + ' ' +
        ui.btn(t('adm.lg.delete'), { size: 'sm', variant: 'danger', act: 'adm.lgDel', arg: l.slug }) + '</div>' }));
    });
    h.push(ui.card({ kicker: { icon: 'plus', text: t('adm.lg.new') }, body: '<form data-act-submit="adm.lgNew" novalidate>' +
      ui.field({ id: 'adm-lg-name', label: t('adm.lg.name'), maxlength: 80, placeholder: t('adm.lg.namePh') }) +
      ui.field({ id: 'adm-lg-country', label: t('adm.lg.country'), maxlength: 60 }) +
      ui.field({ id: 'adm-lg-about', label: t('adm.lg.about'), maxlength: 300 }) +
      ui.btn(t('adm.lg.create'), { type: 'submit', block: true, cls: 'mt-4' }) + '</form>' }));
    return h.join('');
  }
  function lgDone() { again('leagues'); again('audit'); RS.refresh(); }
  RS.act('adm.lgNew', function (v) {
    var name = val(v, 'adm-lg-name');
    if (name.length < 3) { RS.toast(t('adm.lg.needName'), { tone: 'error' }); return; }
    api('/api/admin/leagues', { method: 'POST', body: { name: name, country: val(v, 'adm-lg-country'), about: val(v, 'adm-lg-about') } }).then(function () { ok(t('org.saved')); lgDone(); }, fail);
  });
  RS.act('adm.lgMember', function (arg) {
    var p = String(arg).split(':');
    api('/api/admin/leagues', { method: 'PATCH', body: { slug: p[0], code: p[1], status: p[2] } }).then(lgDone, fail);
  });
  RS.act('adm.lgDiv', function (arg) {
    var p = String(arg).split(':'), divs = (st.leagues && st.leagues.divisions) || [];
    RS.sheet.open({ title: t('adm.lg.division'), body: '<form data-act-submit="adm.lgDivGo" novalidate><input type="hidden" name="slug" value="' + esc(p[0]) + '"><input type="hidden" name="code" value="' + esc(p[1]) + '">' +
      ui.select({ id: 'adm-lg-div', label: t('org.lg.division'), value: p.slice(2).join(':'), options: divs.map(function (d) { return { value: d, text: RS.org.divName(d) }; }) }) +
      ui.btn(t('compete.set.save'), { type: 'submit', block: true, cls: 'mt-4' }) + '</form>' });
  });
  RS.act('adm.lgDivGo', function (v) {
    api('/api/admin/leagues', { method: 'PATCH', body: { slug: val(v, 'slug'), code: val(v, 'code'), division: val(v, 'adm-lg-div') } }).then(function () { RS.sheet.close(); lgDone(); }, fail);
  });
  RS.act('adm.lgOpen', function (arg) {
    var p = String(arg).split(':');
    api('/api/admin/leagues', { method: 'PATCH', body: { slug: p[0], open: p[1] === '1' } }).then(lgDone, fail);
  });
  RS.act('adm.lgDel', function (slug) {
    RS.confirm({ title: t('adm.lg.deleteQ'), ok: t('adm.lg.delete'), danger: true }).then(function (y) { if (y) api('/api/admin/leagues?slug=' + enc(slug), { method: 'DELETE' }).then(lgDone, fail); });
  });

  /* ------------------------------------------------------------------ notes to organisers */
  function noticesHtml() {
    var r = load('notices', '/api/admin/misc?what=notices');
    if (!r) return wait(r);
    var rows = (r.notices || []).map(function (n) {
      return ui.row({ titleHtml: '<span dir="auto">' + esc(n.text) + '</span>', sub: day(n.created_at), trail: ui.iconBtn('trash-2', { act: 'adm.noticeDel', arg: n.id, label: t('adm.nt.remove'), cls: 'cl-danger' }) });
    });
    return ui.card({ kicker: { icon: 'bell', text: t('adm.nt.title') }, body: '<p class="caption">' + esc(t('adm.nt.hint')) + '</p><form class="mt-2" data-act-submit="adm.notice" novalidate>' +
      ui.textarea({ id: 'adm-nt-text', label: t('adm.nt.text'), maxlength: 500, rows: 3 }) +
      (RS.cloud.feat.email ? '<label class="or-check mt-2"><input type="checkbox" name="adm-nt-email" value="1"> <span>' + esc(t('adm.nt.email')) + '</span></label>' : '<p class="caption mt-2">' + esc(t('adm.nt.noEmail')) + '</p>') +
      ui.btn(t('adm.nt.post'), { type: 'submit', block: true, cls: 'mt-3' }) + '</form>' + (rows.length ? ui.list(rows, { cls: 'mt-4' }) : '') });
  }
  RS.act('adm.notice', function (v) {
    var text = val(v, 'adm-nt-text');
    if (!text) return;
    api('/api/admin/misc?what=notices', { method: 'POST', body: { text: text, email: !!v['adm-nt-email'] } }).then(function (r) {
      ok(r && r.emailed ? tn('adm.nt.sent', num(r.emailed)) : t('adm.nt.posted')); again('notices'); again('audit'); RS.refresh(); }, fail);
  });
  RS.act('adm.noticeDel', function (id) { api('/api/admin/misc?what=notices&id=' + enc(parseInt(id, 10)), { method: 'DELETE' }).then(function () { again('notices'); RS.refresh(); }, fail); });

  /* ------------------------------------------------------------------ feature switches */
  function switchesHtml() {
    var r = load('flags', '/api/admin/misc?what=flags');
    if (!r) return wait(r);
    var f = r.flags || {};
    return ui.card({ kicker: { icon: 'settings', text: t('adm.sw.title') }, body: '<p class="caption">' + esc(t('adm.sw.hint')) + '</p>' + ui.list(SWITCHES.map(function (k) {
      return ui.row({ title: t('adm.sw.' + k), sub: t('adm.sw.' + k + 'Sub'), toggle: { on: f[k] !== false, act: 'adm.flag', arg: k } });
    }), { cls: 'mt-2' }) });
  }
  RS.act('adm.flag', function (k) {
    var f = (st.flags && st.flags.flags) || {}, on = !(f[k] !== false);
    api('/api/admin/misc?what=flags', { method: 'PUT', body: { key: k, on: on } }).then(function () { f[k] = on; if (RS.cloud.feat.flags) RS.cloud.feat.flags[k] = on; again('audit'); RS.refresh(); }, fail);
  });

  /* ------------------------------------------------------------------ change log */
  function logHtml() {
    var r = load('audit', '/api/admin/misc?what=audit');
    if (!r) return wait(r);
    var rows = (r.log || []).map(function (x) {
      var k = 'org.audit.a.' + String(x.action).replace(/\./g, '_');
      return ui.row({ title: RS.has(k) ? t(k) : x.action, subHtml: [x.comp_code ? ltr(x.comp_code) : '', x.email ? ltr(x.email) : '', esc(RS.fmt.date(new Date(x.at), { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }))].filter(Boolean).join(' · ') });
    });
    return ui.card({ kicker: { icon: 'file-text', text: t('org.audit.title') }, body: rows.length ? ui.list(rows) : ui.empty({ icon: 'file-text', body: t('org.audit.empty') }) });
  }

  /* ------------------------------------------------------------------ the screen */
  function tabsHtml() {
    return '<div class="chips cl-tabs or-adm-tabs" role="group" aria-label="' + esc(t('adm.title')) + '">' + TABS.map(function (x) {
      return ui.chip(t('adm.tab.' + x[0]), { icon: x[1], active: st.tab === x[0], act: 'adm.tab', arg: x[0] });
    }).join('') + '</div>';
  }
  RS.act('adm.tab', function (v) { st.tab = TABS.some(function (x) { return x[0] === v; }) ? v : 'overview'; RS.refresh(); });
  RS.act('adm.refresh', function () { ['main', 'leagues', 'notices', 'flags', 'audit'].forEach(again); st.err = null; RS.refresh(); });
  function render(el) {
    RS.topbar({ title: t('adm.title'), back: 'me', actions: [{ icon: 'refresh-cw', act: 'adm.refresh', label: t('compete.refresh') }] });
    if (!RS.cloud.signedIn()) { el.innerHTML = ui.card({ body: ui.empty({ icon: 'lock', title: t('adm.signIn'), action: { text: t('compete.signIn'), act: 'acct.open', arg: 'login' } }) }); return; }
    var body = st.tab === 'comps' ? compsHtml() : st.tab === 'leagues' ? leaguesHtml() : st.tab === 'notices' ? noticesHtml() : st.tab === 'switches' ? switchesHtml() : st.tab === 'log' ? logHtml() : overviewHtml();
    el.innerHTML = tabsHtml() + body;
  }
  RS.router.register('me/admin', { tab: 'me', parent: 'me', title: function () { return t('adm.title'); }, render: render });

  // Me: the way in. Whether this account is a super admin comes with "my competitions" (asked once after sign-in).
  var asked = false;
  function meCardHtml() {
    if (!RS.cloud || !RS.cloud.signedIn || !RS.cloud.signedIn()) { asked = false; return ''; }
    var m = RS.cloud.cmp().mine;
    if (!m && !asked && RS.cloud.feat.accounts) { asked = true; RS.cloud.loadMine(false).then(function () { if (isSuper() && route() === 'me') RS.refresh(); }); }
    if (!isSuper()) return '';
    return ui.card({ cls: 'is-tight', body: ui.list([ui.row({ icon: 'shield-check', title: t('adm.title'), sub: t('adm.meSub'), act: 'nav.go', arg: 'me/admin', chevron: true })]) });
  }
  RS.admin = { meCardHtml: meCardHtml };
})();
