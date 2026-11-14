/* =====================================================================================================
   Ramadan Strivers v8 — org.js: what a school, mosque or community sets up around its competition.

   Organisers  the "Manage" tab of the dashboard: people who help (admin, teacher, viewer), weekly awards and a
               printable weekly report, a community goal, double-points days, a charity target, the organiser's
               own deeds, sign-up lists (iftar, volunteers), the check-in poster, consent slips, the public page,
               a class list from a spreadsheet, head-to-head challenges, leagues and the change log.
   Participants the same things from their side on Compete and Today: the announcement, the goal, own deeds to
               tick, the week's awards, sign-up lists, challenges, and checking in from a QR code (?checkin=).
   Routes      league (the league tables; ?s=<slug> opens one)
   Hooks       RS.org.manageHtml(comp, role, grp) · participantHtml(comp, state, board) · todayHtml(day) ·
               noticesHtml() · extraPts(day) · flag(name)
   Storage     rs-cdeeds {CODE: {day: {c1: 1}}} own deeds ticked · rs-org-seen {CODE: messageAt, notice: id}
               dismissed announcements · rs-org-cache {code, c, at} the competition's public settings
   ===================================================================================================== */
(function () {
  'use strict';
  var RS = window.RS, ui = RS.ui, esc = RS.esc;
  function t(k, v) { return RS.t(k, v); }
  function tn(k, n, v) { return RS.tn(k, n, v); }
  function num(n) { n = Number(n); return isFinite(n) ? n : 0; }
  function nf(n) { return RS.fmt.n(num(n), { maximumFractionDigits: 0 }); }
  function isObj(o) { return !!o && typeof o === 'object' && !Array.isArray(o); }
  function bdi(v) { return '<bdi>' + esc(v) + '</bdi>'; }
  function enc(v) { return encodeURIComponent(v); }
  function api(path, o) { return RS.cloud.api(path, o); }
  function fail(e) { if (e && e.handled) return; RS.toast(RS.cloud.errText(e), { tone: 'error' }); }
  function ok(msg) { RS.toast(msg, { tone: 'success' }); }
  function route() { var c = RS.router.current(); return (c && c.route) || ''; }
  function flag(k) { var f = (RS.cloud && RS.cloud.feat && RS.cloud.feat.flags) || {}; return f[k] !== false; }
  function liveDay() { var h = RS.hijri(); return h.month === 9 ? RS.clamp(h.day, 1, 30) : 0; }
  function origin() { return String(window.RS_API_BASE || '').replace(/\/+$/, '') || location.origin; }
  function val(v, k) { return String(v[k] == null ? '' : v[k]).trim(); }
  var WEEKS = [[1, 7], [8, 14], [15, 21], [22, 30]];
  function weekOf(d) { for (var i = 0; i < WEEKS.length; i++) if (d <= WEEKS[i][1]) return i + 1; return 4; }

  /* ------------------------------------------------------------------ data for the competition on screen */
  // st[key]: undefined = not asked yet or loading, null = could not be loaded, otherwise the answer.
  var st = { code: null, loading: {} };
  function ensure(code) { if (st.code !== code) st = { code: code, week: 0, loading: {} }; }
  function load(key, path, o) {
    if (st[key] !== undefined || st.loading[key]) return st[key];
    var code = st.code;
    st.loading[key] = 1;
    api(path, o).then(function (r) { if (st.code === code) st[key] = r || null; }, function () { if (st.code === code) st[key] = null; })
      .then(function () { if (st.code !== code) return; delete st.loading[key]; if (route() === 'compete' || route() === 'today') RS.refresh(); });
    return undefined;
  }
  function again(key) { delete st[key]; }
  function cmp() { return RS.cloud.cmp(); }
  function code() { var s = cmp().state; return s ? s.code : ''; }

  /* ------------------------------------------------------------------ weekly awards (organisers and participants) */
  function awardRow(icon, label, x, value) {
    return x ? ui.row({ icon: icon, title: label, subHtml: bdi(x.name) + (x.grp ? ' · ' + bdi(x.grp) : ''), value: value }) : '';
  }
  function awardsCard(c, org) {
    var b = cmp().board, today = liveDay();
    var w = st.week || weekOf(today || 1), a = load('aw' + w, '/api/comp/' + enc(c.code) + '/awards?week=' + w, { auth: false });
    var chips = '<div class="chips">' + WEEKS.map(function (r, i) { return ui.chip(t('org.aw.week', { n: nf(i + 1) }), { active: w === i + 1, act: 'org.week', arg: i + 1 }); }).join('') + '</div>';
    var body;
    if (a === undefined) body = ui.loading();
    else if (!a || !a.active) body = ui.empty({ icon: 'award', body: t('org.aw.empty') });
    else {
      var rows = (a.top || []).map(function (x, i) { return ui.row({ lead: '<span class="or-rank">' + esc(nf(i + 1)) + '</span>', titleHtml: bdi(x.name), subHtml: x.grp ? bdi(x.grp) : '', value: tn('compete.ptsN', num(x.pts)) }); });
      rows.push(awardRow('chart-column', t('org.aw.improved'), a.improved, a.improved ? '+' + nf(a.improved.gain) : ''));
      rows.push(awardRow('calendar-check', t('org.aw.consistent'), a.consistent, a.consistent ? tn('compete.days', num(a.consistent.days)) : ''));
      rows.push(awardRow('book-open', t('org.aw.quran'), a.quran, a.quran ? tn('org.pages', num(a.quran.pages)) : ''));
      if (a.team) rows.push(ui.row({ icon: 'users', title: t('org.aw.team'), subHtml: bdi(a.team.grp), value: tn('compete.ptsN', num(a.team.avgPts)) }));
      body = ui.list(rows.filter(Boolean), { cls: 'mt-3' });
    }
    return ui.card({ id: 'or-awards', kicker: { icon: 'award', text: t('org.aw.title') },
      body: '<p class="caption">' + esc(t('org.aw.days', { a: nf(WEEKS[w - 1][0]), b: nf(WEEKS[w - 1][1]) })) + '</p>' + chips + body +
        (org && a && a.active && b ? ui.btn(t('org.report.print'), { variant: 'secondary', block: true, icon: 'printer', act: 'org.report', cls: 'mt-3' }) : '') });
  }
  RS.act('org.week', function (n) { st.week = RS.clamp(parseInt(n, 10) || 1, 1, 4); RS.refresh(); });

  /* ------------------------------------------------------------------ goal, charity, bonus days: shown to everyone */
  function goalNow(g, b) {
    var sum = 0;
    ((b && b.individuals) || []).forEach(function (x) { sum += num(g.k === 'q' ? x.quranPages : (g.k === 'dl' ? x.daysLogged : x.totalPts)); });
    return sum;
  }
  function money(n, cur) { try { return new Intl.NumberFormat(RS.lang(), { style: 'currency', currency: cur || 'USD', maximumFractionDigits: 0 }).format(num(n)); } catch (e) { return nf(n) + ' ' + (cur || ''); } }
  function progressCard(c, b) {
    var s = isObj(c.settings) ? c.settings : {}, h = '';
    if (s.goal && s.goal.n) {
      var now = goalNow(s.goal, b), pct = Math.min(100, Math.round(now / s.goal.n * 100));
      h += '<p class="or-goal"><b>' + esc(t('org.goal.' + s.goal.k, { n: nf(s.goal.n) })) + '</b></p>' + ui.bar(pct, { label: t('org.goal.title') }) +
        '<p class="caption mt-2">' + esc(now >= s.goal.n ? t('org.goal.done') : t('org.goal.sofar', { n: nf(now), pct: RS.fmt.pct(pct) })) + '</p>';
    }
    if (s.charity && s.charity.target) {
      var cp = Math.min(100, Math.round(num(s.charity.raised) / s.charity.target * 100));
      h += '<p class="or-goal' + (h ? ' mt-4' : '') + '"><b>' + esc(s.charity.cause || t('org.charity.title')) + '</b></p>' + ui.bar(cp, { label: t('org.charity.title') }) +
        '<p class="caption mt-2">' + esc(t('org.charity.sofar', { raised: money(s.charity.raised, s.charity.currency), target: money(s.charity.target, s.charity.currency) })) + '</p>';
    }
    if ((s.bonus || []).length) {
      h += '<div class="chips' + (h ? ' mt-4' : '') + '">' + s.bonus.map(function (d) { return ui.chip(t('org.bonus.day', { n: nf(d) }), { icon: 'star', active: d === liveDay() }); }).join('') + '</div>' +
        '<p class="caption mt-2">' + esc(t('org.bonus.note')) + '</p>';
    }
    return h ? ui.card({ id: 'or-goal', kicker: { icon: 'target', text: t('org.goal.title') }, body: h }) : '';
  }

  /* ------------------------------------------------------------------ the organiser's own deeds, ticked by participants */
  function ticks() { var o = RS.store.get('rs-cdeeds', {}); return isObj(o) ? o : {}; }
  function cacheGet() { var o = RS.store.get('rs-org-cache', null); return isObj(o) && isObj(o.c) ? o : null; }
  // The competition this device takes part in, with its public settings: from Compete when it is loaded, else from the
  // copy kept for Today (refreshed in the background at most every 20 minutes).
  function myComp() {
    var x = RS.cloud && RS.cloud.cmp ? cmp() : null, s = x && x.state;
    if (!s || s.role !== 'participant') return null;
    if (x.comp && x.comp.code === s.code) { var k = cacheGet(); if (!k || k.code !== s.code || JSON.stringify(k.c.settings) !== JSON.stringify(x.comp.settings)) RS.store.set('rs-org-cache', { code: s.code, c: x.comp, at: Date.now() }); return x.comp; }
    var c = cacheGet();
    if (!c || c.code !== s.code || Date.now() - num(c.at) > 20 * 60000) prime(s.code);
    return c && c.code === s.code ? c.c : null;
  }
  var priming = false;
  function prime(cd) {
    if (priming || !RS.cloud.feat.competitions) return;
    priming = true;
    api('/api/comp/' + enc(cd), { auth: false }).then(function (r) {
      priming = false;
      if (!r || !r.competition) return;
      var old = cacheGet(), changed = !old || old.code !== cd || JSON.stringify(old.c.settings) !== JSON.stringify(r.competition.settings);
      RS.store.set('rs-org-cache', { code: cd, c: r.competition, at: Date.now() });
      if (changed && route() === 'today') RS.refresh();
    }, function () { priming = false; var o = cacheGet(); if (o) { o.at = Date.now(); RS.store.set('rs-org-cache', o); } });
  }
  function customOf(c) { var s = c && isObj(c.settings) ? c.settings : {}; return Array.isArray(s.custom) ? s.custom : []; }
  function extraPts(day) {
    var c = myComp(), list = customOf(c);
    if (!list.length) return 0;
    var tk = (ticks()[c.code] || {})[day] || {}, sum = 0;
    list.forEach(function (d) { if (tk[d.id]) sum += num(d.pts); });
    return sum;
  }
  function deedsCard(c, day) {
    var list = customOf(c);
    if (!list.length) return '';
    var tk = (ticks()[c.code] || {})[day] || {};
    var rows = list.map(function (d) {
      return ui.row({ titleHtml: bdi(d.label), sub: tn('compete.ptsN', num(d.pts)), check: day ? { on: !!tk[d.id], act: 'org.tick', arg: day + ':' + d.id } : null });
    });
    return ui.card({ id: 'or-deeds', kicker: { icon: 'list-checks', text: t('org.deeds.from', { name: c.name }) },
      body: ui.list(rows) + '<p class="caption mt-2">' + esc(t(day ? 'org.deeds.note' : 'org.deeds.later')) + '</p>' });
  }
  RS.act('org.tick', function (arg) {
    var c = myComp(), p = String(arg).split(':'), day = parseInt(p[0], 10), id = p[1];
    if (!c || !(day >= 1 && day <= 30) || !customOf(c).some(function (d) { return d.id === id; })) return;
    var all = ticks(), mine = all[c.code] = isObj(all[c.code]) ? all[c.code] : {}, d = mine[day] = isObj(mine[day]) ? mine[day] : {};
    if (d[id]) delete d[id]; else d[id] = 1;
    RS.store.set('rs-cdeeds', all);
    RS.cloud.scoreSoon();
    RS.refresh();
  });

  /* ------------------------------------------------------------------ sign-up lists */
  function signupsCard(c, org) {
    if (!flag('signups')) return '';
    var r = load('signups', '/api/comp/' + enc(c.code) + '/signups', { auth: false }), list = (r && r.signups) || [];
    var x = cmp(), me = x.board && x.board.me ? x.board.me.id : 0;
    if (!org && !list.length) return '';
    var rows = list.map(function (s) {
      var taken = s.taken || [], mine = taken.some(function (p) { return p.pid === me; }), left = Math.max(0, num(s.slots) - taken.length);
      var sub = [s.day ? bdi(s.day) : '', esc(left ? tn('org.su.left', left) : t('org.su.full'))].filter(Boolean).join(' · ') +
        (taken.length ? '<br>' + taken.map(function (p) { return bdi(p.name); }).join(', ') : '');
      var trail = org ? ui.iconBtn('trash-2', { act: 'org.suDel', arg: s.id, label: t('org.su.remove', { name: s.title }), cls: 'cl-danger' })
        : (mine ? ui.btn(t('org.su.leave'), { variant: 'secondary', size: 'sm', act: 'org.suJoin', arg: s.id + ':leave' })
          : (left ? ui.btn(t('org.su.join'), { size: 'sm', act: 'org.suJoin', arg: s.id + ':join' }) : ''));
      return ui.row({ titleHtml: bdi(s.title), subHtml: sub, trail: trail });
    });
    var form = !org ? '' : '<form class="mt-3" data-act-submit="org.suAdd" novalidate>' +
      ui.field({ id: 'or-su-title', label: t('org.su.what'), placeholder: t('org.su.whatPh'), maxlength: 80 }) +
      '<div class="or-two">' + ui.field({ id: 'or-su-day', label: t('org.su.when'), placeholder: t('org.su.whenPh'), maxlength: 40 }) +
      ui.field({ id: 'or-su-slots', label: t('org.su.places'), type: 'number', inputmode: 'numeric', min: 1, max: 200, value: 1 }) + '</div>' +
      ui.btn(t('org.su.add'), { type: 'submit', variant: 'secondary', block: true, icon: 'plus', cls: 'mt-3' }) + '</form>';
    return ui.card({ id: 'or-signups', kicker: { icon: 'hand-heart', text: t('org.su.title') },
      body: (org ? '<p class="caption">' + esc(t('org.su.hint')) + '</p>' : '') + (r === undefined ? ui.loading() : (rows.length ? ui.list(rows, { cls: org ? 'mt-2' : '' }) : '')) + form });
  }
  RS.act('org.suAdd', function (v) {
    var title = val(v, 'or-su-title');
    if (!title) { RS.toast(t('org.su.need'), { tone: 'error' }); return; }
    api('/api/comp/' + enc(code()) + '/signups', { method: 'POST', body: { title: title, day: val(v, 'or-su-day'), slots: parseInt(val(v, 'or-su-slots'), 10) || 1 } })
      .then(function () { again('signups'); RS.refresh(); }, fail);
  });
  RS.act('org.suDel', function (id) {
    api('/api/comp/' + enc(code()) + '/signups?id=' + enc(parseInt(id, 10)), { method: 'DELETE' }).then(function () { again('signups'); RS.refresh(); }, fail);
  });
  RS.act('org.suJoin', function (arg) {
    var p = String(arg).split(':'), s = cmp().state;
    if (!s || !s.token) return;
    api('/api/comp/' + enc(s.code) + '/signups', { method: 'PATCH', auth: false, body: { id: parseInt(p[0], 10), token: s.token, action: p[1] } })
      .then(function () { ok(t(p[1] === 'leave' ? 'org.su.left1' : 'org.su.joined')); again('signups'); RS.refresh(); }, function (e) { again('signups'); fail(e); RS.refresh(); });
  });

  /* ------------------------------------------------------------------ head to head */
  function h2hCard(c, org) {
    var r = load('h2h', '/api/comp/' + enc(c.code) + '/challenge', { auth: false }), list = (r && r.challenges) || [];
    if (!org) list = list.filter(function (x) { return x.status === 'active'; });
    if (!org && !list.length) return '';
    var rows = list.map(function (x) {
      var mine = x.a.code === c.code ? x.a : x.b, other = x.a.code === c.code ? x.b : x.a, lead = num(mine.avgPts) - num(other.avgPts);
      var state = x.status === 'pending' ? t(x.b.code === c.code ? 'org.h2h.asked' : 'org.h2h.waiting') : (x.status === 'declined' ? t('org.h2h.declined')
        : (lead > 0 ? t('org.h2h.ahead', { n: nf(lead) }) : (lead < 0 ? t('org.h2h.behind', { n: nf(-lead) }) : t('org.h2h.level'))));
      var acts = '';
      if (org && x.status === 'pending' && x.b.code === c.code) acts = ui.btn(t('org.h2h.accept'), { size: 'sm', act: 'org.h2hAnswer', arg: x.id + ':1' }) + ' ' + ui.btn(t('org.h2h.decline'), { size: 'sm', variant: 'secondary', act: 'org.h2hAnswer', arg: x.id + ':0' });
      else if (org) acts = ui.iconBtn('trash-2', { act: 'org.h2hDel', arg: x.id, label: t('org.h2h.remove'), cls: 'cl-danger' });
      return ui.row({ titleHtml: bdi(mine.name) + ' <span class="or-vs">' + esc(nf(mine.avgPts)) + ' : ' + esc(nf(other.avgPts)) + '</span> ' + bdi(other.name),
        sub: t('org.aw.days', { a: nf(x.startDay), b: nf(x.endDay) }) + ' · ' + state, trail: acts ? '<span class="cl-acts">' + acts + '</span>' : '' });
    });
    var form = !org ? '' : '<form class="mt-3" data-act-submit="org.h2hSend" novalidate><div class="or-two">' +
      ui.field({ id: 'or-h2h-code', label: t('org.h2h.code'), placeholder: 'ABC234', maxlength: 6, attrs: { autocapitalize: 'characters', dir: 'ltr', spellcheck: 'false' } }) +
      ui.select({ id: 'or-h2h-week', label: t('org.h2h.week'), value: Math.min(4, weekOf(liveDay() || 1) + (liveDay() ? 1 : 0)), options: WEEKS.map(function (w, i) { return { value: i + 1, text: t('org.aw.week', { n: nf(i + 1) }) }; }) }) + '</div>' +
      ui.btn(t('org.h2h.send'), { type: 'submit', variant: 'secondary', block: true, icon: 'trophy', cls: 'mt-3' }) + '</form>';
    return ui.card({ id: 'or-h2h', kicker: { icon: 'trophy', text: t('org.h2h.title') },
      body: '<p class="caption">' + esc(t(org ? 'org.h2h.hint' : 'org.h2h.note')) + '</p>' + (r === undefined ? ui.loading() : (rows.length ? ui.list(rows, { cls: 'mt-2' }) : '')) + form });
  }
  RS.act('org.h2hSend', function (v) {
    var other = val(v, 'or-h2h-code').toUpperCase(), w = RS.clamp(parseInt(val(v, 'or-h2h-week'), 10) || 1, 1, 4);
    if (!/^[A-Z0-9]{6}$/.test(other)) { RS.toast(t('org.h2h.need'), { tone: 'error' }); return; }
    api('/api/comp/' + enc(code()) + '/challenge', { method: 'POST', body: { other: other, startDay: WEEKS[w - 1][0] } }).then(function () { ok(t('org.h2h.sent')); again('h2h'); RS.refresh(); }, fail);
  });
  RS.act('org.h2hAnswer', function (arg) {
    var p = String(arg).split(':');
    api('/api/comp/' + enc(code()) + '/challenge', { method: 'PATCH', body: { id: parseInt(p[0], 10), accept: p[1] === '1' } }).then(function () { again('h2h'); RS.refresh(); }, fail);
  });
  RS.act('org.h2hDel', function (id) {
    api('/api/comp/' + enc(code()) + '/challenge?id=' + enc(parseInt(id, 10)), { method: 'DELETE' }).then(function () { again('h2h'); RS.refresh(); }, fail);
  });

  /* ------------------------------------------------------------------ leagues */
  function leagueCard(c, org) {
    if (!flag('leagues')) return '';
    var r = load('leagues', '/api/league?code=' + enc(c.code), { auth: false }), list = (r && r.leagues) || [];
    if (!org) list = list.filter(function (l) { return l.status === 'approved'; });
    if (!org && !list.length) return '';
    var rows = list.map(function (l) {
      var sub = [l.country ? bdi(l.country) : '', esc(tn('org.lg.orgs', num(l.organisations))), l.status ? esc(t('org.lg.st.' + l.status)) + (l.division ? ' · ' + esc(divName(l.division)) : '') : ''].filter(Boolean).join(' · ');
      var trail = !org ? '' : (l.status ? ui.btn(t('org.lg.leave'), { size: 'sm', variant: 'secondary', act: 'org.lgLeave', arg: l.slug }) : ui.btn(t('org.lg.join'), { size: 'sm', act: 'org.lgJoin', arg: l.slug }));
      return ui.row({ icon: 'globe', titleHtml: bdi(l.name), subHtml: sub, extra: '<div class="or-row-acts">' + ui.btn(t('org.lg.table'), { size: 'sm', variant: 'secondary', icon: 'chart-column', act: 'org.lgOpen', arg: l.slug }) + ' ' + trail + '</div>' });
    });
    return ui.card({ id: 'or-league', kicker: { icon: 'globe', text: t('org.lg.title') },
      body: '<p class="caption">' + esc(t(org ? 'org.lg.hint' : 'org.lg.note')) + '</p>' + (r === undefined ? ui.loading() : (rows.length ? ui.list(rows, { cls: 'mt-2' }) : ui.empty({ icon: 'globe', body: t('org.lg.none') }))) });
  }
  function divName(d) { var k = 'org.div.' + String(d).toLowerCase().replace(/[^a-z]+/g, '_'); return RS.has(k) ? t(k) : String(d); }
  RS.act('org.lgJoin', function (slug) {
    var r = st.leagues, divs = (r && r.divisions) || [], c = cmp().comp || {};
    var dflt = c.type === 'School' ? 'Secondary school' : (divs.indexOf(c.type) >= 0 ? c.type : 'Community');
    RS.sheet.open({ title: t('org.lg.join'), body: '<form data-act-submit="org.lgJoinGo" novalidate><input type="hidden" name="slug" value="' + esc(slug) + '">' +
      ui.select({ id: 'or-lg-div', label: t('org.lg.division'), hint: t('org.lg.divisionHint'), value: dflt, options: divs.map(function (d) { return { value: d, text: divName(d) }; }) }) +
      ui.btn(t('org.lg.ask'), { type: 'submit', block: true, cls: 'mt-4' }) + '</form>' });
  });
  RS.act('org.lgJoinGo', function (v) {
    api('/api/league', { method: 'POST', body: { slug: val(v, 'slug'), code: code(), division: val(v, 'or-lg-div') } }).then(function () { RS.sheet.close(); ok(t('org.lg.asked')); again('leagues'); RS.refresh(); }, fail);
  });
  RS.act('org.lgLeave', function (slug) {
    RS.confirm({ title: t('org.lg.leaveQ'), ok: t('org.lg.leave') }).then(function (yes) {
      if (yes) api('/api/league?slug=' + enc(slug) + '&code=' + enc(code()), { method: 'DELETE' }).then(function () { again('leagues'); RS.refresh(); }, fail);
    });
  });

  /* ------------------------------------------------------------------ organiser: people who help */
  var ROLES = ['admin', 'teacher', 'viewer'];
  function peopleCard(c) {
    var r = load('admins', '/api/comp/' + enc(c.code) + '/admins'), list = (r && r.admins) || [];
    var rows = list.map(function (a) {
      return ui.row({ icon: a.role === 'viewer' ? 'eye' : (a.role === 'teacher' ? 'users' : 'shield-check'), titleHtml: '<bdi dir="ltr">' + esc(a.email) + '</bdi>',
        sub: t('org.role.' + a.role) + (a.grp ? ' · ' + a.grp : '') + (a.registered ? '' : ' · ' + t('org.people.noAccount')),
        trail: ui.iconBtn('trash-2', { act: 'org.adminDel', arg: a.id, label: t('org.people.remove', { name: a.email }), cls: 'cl-danger' }) });
    });
    return ui.card({ id: 'or-people', kicker: { icon: 'shield-check', text: t('org.people.title') },
      body: '<p class="caption">' + esc(t('org.people.hint')) + '</p>' + (r === undefined ? ui.loading() : (rows.length ? ui.list(rows, { cls: 'mt-2' }) : '')) +
        '<form class="mt-3" data-act-submit="org.adminAdd" novalidate>' + ui.field({ id: 'or-ad-email', label: t('org.people.email'), type: 'email', inputmode: 'email', maxlength: 120, autocomplete: 'off' }) +
        '<div class="or-two">' + ui.select({ id: 'or-ad-role', label: t('org.people.role'), value: 'admin', options: ROLES.map(function (x) { return { value: x, text: t('org.role.' + x) }; }) }) +
        ui.field({ id: 'or-ad-grp', label: t('org.people.grp'), maxlength: 40 }) + '</div><p class="caption mt-2">' + esc(t('org.people.roles')) + '</p>' +
        ui.btn(t('org.people.add'), { type: 'submit', variant: 'secondary', block: true, icon: 'user-plus', cls: 'mt-3' }) + '</form>' });
  }
  RS.act('org.adminAdd', function (v) {
    var email = val(v, 'or-ad-email'), role = val(v, 'or-ad-role'), grp = val(v, 'or-ad-grp');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { RS.toast(t('org.people.badEmail'), { tone: 'error' }); return; }
    if (role === 'teacher' && !grp) { RS.toast(t('org.people.needGrp'), { tone: 'error' }); return; }
    api('/api/comp/' + enc(code()) + '/admins', { method: 'POST', body: { email: email, role: role, grp: grp } }).then(function () { ok(t('org.people.added')); again('admins'); again('audit'); RS.refresh(); }, fail);
  });
  RS.act('org.adminDel', function (id) {
    api('/api/comp/' + enc(code()) + '/admins?id=' + enc(parseInt(id, 10)), { method: 'DELETE' }).then(function () { again('admins'); again('audit'); RS.refresh(); }, fail);
  });

  /* ------------------------------------------------------------------ organiser: goal, bonus days, charity, own deeds */
  function fullSettings(c) { return Object.assign({}, isObj(c.settings) ? c.settings : {}, isObj(cmp().full) ? cmp().full : {}); }
  function goalsCard(c) {
    var s = fullSettings(c), g = s.goal || {}, ch = s.charity || {};
    return ui.card({ id: 'or-goals', kicker: { icon: 'target', text: t('org.set.title') },
      body: '<form data-act-submit="org.goals" novalidate><div class="or-two">' +
        ui.select({ id: 'or-g-k', label: t('org.set.goal'), value: g.k || '', options: [{ value: '', text: t('org.set.goalNone') }, { value: 'pts', text: t('org.set.goalPts') }, { value: 'q', text: t('org.set.goalQ') }, { value: 'dl', text: t('org.set.goalDl') }] }) +
        ui.field({ id: 'or-g-n', label: t('org.set.target'), type: 'number', inputmode: 'numeric', min: 1, value: g.n || '' }) + '</div>' +
        ui.field({ id: 'or-g-bonus', label: t('org.set.bonus'), value: (s.bonus || []).join(', '), placeholder: '27', hint: t('org.set.bonusHint'), attrs: { dir: 'ltr' } }) +
        ui.field({ id: 'or-g-cause', label: t('org.set.cause'), value: ch.cause || '', maxlength: 80, placeholder: t('org.set.causePh') }) +
        '<div class="or-three">' + ui.field({ id: 'or-g-ctarget', label: t('org.set.ctarget'), type: 'number', inputmode: 'numeric', min: 0, value: ch.target || '' }) +
        ui.field({ id: 'or-g-raised', label: t('org.set.raised'), type: 'number', inputmode: 'numeric', min: 0, value: ch.raised || '' }) +
        ui.field({ id: 'or-g-cur', label: t('org.set.currency'), value: ch.currency || '', maxlength: 3, placeholder: 'USD', attrs: { dir: 'ltr', autocapitalize: 'characters' } }) + '</div>' +
        '<p class="caption mt-2">' + esc(t('org.set.charityHint')) + '</p>' +
        ui.field({ id: 'or-g-country', label: t('org.set.country'), value: s.country || '', maxlength: 2, placeholder: 'GB', hint: t('org.set.countryHint'), attrs: { dir: 'ltr', autocapitalize: 'characters' } }) +
        ui.btn(t('compete.set.save'), { type: 'submit', block: true, cls: 'mt-4' }) + '</form>' });
  }
  function patchSettings(settings, msg) {
    return api('/api/comp/' + enc(code()), { method: 'PATCH', body: { settings: settings } }).then(function () {
      ok(msg || t('org.saved')); again('audit');
      return RS.cloud.reloadComp();
    }).then(function () { RS.refresh(); }, fail);
  }
  RS.act('org.goals', function (v) {
    var k = val(v, 'or-g-k'), n = parseInt(val(v, 'or-g-n'), 10), tgt = parseFloat(val(v, 'or-g-ctarget')) || 0;
    if (k && !(n >= 1)) { RS.toast(t('org.set.needTarget'), { tone: 'error' }); return; }
    patchSettings({ goal: k ? { k: k, n: n } : null, bonus: val(v, 'or-g-bonus').split(/[^0-9]+/).filter(Boolean).map(Number),
      charity: tgt > 0 ? { target: tgt, raised: parseFloat(val(v, 'or-g-raised')) || 0, currency: val(v, 'or-g-cur') || 'USD', cause: val(v, 'or-g-cause') } : null, country: val(v, 'or-g-country') });
  });
  function ownDeedsCard(c) {
    var list = customOf({ settings: fullSettings(c) }), h = '';
    for (var i = 0; i < 6; i++) {
      var d = list[i] || {};
      h += '<div class="or-deed">' + ui.field({ id: 'or-d-l' + i, label: t('org.own.label', { n: nf(i + 1) }), value: d.label || '', maxlength: 60, placeholder: i === 0 ? t('org.own.ph') : '' }) +
        ui.field({ id: 'or-d-p' + i, label: t('org.own.pts'), type: 'number', inputmode: 'numeric', min: 1, max: 30, value: d.pts || '' }) + '</div>';
    }
    return ui.card({ id: 'or-own', kicker: { icon: 'list-checks', text: t('org.own.title') },
      body: '<p class="caption">' + esc(t('org.own.hint')) + '</p><form class="mt-2" data-act-submit="org.own" novalidate>' + h + ui.btn(t('compete.set.save'), { type: 'submit', block: true, cls: 'mt-4' }) + '</form>' });
  }
  RS.act('org.own', function (v) {
    var out = [];
    for (var i = 0; i < 6; i++) { var l = val(v, 'or-d-l' + i); if (l) out.push({ label: l, pts: RS.clamp(parseInt(val(v, 'or-d-p' + i), 10) || 5, 1, 30) }); }
    patchSettings({ custom: out });
  });

  /* ------------------------------------------------------------------ organiser: pages to print and share, class list */
  function toolsCard(c, role) {
    var admin = role === 'owner' || role === 'admin';
    var rows = [];
    if (flag('checkin')) rows.push(ui.row({ icon: 'qr-code', title: t('org.tool.checkin'), sub: t('org.tool.checkinSub'), act: 'org.page', arg: 'checkin', chevron: true }));
    rows.push(ui.row({ icon: 'file-text', title: t('org.tool.slips'), sub: t('org.tool.slipsSub'), act: 'org.page', arg: 'slips', chevron: true }));
    rows.push(ui.row({ icon: 'upload', title: t('org.tool.csv'), sub: t('org.tool.csvSub'), act: 'org.csvPick', chevron: true }));
    if (admin) {
      rows.push(ui.row({ icon: 'globe', title: t('org.tool.public'), sub: t('org.tool.publicSub'), act: 'org.public', arg: 'open', chevron: true }));
      rows.push(ui.row({ icon: 'link', title: t('org.tool.publicCopy'), act: 'org.public', arg: 'copy', chevron: true }));
    }
    return ui.card({ id: 'or-tools', kicker: { icon: 'layers', text: t('org.tool.title') }, body: ui.list(rows) +
      '<input type="file" id="or-csv" accept=".csv,.txt,text/csv,text/plain" hidden>' });
  }
  RS.act('org.page', function (what) { RS.cloud.openPage(code(), what, t(what === 'slips' ? 'org.tool.slips' : 'org.tool.checkin')); });
  RS.act('org.public', function (how) {
    var url = origin() + '/o/' + code();
    if (how === 'copy') RS.cloud.copyText(url, t('org.tool.publicCopied')); else RS.cloud.openUrl(url, t('org.tool.public'));
  });
  RS.act('org.csvPick', function () { var el = document.getElementById('or-csv'); if (el) { el.value = ''; el.click(); } });
  // A class list from a spreadsheet saved as CSV: the first column is the name, the second (optional) the class or
  // team. A first line that looks like a heading ("Name, Class") is skipped.
  function parseCsv(text) {
    var out = [];
    String(text || '').replace(/^﻿/, '').split(/\r?\n/).forEach(function (line, i) {
      var cells = line.split(/[,;\t،؛，；]/).map(function (x) { return x.replace(/^\s*"?|"?\s*$/g, '').trim(); });
      if (!cells[0]) return;
      if (i === 0 && /^(name|full name|student|pupil|child|الاسم|nom|nombre|isim|nama)$/i.test(cells[0])) return;
      out.push({ name: cells[0].slice(0, 40), grp: (cells[1] || '').slice(0, 40) });
    });
    return out;
  }
  document.addEventListener('change', function (e) {
    var el = e.target;
    if (!el || el.id !== 'or-csv' || !el.files || !el.files[0]) return;
    var fr = new FileReader();
    fr.onload = function () {
      var names = parseCsv(fr.result);
      if (!names.length) { RS.toast(t('org.tool.csvEmpty'), { tone: 'error' }); return; }
      if (names.length > 1000) { RS.toast(t('org.tool.csvMany'), { tone: 'error' }); return; }
      RS.confirm({ title: tn('org.tool.csvQ', names.length), body: names.slice(0, 3).map(function (x) { return x.name + (x.grp ? ' (' + x.grp + ')' : ''); }).join(', ') + (names.length > 3 ? ' …' : ''), ok: t('org.tool.csvGo') }).then(function (yes) {
        if (yes) api('/api/comp/' + enc(code()) + '/enrol', { method: 'POST', body: { names: names } }).then(function (r) { RS.cloud.enrolDone(r); }, fail);
      });
    };
    fr.readAsText(el.files[0]);
  });

  /* ------------------------------------------------------------------ organiser: the weekly report to print */
  function openDoc(html, name) {
    var w = null;
    try { w = window.open('', '_blank'); } catch (e) { w = null; }
    if (w && !w.closed) { try { w.opener = null; w.document.open(); w.document.write(html); w.document.close(); return; } catch (e) { /* download instead */ } }
    var blob = new Blob([html], { type: 'text/html;charset=utf-8' }), url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name + '.html'; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1500);
  }
  RS.act('org.report', function () {
    var x = cmp(), c = x.comp, b = x.board, w = st.week || weekOf(liveDay() || 1), a = st['aw' + w];
    if (!c || !b || !a) return;
    var line = function (label, p, v) { return p ? '<tr><th>' + esc(label) + '</th><td>' + esc(p.name || p.grp) + (p.grp && p.name ? ' · ' + esc(p.grp) : '') + '</td><td class="n">' + esc(v) + '</td></tr>' : ''; };
    var s = isObj(c.settings) ? c.settings : {}, sum = 0, pages = 0;
    b.individuals.forEach(function (p) { sum += num(p.totalPts); pages += num(p.quranPages); });
    var html = '<!doctype html><html lang="' + esc(RS.lang()) + '" dir="' + esc(RS.dir()) + '"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + esc(c.name) + '</title><style>' +
      '@page{size:A4;margin:14mm}*{box-sizing:border-box}body{font:15px/1.45 Manrope,system-ui,-apple-system,"Segoe UI",Roboto,"Noto Sans Arabic",Arial,sans-serif;color:#101915;margin:0;padding:24px;max-width:720px;margin:auto}' +
      '.k{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#047857;font-weight:700}h1{font-size:30px;margin:2px 0 4px}h2{font-size:16px;margin:22px 0 6px}p{margin:4px 0;color:#4A5852}' +
      'table{width:100%;border-collapse:collapse}th,td{text-align:start;padding:8px 6px;border-bottom:1px solid #DCE5E0;font-weight:500}th{color:#4A5852;font-weight:600;width:34%}td.n{text-align:end;font-weight:700;white-space:nowrap}' +
      '.m{display:flex;gap:10px;margin-top:14px}.m div{flex:1;background:#F1F6F3;border-radius:14px;padding:12px}.m b{display:block;font-size:24px}.m span{font-size:12px;color:#4A5852}' +
      'button{margin-top:18px;font:inherit;padding:9px 18px;border-radius:999px;border:0;background:#0B2219;color:#fff}@media print{button{display:none}body{padding:0}}</style></head><body>' +
      '<div class="k">' + esc(t('org.report.kicker', { n: nf(w) })) + '</div><h1>' + esc(c.name) + '</h1><p>' + esc(t('org.aw.days', { a: nf(WEEKS[w - 1][0]), b: nf(WEEKS[w - 1][1]) })) + '</p>' +
      '<div class="m"><div><b>' + esc(nf(b.participants)) + '</b><span>' + esc(t('org.report.people')) + '</span></div><div><b>' + esc(nf(a.active)) + '</b><span>' + esc(t('org.report.active')) + '</span></div>' +
      '<div><b>' + esc(nf(sum)) + '</b><span>' + esc(t('org.report.points')) + '</span></div><div><b>' + esc(nf(pages)) + '</b><span>' + esc(t('org.report.pages')) + '</span></div></div>' +
      '<h2>' + esc(t('org.aw.title')) + '</h2><table>' + (a.top || []).map(function (p, i) { return line(t('compete.rankN', { n: nf(i + 1) }), p, tn('compete.ptsN', num(p.pts))); }).join('') +
      line(t('org.aw.improved'), a.improved, a.improved ? '+' + nf(a.improved.gain) : '') + line(t('org.aw.consistent'), a.consistent, a.consistent ? tn('compete.days', num(a.consistent.days)) : '') +
      line(t('org.aw.quran'), a.quran, a.quran ? tn('org.pages', num(a.quran.pages)) : '') + line(t('org.aw.team'), a.team, a.team ? tn('compete.ptsN', num(a.team.avgPts)) : '') + '</table>' +
      (s.goal && s.goal.n ? '<h2>' + esc(t('org.goal.title')) + '</h2><p>' + esc(t('org.goal.' + s.goal.k, { n: nf(s.goal.n) })) + ' · ' + esc(t('org.goal.sofar', { n: nf(goalNow(s.goal, b)), pct: RS.fmt.pct(Math.min(100, Math.round(goalNow(s.goal, b) / s.goal.n * 100))) })) + '</p>' : '') +
      (s.charity && s.charity.target ? '<h2>' + esc(s.charity.cause || t('org.charity.title')) + '</h2><p>' + esc(t('org.charity.sofar', { raised: money(s.charity.raised, s.charity.currency), target: money(s.charity.target, s.charity.currency) })) + '</p>' : '') +
      '<button onclick="print()">' + esc(t('org.report.btn')) + '</button></body></html>';
    openDoc(html, 'ramadan-week-' + w + '-' + c.code);
  });

  /* ------------------------------------------------------------------ organiser: what changed */
  function auditCard(c) {
    var r = load('audit', '/api/comp/' + enc(c.code) + '/audit'), list = (r && r.log) || [];
    if (r === undefined) return ui.card({ id: 'or-audit', kicker: { icon: 'file-text', text: t('org.audit.title') }, body: ui.loading() });
    var rows = list.slice(0, 30).map(function (x) {
      var k = 'org.audit.a.' + String(x.action).replace(/\./g, '_');
      return ui.row({ title: RS.has(k) ? t(k) : x.action, subHtml: (x.email ? '<bdi dir="ltr">' + esc(x.email) + '</bdi> · ' : '') + esc(RS.fmt.date(new Date(x.at), { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })) });
    });
    return ui.card({ id: 'or-audit', kicker: { icon: 'file-text', text: t('org.audit.title') }, body: rows.length ? ui.list(rows) : ui.empty({ icon: 'file-text', body: t('org.audit.empty') }) });
  }

  /* ------------------------------------------------------------------ the hooks */
  function manageHtml(c, role, grp) {
    ensure(c.code);
    var h = [], admin = role === 'owner' || role === 'admin';
    h.push(awardsCard(c, true));
    h.push(toolsCard(c, role));
    if (admin) {
      h.push(goalsCard(c));
      h.push(ownDeedsCard(c));
      h.push(signupsCard(c, true));
      h.push(h2hCard(c, true));
      h.push(leagueCard(c, true));
    }
    if (role === 'owner') h.push(peopleCard(c));
    if (admin) h.push(auditCard(c));
    return h.join('');
  }
  function participantHtml(c, s, b) {
    ensure(c.code);
    var h = [];
    h.push(progressCard(c, b));
    h.push(deedsCard(c, liveDay()));
    h.push(signupsCard(c, false));
    h.push(awardsCard(c, false));
    h.push(h2hCard(c, false));
    h.push(leagueCard(c, false));
    return h.join('');
  }
  // Today: the organiser's announcement (until dismissed), a double-points day, and the organiser's own deeds.
  function seen() { var o = RS.store.get('rs-org-seen', {}); return isObj(o) ? o : {}; }
  function todayHtml(day) {
    var c = myComp();
    if (!c) return '';
    var s = isObj(c.settings) ? c.settings : {}, h = '';
    if (s.message && s.messageAt && seen()[c.code] !== s.messageAt) {
      h += ui.card({ id: 'or-msg', kicker: { icon: 'bell', text: t('org.msg.from', { name: c.name }) }, body: '<p class="quote" dir="auto">' + esc(s.message) + '</p>' +
        ui.btn(t('org.msg.ok'), { variant: 'secondary', size: 'sm', act: 'org.msgSeen', cls: 'mt-3' }) });
    }
    if (day && (s.bonus || []).indexOf(day) >= 0 && liveDay() === day) h += ui.note(t('org.bonus.today', { name: c.name }), { icon: 'star' });
    if (day) h += deedsCard(c, day);
    return h;
  }
  RS.act('org.msgSeen', function () {
    var c = myComp(), o = seen();
    if (!c) return;
    o[c.code] = (c.settings || {}).messageAt; RS.store.set('rs-org-seen', o); RS.refresh();
  });
  // A note from Ramadan Strivers to the people who run competitions (the newest one, until dismissed).
  function noticesHtml() {
    var m = cmp().mine, n = m && m.notices && m.notices[0];
    if (!n || seen().notice === n.id) return '';
    return ui.card({ id: 'or-notice', cls: 'is-tight', kicker: { icon: 'bell', text: t('org.notice.title') }, body: '<p dir="auto">' + esc(n.text) + '</p>' +
      ui.btn(t('org.msg.ok'), { variant: 'secondary', size: 'sm', act: 'org.noticeSeen', arg: n.id, cls: 'mt-3' }) });
  }
  RS.act('org.noticeSeen', function (id) { var o = seen(); o.notice = parseInt(id, 10); RS.store.set('rs-org-seen', o); RS.refresh(); });

  /* ------------------------------------------------------------------ check-in from a QR code (?checkin=CODE.key) */
  function checkin(p) {
    var m = /^([A-Za-z0-9]{6})\.([A-Za-z0-9_-]{6,20})$/.exec(String(p || ''));
    if (!m || !RS.cloud) return;
    RS.cloud.ready.then(function () {
      var s = cmp().state, cd = m[1].toUpperCase();
      if (!s || s.role !== 'participant' || s.code !== cd || !s.token) { RS.toast(t('org.checkin.join'), { tone: 'error' }); RS.router.go('compete'); return; }
      api('/api/comp/' + enc(cd) + '/checkin', { method: 'POST', auth: false, body: { token: s.token, k: m[2] } }).then(function (r) {
        RS.sheet.open({ title: t('org.checkin.done'), body: ui.empty({ icon: 'circle-check', title: t(r && r.already ? 'org.checkin.already' : 'org.checkin.ok'), body: tn('org.checkin.count', num(r && r.count)) }) });
      }, fail);
    });
  }
  RS.on('params', function (p) { if (p && p.checkin) checkin(p.checkin); });

  /* ------------------------------------------------------------------ league tables */
  var lg = { list: undefined, tables: {} };
  function leagueTopbar(title, back) { RS.topbar({ title: title, back: back }); }
  function renderLeague(el, params) {
    var slug = String((params && params.s) || '').toLowerCase().replace(/[^a-z0-9-]/g, '');
    if (!slug) {
      leagueTopbar(t('org.lg.title'), 'compete');
      if (lg.list === undefined) { lg.list = false; api('/api/league', { auth: false }).then(function (r) { lg.list = (r && r.leagues) || []; }, function () { lg.list = null; }).then(function () { if (route() === 'league') RS.refresh(); }); }
      if (!lg.list) { el.innerHTML = ui.card({ body: lg.list === null ? ui.empty({ icon: 'wifi-off', body: t('err.network') }) : ui.loading() }); return; }
      el.innerHTML = ui.hero({ kicker: { icon: 'globe', text: t('org.lg.title') }, text: t('org.lg.heroText') }) + ui.card({ body: lg.list.length ? ui.list(lg.list.map(function (l) {
        return ui.row({ icon: 'globe', titleHtml: bdi(l.name), subHtml: [l.country ? bdi(l.country) : '', esc(tn('org.lg.orgs', num(l.organisations)))].filter(Boolean).join(' · '), act: 'org.lgOpen', arg: l.slug, chevron: true });
      })) : ui.empty({ icon: 'globe', body: t('org.lg.none') }) });
      return;
    }
    var T = lg.tables[slug];
    if (T === undefined) { lg.tables[slug] = false; api('/api/league/' + enc(slug), { auth: false }).then(function (r) { lg.tables[slug] = r || null; }, function () { lg.tables[slug] = null; }).then(function () { if (route() === 'league') RS.refresh(); }); }
    leagueTopbar(T && T.league ? T.league.name : t('org.lg.title'), 'league');
    if (!T) { el.innerHTML = ui.card({ body: T === null ? ui.empty({ icon: 'globe', body: t('org.lg.notFound') }) : ui.loading() }); return; }
    var mine = code(), h = [];
    h.push(ui.hero({ kicker: { icon: 'globe', text: T.league.country || t('org.lg.title') }, number: nf(T.organisations), label: tn('org.lg.orgsWord', num(T.organisations)),
      metrics: [{ label: t('org.lg.m.people'), value: nf(T.participants) }, { label: t('org.lg.m.divisions'), value: nf((T.divisions || []).length) }], text: T.league.about || '' }));
    (T.divisions || []).forEach(function (d) {
      h.push(ui.card({ kicker: { icon: 'trophy', text: divName(d.name) }, body: ui.list(d.rows.map(function (o) {
        return ui.row({ lead: '<span class="or-rank">' + esc(o.rank ? nf(o.rank) : '–') + '</span>', cls: o.code === mine ? 'or-me' : '',
          titleHtml: bdi(o.name) + (o.verified ? ' <span class="or-ver" title="' + esc(t('org.lg.verified')) + '">' + RS.icon('badge-check', { size: 15 }) + '<span class="sr-only">' + esc(t('org.lg.verified')) + '</span></span>' : ''),
          sub: tn('org.lg.active', num(o.active)) + (o.rank ? '' : ' · ' + t('org.lg.unranked', { n: nf(T.minActive) })), value: nf(o.avgPts) });
      })) + '<p class="caption mt-2">' + esc(t('org.lg.how')) + '</p>' }));
    });
    if ((T.charity || []).length) {
      h.push(ui.card({ kicker: { icon: 'hand-heart', text: t('org.lg.charity') }, body: ui.list(T.charity.map(function (o) {
        return ui.row({ lead: '<span class="or-rank">' + esc(nf(o.rank)) + '</span>', titleHtml: bdi(o.name), sub: t('org.charity.sofar', { raised: money(o.raised, o.currency), target: money(o.target, o.currency) }), value: RS.fmt.pct(o.pct) });
      })) }));
    }
    if (!(T.divisions || []).length) h.push(ui.card({ body: ui.empty({ icon: 'globe', body: t('org.lg.emptyTable') }) }));
    h.push(ui.card({ cls: 'is-tight', body: ui.list([ui.row({ icon: 'link', title: t('org.lg.share'), act: 'org.lgShare', arg: slug, chevron: true })]) }));
    el.innerHTML = h.join('');
  }
  RS.act('org.lgOpen', function (slug) { RS.router.go('league', { s: slug }); });
  RS.act('org.lgShare', function (slug) { RS.cloud.copyText(origin() + '/l/' + slug, t('org.tool.publicCopied')); });
  RS.router.register('league', { tab: 'compete', parent: 'compete', title: function () { return t('org.lg.title'); }, render: renderLeague });

  RS.org = { manageHtml: manageHtml, participantHtml: participantHtml, todayHtml: todayHtml, noticesHtml: noticesHtml, extraPts: extraPts, flag: flag, divName: divName, money: money };
})();
