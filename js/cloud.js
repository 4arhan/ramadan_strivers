/* =====================================================================================================
   Ramadan Strivers v8 — cloud.js (cloud module)
   Accounts · cloud sync · competitions (participant + organiser) · daily push reminders · share progress ·
   prayer times · AI helpers · server-dependent settings rows. Ported from v7 cloud.js and redesigned with RS.ui.
   Everything degrades gracefully: without a database (feature flags from /api/health), offline, or when an API
   call fails, the tracker keeps working and these features hide or explain themselves.

   Hooks (CONTRACT §8)  RS.cloud.{ready, feat, user(), syncSoon(), syncNow(verbose), shareProgress(), competition(),
     prayer:{configured(), cta(), cardHtml(), next(), times(date), loaded()}, meCardsHtml(), settingsRowsHtml(),
     aiAvailable(), explain(deedId), reflect(), quizTransform(cards), give()}
   Actions  prayer.open · prayer.setup · ai.explain (arg deedId) · cloud.give · share.progress · push.toggle ·
     cloud.account, plus internal acct.* · cmp.* · prayer.* · push.* · share.* · ai.* actions
   Routes   compete · compete/board · compete/org
   Storage (v6/v7-compatible)  rs-auth (raw token) · rs-user · rs-sync-at · rs-push · rs-comp {role, code, token?, name?,
     grp?, cname?, donate?} · rs-comp-prev [participant entries this device switched away from, newest first, max 5:
     their personal tokens cannot be recovered otherwise] · sessionStorage rs-invite (+ rs-invite-code) ·
     RS.settings.prayer {lat, lng, method, madhab?} (coordinates rounded to 2 decimals, about 1 km) ·
     RS.settings.quizLevel · rs-sync-meta {q: {day: {p, ts}}, s: {prayer|mode: {v, ts}}} (when this device last changed
     a day's Quran pages, the prayer location and the mode; see "cloud sync").
     The cloud snapshot keeps the v7 shape and adds extras.learn (rs-learn), extras.prep (rs-prep), extras.qPagesTs,
     settings.season / prayerTs / modeTs and a season on each Ramadan day record and Ramadan journal entry.
   ===================================================================================================== */
(function () {
  'use strict';
  var RS = window.RS;
  if (!RS || !RS.router || !RS.ui) return;

  var ui = RS.ui;
  var esc = RS.esc;
  var hasOwn = Object.prototype.hasOwnProperty;
  var API = String(window.RS_API_BASE || '').replace(/\/+$/, '');
  var DEFAULT_DONATE = 'https://www.launchgood.com/';
  var TYPES = ['School', 'University', 'Mosque', 'Community', 'Company', 'Family', 'Other'];
  var METHODS = ['MuslimWorldLeague', 'NorthAmerica', 'Egyptian', 'Karachi', 'UmmAlQura', 'Dubai', 'Kuwait', 'Qatar',
    'Singapore', 'Turkey', 'Tehran', 'MoonsightingCommittee'];
  var FIVE = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];
  var PUSH_HOURS = [6, 7, 8, 12, 17, 18, 19, 20, 21, 22];
  // The dua when breaking the fast (Abu Dawud 2357, hasan per al-Albani). Arabic and transliteration stay untranslated.
  var IFTAR_DUA = {
    ar: 'ذَهَبَ الظَّمَأُ وَابْتَلَّتِ الْعُرُوقُ وَثَبَتَ الْأَجْرُ إِنْ شَاءَ اللَّهُ',
    tr: "Dhahaba al-zama' wabtallat al-'uruq wa thabata al-ajr in sha Allah",
    ref: 'Abu Dawud 2357',
    grade: 'Hasan (al-Albani)'
  };

  /* ------------------------------------------------------------------ small helpers */
  function t(k, v) { return RS.t(k, v); }
  function tn(k, n, v) { return RS.tn(k, n, v); }
  function isObj(o) { return !!o && typeof o === 'object' && !Array.isArray(o); }
  function objOr(o) { return isObj(o) ? o : {}; }
  function num(n) { n = Number(n); return isFinite(n) ? n : 0; }
  function enc(s) { return encodeURIComponent(String(s == null ? '' : s)); }
  function noop() {}
  function nf(n) { return RS.fmt.n(num(n), { maximumFractionDigits: 0 }); }
  function validEmail(s) { return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(s || '')); }
  function routeNow() { var c = RS.router.current(); return (c && c.route) || ''; }
  function onCompete() { var r = routeNow(); return r === 'compete' || r === 'compete/board'; }
  function started() { return !!(RS.router.started && RS.router.started()); }
  function sameJson(a, b) {                     // deep equality, key order ignored (Postgres JSONB reorders keys)
    if (a === b) return true;
    if (Array.isArray(a) || Array.isArray(b)) {
      if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
      for (var i = 0; i < a.length; i++) if (!sameJson(a[i], b[i])) return false;
      return true;
    }
    if (isObj(a) && isObj(b)) {
      var ka = Object.keys(a), kb = Object.keys(b);
      if (ka.length !== kb.length) return false;
      for (var j = 0; j < ka.length; j++) if (!hasOwn.call(b, ka[j]) || !sameJson(a[ka[j]], b[ka[j]])) return false;
      return true;
    }
    return false;
  }
  // User text (names, groups, prizes) inside the UI: isolate its direction so "Aisha K." keeps its full stop in
  // right-to-left languages. bdi(text) → HTML · th(key, vars) → the escaped UI string with each value in <bdi>.
  function bdi(v) { return '<bdi>' + esc(v) + '</bdi>'; }
  function th(key, vars) {
    var marks = [], v2 = {};
    Object.keys(vars || {}).forEach(function (k, i) { var m = '\u0001' + i + '\u0002'; marks.push([m, bdi(vars[k])]); v2[k] = m; });
    var out = esc(RS.t(key, v2));
    marks.forEach(function (x) { out = out.split(x[0]).join(x[1]); });
    return out;
  }
  // Detail lines ("Grade 9A · 16 days · 87%"): RS.ui.meta draws the separators, so none is left dangling at a line
  // break; each item is isolated (<bdi>), so mixed scripts and numbers keep their order in right-to-left languages.
  function metaLine(items) { return ui.meta((items || []).filter(function (x) { return x != null && x !== ''; }).map(bdi)); }
  // Coordinates read left to right in every language ("51.51, -0.13"): one LTR isolate.
  function ltr(text) { return '<bdi dir="ltr">' + esc(text) + '</bdi>'; }
  function cssq(s) { return String(s).replace(/["\\]/g, '\\$&'); }
  function usable(el) { return !!el && !el.disabled && !(el.closest && el.closest('[inert]')) && el.getClientRects().length > 0; }
  function focusEl(el) { try { el.focus({ preventScroll: true }); } catch (e) { el.focus(); } }
  function scrollSoft(el) {
    try { el.scrollIntoView({ block: 'center', behavior: RS.reducedMotion() ? 'auto' : 'smooth' }); } catch (e) { el.scrollIntoView(); }
  }
  // A heading (or the region itself) as a focus target after content changed under the person's focus.
  function headingOf(region) {
    var h = region.querySelector('h2, h3') || region;
    if (!h.hasAttribute('tabindex')) h.setAttribute('tabindex', '-1');
    h.setAttribute('data-cl-focus', '');
    return h;
  }
  // sels: one selector or a list tried in order (the first one found on screen gets focus)
  function focusSoon(sels) {
    setTimeout(function () {
      var list = Array.isArray(sels) ? sels : [sels], el = null;
      for (var i = 0; i < list.length && !el; i++) el = document.querySelector(list[i]);
      if (!el) return;
      if (!/^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test(el.tagName) && !el.hasAttribute('tabindex')) el = headingOf(el);
      focusEl(el);
      scrollSoft(el);
    }, 30);
  }
  // After the Compete screen changed under the person's focus (left, deleted, dismissed, reloaded): the new hero's
  // action, else its heading.
  function focusHeroCta() { focusSoon(['#cmp-hero button.cta', '#cmp-hero a.cta', '#cmp-hero']); }
  // "Name, Daily points cap and Sponsor": the language's own list format (a translatable separator where there is none)
  function listText(items) {
    try { if (window.Intl && Intl.ListFormat) return new Intl.ListFormat(RS.lang(), { style: 'long', type: 'conjunction' }).format(items); } catch (e) { /* below */ }
    return items.join(t('cloud.listSep'));
  }
  function isExternal(url) { return /^https?:\/\//i.test(url) && String(url).indexOf(location.origin) !== 0; }
  // Opens a page in a new tab. window.open(url, '_blank', 'noopener') always returns null, so the opener is cut by hand
  // instead. A blocked pop-up never navigates the app itself (on an installed app that would replace it): a sheet
  // offers the link to tap.
  function openUrl(url, title) {
    var w = null;
    try { w = window.open(url, '_blank'); } catch (e) { w = null; }
    if (w) { try { w.opener = null; } catch (e) { /* ignore */ } return true; }
    RS.sheet.open({
      title: title || t('cloud.open.title'),
      body: '<p>' + esc(t('cloud.open.body')) + '</p>' + ui.btn(t('cloud.open.link'), { href: url, block: true, icon: 'arrow-up-right', cls: 'mt-4',
        attrs: Object.assign({ 'data-act': 'sheet.close' }, isExternal(url) ? {} : { target: '_blank', rel: 'noopener' }) })
    });
    return false;
  }

  /* ------------------------------------------------------------------ form drafts (survive re-renders) */
  // Text typed into a cloud form is kept in memory, so a re-render (sync, language change, poll) never loses it.
  var drafts = {};
  function draft(id, dflt) { return hasOwn.call(drafts, id) ? drafts[id] : dflt; }
  function clearDrafts(prefix) { Object.keys(drafts).forEach(function (k) { if (k.indexOf(prefix) === 0) delete drafts[k]; }); }
  function onDraft(e) {
    var el = e.target;
    if (el && el.hasAttribute && el.hasAttribute('data-draft') && el.id) drafts[el.id] = el.value;
  }
  document.addEventListener('input', onDraft, true);
  document.addEventListener('change', onDraft, true);
  function withDraft(o) {
    o = Object.assign({}, o);
    o.attrs = Object.assign({ 'data-draft': '' }, o.attrs || {});
    o.value = draft(o.id, o.value == null ? '' : o.value);
    return o;
  }
  function fld(o) { return ui.field(withDraft(o)); }
  function area(o) { return ui.textarea(withDraft(o)); }
  function pick(o) { return ui.select(withDraft(o)); }

  // Inline form error + busy state
  function formErr(form, msg, focusSel) {
    if (!form) { RS.toast(msg, { tone: 'error' }); return; }
    RS.$$('[aria-invalid="true"]', form).forEach(function (el) { el.removeAttribute('aria-invalid'); });
    var box = form.querySelector('.cl-form-err');
    if (box) { box.textContent = msg; box.hidden = false; } else RS.toast(msg, { tone: 'error' });
    var f = focusSel ? form.querySelector(focusSel) : null;
    if (f) { f.setAttribute('aria-invalid', 'true'); try { f.focus(); } catch (e) { /* ignore */ } }
  }
  // Busy: the submit button is marked aria-disabled (not disabled), so keyboard and screen-reader focus stays on it
  // while the request runs; submit handlers return early while the form is busy (isBusy), so nothing is sent twice.
  function formBusy(form, on) {
    if (!form) return;
    form.setAttribute('aria-busy', on ? 'true' : 'false');
    RS.$$('button[type="submit"]', form).concat(form.id ? RS.$$('button[type="submit"][form="' + cssq(form.id) + '"]') : []).forEach(function (b) {
      if (on) b.setAttribute('aria-disabled', 'true'); else b.removeAttribute('aria-disabled');
    });
    if (on) { var box = form.querySelector('.cl-form-err'); if (box) { box.textContent = ''; box.hidden = true; } }
  }
  function isBusy(form) { return !!(form && form.getAttribute('aria-busy') === 'true'); }
  function btnBusy(el, on) { if (el) { if (on) el.setAttribute('aria-disabled', 'true'); else el.removeAttribute('aria-disabled'); } }
  function errBox(id) { return '<p class="cl-form-err" id="' + id + '" role="alert" hidden></p>'; }

  /* ------------------------------------------------------------------ re-render without losing typing */
  // Async results (feature flags, sync, polls) re-render the current screen. If the person is typing in a field
  // of the screen, wait until they have left it (and are not mid-tap), so neither text nor a click is lost.
  var pointerDown = false, refreshWait = null;
  document.addEventListener('pointerdown', function () { pointerDown = true; }, true);
  document.addEventListener('pointerup', function () { setTimeout(function () { pointerDown = false; }, 0); }, true);
  document.addEventListener('pointercancel', function () { pointerDown = false; }, true);
  function typing() {
    var a = document.activeElement, v = document.getElementById('view');
    return !!(a && v && v.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName));
  }
  function softRefresh() {
    if (!started()) return;
    if (!typing() && !pointerDown) { RS.refresh(); return; }
    if (refreshWait) return;
    var tries = 0;
    refreshWait = setInterval(function () {
      tries += 1;
      if ((typing() || pointerDown) && tries < 120) return;
      clearInterval(refreshWait);
      refreshWait = null;
      if (!typing()) RS.refresh();
    }, 500);
  }
  // Replace one region (an element with an id) in place. Focus stays on the same control; when that control is gone
  // (its row was removed, a flag was cleared, "Show more" ran out) it moves to the same control in the row now in its
  // place or the row before, then to another control of that row, then to the region's heading: never to <body>.
  function patch(id, html) {
    var el = document.getElementById(id);
    if (!el || !html) return false;
    var a = document.activeElement, had = !!(a && a !== document.body && el.contains(a));
    var key = null, act = null, arg = null, rowIdx = -1;
    if (had) {
      act = a.getAttribute('data-act');
      arg = a.getAttribute('data-arg');
      if (a.id) key = '[id="' + cssq(a.id) + '"]';
      else if (act) key = '[data-act="' + cssq(act) + '"]' + (arg != null ? '[data-arg="' + cssq(arg) + '"]' : ':not([data-arg])');
      var li = a.closest('.li');
      if (li && el.contains(li)) rowIdx = RS.$$('.li', el).indexOf(li);
    }
    var tmp = document.createElement('div');
    tmp.innerHTML = html;
    var nu = tmp.firstElementChild;
    if (!nu) return false;
    el.parentNode.replaceChild(nu, el);
    if (!had) return true;
    var f = key ? (nu.matches(key) ? nu : nu.querySelector(key)) : null;
    if (!usable(f) && rowIdx >= 0) {
      var rows = RS.$$('.li', nu), same = rows[rowIdx];
      var pickIn = function (row, sel) { return row ? RS.$$(sel, row).filter(usable)[0] || null : null; };
      var sameAct = act ? '[data-act="' + cssq(act) + '"]' : null;
      if (sameAct) f = pickIn(same, sameAct);                                  // removed row: the next row's button
      if (!f && arg != null) f = pickIn(same, '[data-arg="' + cssq(arg) + '"]');  // same row, its button went away
      if (!f && sameAct) f = pickIn(rows[rowIdx - 1], sameAct);                // the last row was removed
      if (!f) f = pickIn(same, 'button, a[href], input, select, textarea') || pickIn(rows[rowIdx - 1], 'button, a[href], input, select, textarea');
    }
    if (!usable(f)) f = headingOf(nu);
    focusEl(f);
    return true;
  }

  /* ------------------------------------------------------------------ copy / share / download */
  function execCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-1000px';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    return ok;
  }
  function manualCopy(text) {
    RS.sheet.open({
      title: t('cloud.copy.title'),
      body: '<p>' + esc(t('cloud.copy.body')) + '</p><div class="mt-3">' +
        ui.textarea({ id: 'cl-copy-text', label: t('cloud.copy.label'), value: text, rows: 4, attrs: { readonly: '' } }) + '</div>',
      focus: '#cl-copy-text'
    });
    var ta = document.getElementById('cl-copy-text');
    if (ta) { try { ta.select(); } catch (e) { /* ignore */ } }
  }
  function copyText(text, okMsg) {
    var p = navigator.clipboard && window.isSecureContext ? navigator.clipboard.writeText(text) : Promise.reject(new Error('no clipboard'));
    return p.then(function () { return true; }, function () { return execCopy(text); }).then(function (ok) {
      if (ok) RS.toast(okMsg || t('cloud.copied'), { tone: 'success' });
      else manualCopy(text);
      return ok;
    });
  }
  var lastShare = null;
  // The text to copy when the share sheet is not used: the link is added once (never when the text already has it).
  function shareText(p) { return p.url && String(p.text).indexOf(p.url) < 0 ? p.text + ' ' + p.url : p.text; }
  function shareSheet(p, okMsg) {
    lastShare = { p: p, msg: okMsg };
    var acts = [{ text: t('share.copy'), act: 'share.copyLast', icon: 'copy' }];
    if (navigator.share) acts.push({ text: t('share.share'), act: 'share.again', icon: 'share-2', variant: 'primary' });
    RS.sheet.open({
      title: t('share.sheetTitle'),
      body: '<p class="quote">' + esc(p.text) + '</p>' + (p.url ? '<p class="caption mt-2"><bdi class="ltr">' + esc(p.url) + '</bdi></p>' : ''),
      actions: acts
    });
  }
  function shareOrCopy(p, okMsg) {
    lastShare = { p: p, msg: okMsg };
    if (navigator.share) {
      return navigator.share(p).then(noop, function (e) {
        if (e && e.name === 'AbortError') return;
        shareSheet(p, okMsg);                       // e.g. the tap's user activation expired while a link was made
      });
    }
    return copyText(shareText(p), okMsg);
  }
  function downloadBlob(blob, name) {
    var u = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = u;
    a.download = name;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(u); if (a.parentNode) a.parentNode.removeChild(a); }, 1500);
  }
  function csvLine(cells) { return cells.map(function (c) { return '"' + String(c == null ? '' : c).replace(/"/g, '""') + '"'; }).join(','); }

  /* ------------------------------------------------------------------ API */
  var ERR = {
    bad_credentials: 'cloud.err.badCredentials', email_in_use: 'cloud.err.emailInUse', weak_password: 'cloud.err.weakPassword',
    invalid_email: 'cloud.err.invalidEmail', email_not_configured: 'cloud.err.emailOff', bad_link: 'cloud.err.badLink',
    closed: 'cloud.err.closed', full: 'cloud.err.full', name_required: 'cloud.err.nameRequired', bad_invite: 'cloud.err.badInvite',
    unauthorized: 'cloud.err.session', forbidden: 'cloud.err.forbidden', ai_not_configured: 'cloud.err.aiOff',
    db_not_configured: 'cloud.err.serverOff', auth_not_configured: 'cloud.err.serverOff', push_denied: 'push.denied',
    push_off: 'push.serverOff', push_sw: 'push.failed', push_unsupported: 'push.unsupported', sync_too_large: 'cloud.err.tooLarge'
  };
  // Server messages are English; the person always sees a localized message chosen from the error code. A 429 without
  // a code is a rate limit of the platform (sync, AI, sign-in), not a full competition (the join endpoint says 'full').
  function errText(e, notFoundKey) {
    if (!e) return t('err.generic');
    if (e.code === 'network' || e.status === 0) return t('err.network');
    if (ERR[e.code] && e.code !== 'not_found') return t(ERR[e.code]);
    if (e.code === 'not_found' || e.status === 404) return t(notFoundKey || 'cloud.err.notFound');
    if (e.status === 401) return t('cloud.err.session');
    if (e.status === 403) return t('cloud.err.forbidden');
    if (e.status === 413) return t('cloud.err.tooLarge');
    if (e.status === 429) return t('cloud.err.rateLimited');
    if (e.status === 503) return t('cloud.err.serverOff');
    if (e.status >= 500) return t('cloud.err.server');
    return t('err.generic');
  }
  function codeErr(code) { var e = new Error(code); e.code = code; e.status = -1; return e; }
  function api(path, o) {
    o = o || {};
    var headers = { 'Content-Type': 'application/json' };
    var tk = o.auth === false ? '' : authToken();
    if (tk) headers.Authorization = 'Bearer ' + tk;
    var init = { method: o.method || 'GET', headers: headers, cache: 'no-store' };
    if (o.raw != null) init.body = o.raw;            // already serialized (the sync PUT measures its size first)
    else if (o.body !== undefined) init.body = JSON.stringify(o.body);
    var req;
    try { req = fetch(API + path, init); } catch (e) { req = Promise.reject(e); }
    return req.then(function (r) {
      return r.text().then(function (txt) {
        var j = null;
        try { j = txt ? JSON.parse(txt) : null; } catch (e) { j = null; }
        if (!r.ok) {
          var err = new Error((j && j.message) || ('HTTP ' + r.status));
          err.status = r.status;
          err.code = (j && j.error) || '';
          throw err;
        }
        return j;
      });
    }, function () {
      var err = new Error('network');
      err.status = 0;
      err.code = 'network';
      throw err;
    }).catch(function (e) {
      if (tk && e.status === 401 && e.code === 'unauthorized') sessionExpired();
      throw e;
    });
  }

  /* ------------------------------------------------------------------ feature flags (/api/health) */
  // failed: the health check itself went wrong (an HTTP error, an unreadable answer, or a database that is configured
  // but not answering), which may pass, so the screens offer Try again; a server without a database says so and does not.
  var feat = { loaded: false, offline: false, failed: false, db: false, accounts: false, competitions: false, sync: false, email: false, ai: false, push: false };
  var readyResolve = null;
  var ready = new Promise(function (res) { readyResolve = res; });
  var featP = null;
  function featLoad() {
    if (featP) return featP;
    var req;
    try { req = fetch(API + '/api/health', { cache: 'no-store' }); } catch (e) { req = Promise.reject(e); }
    featP = req.then(function (r) {
      if (!r.ok) return { loaded: true, offline: false, failed: true };
      return r.json().then(function (j) {
        var f = (j && j.features) || {}, db = !!(j && j.dbOk);
        // accounts, competitions, sync, magic-link email and push subscriptions all need the database
        return { loaded: true, offline: false, failed: !!(j && j.db && !j.dbOk), db: db, accounts: db && !!f.accounts, competitions: db && !!f.competitions,
          sync: db && !!f.sync, email: db && !!f.email, ai: !!f.ai, push: db && !!f.push };
      }, function () { return { loaded: true, offline: false, failed: true }; });
    }, function () {
      return { loaded: true, offline: true };
    }).then(function (res) {
      var next = { loaded: true, offline: !!res.offline, failed: !!res.failed, db: !!res.db, accounts: !!res.accounts, competitions: !!res.competitions,
        sync: !!res.sync, email: !!res.email, ai: !!res.ai, push: !!res.push };
      var changed = Object.keys(next).some(function (k) { return feat[k] !== next[k]; });
      Object.assign(feat, next);                     // same object: other modules may hold RS.cloud.feat
      featP = null;
      if (readyResolve) { readyResolve(feat); readyResolve = null; }
      if (authToken() && feat.sync) syncNow(false);
      handlePending();
      primeComp();
      if (changed) softRefresh();
      return feat;
    });
    return featP;
  }
  // Back online: reload the feature flags if they failed, then retry what failed while offline (cloud sync, scores).
  window.addEventListener('online', function () {
    (feat.offline || !feat.loaded ? featLoad() : Promise.resolve(feat)).then(function () {
      if (sync.state === 'error' && !sync.running) markDirty();
      if (cmp.syncState !== 'synced') cmpScoreSync(true);
    });
  });

  /* ------------------------------------------------------------------ accounts */
  function authToken() {
    var v = RS.store.raw('rs-auth');
    if (!v) return '';
    v = String(v);
    if (v.charAt(0) === '"') { try { v = JSON.parse(v); } catch (e) { /* keep raw */ } }
    return typeof v === 'string' ? v : '';
  }
  function currentUser() {
    if (!authToken()) return null;
    var u = RS.store.get('rs-user', null);
    return isObj(u) ? u : {};
  }
  function userName(u) { return (u && (u.name || u.email)) || ''; }
  function setAuth(tok, u, quiet) {
    if (tok) { RS.store.setRaw('rs-auth', tok); RS.store.set('rs-user', isObj(u) ? u : {}); }
    else { RS.store.del('rs-auth'); RS.store.del('rs-user'); RS.store.del('rs-sync-at'); }
    cmp.mine = null;
    cmp.mineAt = 0;
    sync.state = 'idle';
    sync.err = '';
    if (!quiet) softRefresh();
  }
  var expiredAt = 0;
  function sessionExpired() {
    if (!authToken()) return;
    setAuth(null, null, true);
    if (Date.now() - expiredAt > 5000) { expiredAt = Date.now(); RS.toast(t('acct.sessionExpired'), { tone: 'error' }); }
    softRefresh();
  }

  function openAccount(mode) {
    if (!feat.loaded) { RS.toast(t('core.loading')); featLoad(); return; }
    if (!feat.accounts) { RS.toast(acctOffText(), { tone: 'error' }); return; }
    var u = currentUser();
    if (u) {
      RS.sheet.open({ title: t('acct.kicker'), body: accountBodyHtml(u, true) });
      return;
    }
    mode = mode === 'register' ? 'register' : 'login';
    RS.sheet.open({ title: t(mode === 'register' ? 'acct.form.register' : 'acct.form.login'), body: authFormHtml(mode), focus: '#acct-email' });
  }
  function authFormHtml(mode) {
    var reg = mode === 'register';
    return '<form class="cl-auth" data-act-submit="acct.submit" novalidate>' +
      '<input type="hidden" name="mode" value="' + (reg ? 'register' : 'login') + '">' +
      '<p>' + esc(t(reg ? 'acct.bodyRegister' : 'acct.body')) + '</p><div class="mt-4">' +
      fld({ id: 'acct-email', label: t('acct.email'), type: 'email', autocomplete: 'email', inputmode: 'email', maxlength: 120, required: true }) +
      ui.field({ id: 'acct-pass', label: t('acct.password'), type: 'password', autocomplete: reg ? 'new-password' : 'current-password',
        hint: reg ? t('acct.passwordHint') : '', maxlength: 200, required: true }) +
      (reg ? fld({ id: 'acct-name', label: t('acct.name'), maxlength: 60, autocomplete: 'name' }) : '') + '</div>' +
      errBox('acct-err') +
      ui.btn(t(reg ? 'acct.form.register' : 'acct.form.login'), { type: 'submit', block: true, cls: 'mt-4' }) +
      '<div class="t-center mt-2">' + ui.linkAction({ text: t(reg ? 'acct.toLogin' : 'acct.toRegister'), act: 'acct.open', arg: reg ? 'login' : 'register' }) + '</div>' +
      (feat.email ? '<p class="cl-or"><span>' + esc(t('acct.or')) + '</span></p>' +
        ui.btn(t('acct.magic'), { variant: 'secondary', block: true, icon: 'mail', act: 'acct.magic' }) : '') +
      '<p class="caption t-center mt-4">' + esc(t('acct.privacy')) + '</p></form>';
  }
  function syncStatusHtml() {
    return '<p class="cl-status"><span class="cl-status-ic" aria-hidden="true">' + RS.icon('cloud', { size: 16 }) + '</span>' +
      '<span class="cl-sync-label" aria-live="polite">' + esc(syncLabel()) + '</span></p>';
  }
  function accountBodyHtml(u, inSheet) {
    var h = '';
    if (inSheet) h += '<p class="strong">' + esc(u.name || u.email || '') + '</p>' + (u.name && u.email ? '<p class="caption"><bdi>' + esc(u.email) + '</bdi></p>' : '');
    else if (u.name && u.email) h += '<p class="caption"><bdi>' + esc(u.email) + '</bdi></p>';
    h += '<p class="mt-2">' + esc(t('acct.syncInfo')) + '</p>' + syncStatusHtml();
    h += '<div class="btn-row mt-4">' + ui.btn(t('acct.syncNow'), { variant: 'secondary', icon: 'refresh-cw', act: 'acct.sync' }) +
      ui.btn(t('acct.logout'), { variant: 'secondary', icon: 'log-out', act: 'acct.logout' }) + '</div>';
    h += '<div class="t-center mt-2"><button type="button" class="link-btn cl-danger-link" data-act="acct.delete">' + esc(t('acct.delete')) + '</button></div>';
    return h;
  }
  function magicExchange(m) {
    api('/api/auth/magic?token=' + enc(m), { auth: false }).then(function (r) {
      setAuth(r.token, r.user);
      RS.toast(t('acct.signedIn'), { tone: 'success' });
      syncNow(true);
    }, function (e) { RS.toast(errText(e), { tone: 'error' }); });
  }

  /* ------------------------------------------------------------------ cloud sync (snapshot, merge, apply) */
  // The snapshot keeps the v7 shape (settings, days, qPages, badges, best, quiz, extras) and the server merges it as v7
  // did (api/_lib/merge.js: the newer day record by ts, the maximum Quran pages per day, extras key by key by ts, the
  // client's settings over the server's). Three client rules keep a sync from undoing a deliberate change:
  // - Seasons. Each Ramadan day record and Ramadan journal entry (r1..r30) travels with the season (Hijri year) it
  //   belongs to: this device's rs-season, or for older copies the one its timestamp falls in (the tracker's rule).
  //   An entry of an earlier season than this device's is never applied. It goes into this device's archive of that
  //   season (rs-archive-<year>, only what the archive lacks) and is replaced in the cloud copy by an empty entry that
  //   is just newer than it ({gone: 1}), so an archived Ramadan never comes back. An entry of a later season (another
  //   device already began the new Ramadan; this one has not answered the archive question yet) is left alone.
  // - Change times. The Quran pages of each Ramadan day (extras.qPagesTs {day: {p, ts, season}}), the prayer location
  //   and the mode (settings.prayerTs / modeTs) are resolved by when they were last changed, so clearing a day's pages,
  //   removing the location or going back to Auto mode sticks and clears the cloud copy too (null is sent). This device
  //   notices its changes in rs-sync-meta. Values from before change times existed count as time 0; between two of
  //   those the v7 rules apply: the larger page count, and an unset location or mode is filled from the cloud only on a
  //   device that has never synced. The server's qPages map is read only for days without a change time.
  // - Size. Records travel compact (ticked deeds only: a missing deed is unticked, as the tracker reads it), year-round
  //   days older than 400 days as summaries (counts, no ticks; never written over a record), and the PUT is measured
  //   against the server's limit first (fewer full days, then a clear message instead of a refused upload).
  var SYNC_LIMIT = 390000;                         // api/_routes/sync.js refuses snapshots over 400,000 characters
  var YR_FULL = [400, 180, 60, 0];                 // year-round days sent in full: the last N days, fewer if too large
  function validSeason(s) { s = String(s == null ? '' : s).trim(); return /^\d{4}$/.test(s) ? s : ''; }
  function validMode(m) { return m === 'ramadan' || m === 'prep' || m === 'year' ? m : null; }
  function tsOf(r) { return isObj(r) ? num(r.ts) : 0; }
  function isRJ(k) { return /^r\d+$/.test(k); }
  function dayKey(k) { var n = Number(k); return n >= 1 && n <= 30 && Math.floor(n) === n; }
  function keysOf() {
    var seen = {}, out = [];
    for (var i = 0; i < arguments.length; i++) Object.keys(objOr(arguments[i])).forEach(function (k) { if (!seen[k]) { seen[k] = 1; out.push(k); } });
    return out;
  }
  // The Ramadan that something saved at `ms` belongs to (from Hijri month 9 on: that year's, before: the previous
  // year's) and the one for data with no timestamp (the previous season until this Ramadan is over): the tracker's rules.
  function seasonAt(ms) { var h = RS.hijri(new Date(ms)); return String(h.month >= 9 ? h.year : h.year - 1); }
  function seasonNoTs() { var h = RS.hijri(); return String(h.month > 9 ? h.year : h.year - 1); }
  function recSeason(r, dflt) {
    var s = isObj(r) ? validSeason(r.season) : '';
    if (s) return s;
    var ts = tsOf(r);
    return ts > 0 ? seasonAt(Math.min(ts, Date.now())) : (dflt || '');
  }
  // This device's season: rs-season, else (v6 data, before the tracker stored it) from the data like the tracker
  // does; '' when there are no Ramadan days, journal entries or Quran pages on the device.
  function deviceSeason() {
    var s = validSeason(RS.store.raw('rs-season'));
    if (s) return s;
    var ts = 0, any = false;
    for (var d = 1; d <= 30; d++) { var r = RS.store.get('rs-day-' + d, null); if (isObj(r)) { any = true; ts = Math.max(ts, num(r.ts)); } }
    var j = objOr(objOr(RS.store.get('rs-extras', null)).journal);
    Object.keys(j).forEach(function (k) { if (isRJ(k) && isObj(j[k])) { any = true; ts = Math.max(ts, num(j[k].ts)); } });
    if (!any) { var q = qPagesMap(); any = Object.keys(q).some(function (k) { return num(q[k]) > 0; }); }
    if (!any) return '';
    return ts > 0 ? seasonAt(Math.min(ts, Date.now())) : seasonNoTs();
  }
  // The newest season a cloud copy has data for (its own stamp, its newest day record or Ramadan journal entry)
  function newestSeason(snap) {
    snap = objOr(snap);
    var best = validSeason(objOr(snap.settings).season);
    var see = function (r) { var s = recSeason(r, ''); if (s > best) best = s; };
    var days = objOr(snap.days), j = objOr(objOr(snap.extras).journal);
    Object.keys(days).forEach(function (k) { see(days[k]); });
    Object.keys(j).forEach(function (k) { if (isRJ(k)) see(j[k]); });
    return best;
  }

  // Day records (rs-day-<n>, rs-yr-<date>) as they travel: the ticked deeds only, the v6 field names normalized.
  function trueOnly(o) { var out = {}; Object.keys(objOr(o)).forEach(function (k) { if (o[k] === true || o[k] === 1) out[k] = true; }); return out; }
  function packRec(r, dayN) {
    if (!isObj(r) || r.sum) return r;
    var out = { ck: trueOnly(r.ck || r.checklist) };
    if (dayN) out.day = dayN;
    out.ts = num(r.ts);
    out.done = num(r.done != null ? r.done : r.completedCount);
    out.tot = num(r.tot != null ? r.tot : r.totalCount);
    out.pct = num(r.pct != null ? r.pct : r.percentage);
    out.pts = num(r.pts != null ? r.pts : r.points);
    if (r.hayd) { out.hayd = true; var h = trueOnly(r.hck); if (Object.keys(h).length) out.hck = h; }
    if (validSeason(r.season)) out.season = validSeason(r.season);
    if (r.gone) out.gone = 1;
    return out;
  }
  function yrSummary(r) {                          // an old year-round day: its counts without the ticks
    if (!isObj(r) || r.sum) return r;
    var p = packRec(r), out = { ts: p.ts, done: p.done, tot: p.tot, pct: p.pct, pts: p.pts, sum: 1 };
    if (p.hayd) out.hayd = true;
    return out;
  }
  function unpackRec(r, dayN, date) {             // back to the tracker's shape for storage
    var p = packRec(r, dayN), out = { ck: p.ck, ts: p.ts, hayd: !!p.hayd, done: p.done, tot: p.tot, pct: p.pct, pts: p.pts };
    if (dayN) out.day = dayN;
    if (date) out.date = date;
    if (p.hck) out.hck = p.hck;
    return out;
  }
  function sameRec(a, b) {
    var x = packRec(a), y = packRec(b);
    if (!isObj(x) || !isObj(y)) return x === y;
    x = Object.assign({}, x); y = Object.assign({}, y);
    ['season', 'day'].forEach(function (k) { delete x[k]; delete y[k]; });
    return sameJson(x, y);
  }

  // rs-sync-meta: when this device last changed each Ramadan day's Quran pages and the synced prayer location and mode.
  // Checked on every 'data' event and before each sync; what was already there when it was first set up has time 0.
  function syncedSetting(k) { return k === 'prayer' ? roundPrayer(RS.settings.prayer) : validMode(RS.settings.mode); }
  function readMeta() {
    var m = RS.store.get('rs-sync-meta', null);
    return isObj(m) ? { q: objOr(m.q), s: objOr(m.s) } : null;
  }
  function observe() {
    var m = readMeta(), first = !m, now = Date.now(), changed = first;
    m = m || { q: {}, s: {} };
    var q = qPagesMap();
    for (var d = 1; d <= 30; d++) {
      var v = Math.max(0, Math.round(num(q[d]))), e = m.q[d];
      if (isObj(e) ? num(e.p) === v : !v) continue;
      m.q[d] = { p: v, ts: first ? 0 : now };      // a cleared day stays as 0 with the time it was cleared
      changed = true;
    }
    ['prayer', 'mode'].forEach(function (k) {
      var v = syncedSetting(k), e = m.s[k];
      if (isObj(e) && sameJson(e.v == null ? null : e.v, v)) return;
      m.s[k] = { v: v, ts: first ? 0 : now };
      changed = true;
    });
    if (changed) RS.store.set('rs-sync-meta', m);
    return m;
  }

  function getDay(n) {                             // v6/v7 day record → normalized (read straight from storage)
    var d = RS.store.get('rs-day-' + n, null);
    if (!isObj(d)) return null;
    return {
      ck: objOr(d.ck || d.checklist), pct: num(d.pct != null ? d.pct : d.percentage), pts: num(d.pts != null ? d.pts : d.points),
      done: num(d.done != null ? d.done : d.completedCount), tot: num(d.tot != null ? d.tot : d.totalCount), hayd: !!d.hayd
    };
  }
  function qPagesMap() { return objOr(RS.store.get('rs-quran-pages', null)); }
  function buildSnapshot() {
    var meta = observe(), D = deviceSeason();
    var stamp = function (r) { if (D && isObj(r)) r.season = D; return r; };
    var days = {};
    for (var d = 1; d <= 30; d++) { var v = RS.store.get('rs-day-' + d, null); if (isObj(v)) days[d] = stamp(packRec(v, d)); }
    var yr = {};
    RS.store.keys('rs-yr-').forEach(function (k) {
      var iso = k.slice(6), r = RS.store.get(k, null);
      if (/^\d{4}-\d{2}-\d{2}$/.test(iso) && isObj(r)) yr[iso] = packRec(r);
    });
    var ex = objOr(RS.store.get('rs-extras', null));
    var extras = Object.assign({}, ex, { yr: yr });
    delete extras.learn;
    delete extras.prep;
    delete extras.qPagesTs;
    if (isObj(ex.journal)) {
      var j = {};
      Object.keys(ex.journal).forEach(function (k) { var e = ex.journal[k]; j[k] = isRJ(k) && isObj(e) ? stamp(Object.assign({}, e)) : e; });
      extras.journal = j;
    }
    var qts = {}, qp = {};
    Object.keys(meta.q).forEach(function (k) {
      var e = meta.q[k];
      if (!isObj(e) || !dayKey(k)) return;
      qts[k] = stamp({ p: num(e.p), ts: num(e.ts) });
      if (num(e.p) > 0) qp[k] = num(e.p);
    });
    extras.qPagesTs = qts;
    var learn = RS.store.get('rs-learn', null), prep = RS.store.get('rs-prep', null);
    if (isObj(learn)) extras.learn = learn;
    if (isObj(prep)) extras.prep = prep;
    var s = RS.settings, ps = objOr(meta.s.prayer), ms = objOr(meta.s.mode);
    var stats = RS.store.get('rs-quiz-stats', null);
    return {
      settings: { theme: s.theme, detail: !!s.detail, lang: s.lang, mode: validMode(ms.v), modeTs: num(ms.ts), level: s.level || null,
        autoDay: s.autoDay !== false, hijriOff: s.hijriOff || 0, prayer: roundPrayer(ps.v), prayerTs: num(ps.ts), quizLevel: s.quizLevel || null,
        showPrep: !!s.showPrep, season: D || null },
      days: days,
      qPages: qp,
      badges: objOr(RS.store.get('rs-badges', null)),
      best: objOr(RS.store.get('rs-best-streaks', null)),
      quiz: { stats: isObj(stats) ? stats : { ans: 0, cor: 0 }, best: objOr(RS.store.get('rs-quiz-best', null)) },
      extras: extras
    };
  }
  // Rules for everything without a season or change time — they match api/_lib/merge.js (newer record by ts, union of
  // badges, maximum best streaks) and resolve every object carrying a timestamp ('ts') by the newer one.
  function newer(a, b) {
    if (b === undefined) return a;
    if (a === undefined) return b;
    if (isObj(a) && isObj(b)) {
      if (hasOwn.call(a, 'ts') || hasOwn.call(b, 'ts')) return num(b.ts) >= num(a.ts) ? b : a;
      var out = {};
      Object.keys(a).concat(Object.keys(b)).forEach(function (k) { if (!hasOwn.call(out, k)) out[k] = newer(a[k], b[k]); });
      return out;
    }
    return b;
  }
  function byTs(a, b) { if (!isObj(a)) return b; if (!isObj(b)) return a; return num(b.ts) >= num(a.ts) ? b : a; }
  function maxMap(a, b) {
    var out = {};
    [a, b].forEach(function (m) {
      Object.keys(objOr(m)).forEach(function (k) { var v = num(m[k]); if (!hasOwn.call(out, k) || v > out[k]) out[k] = v; });
    });
    return out;
  }
  function later(x, y) {                           // compare due dates that may be numbers or ISO strings
    if (typeof x === 'number' && typeof y === 'number') return x > y;
    return String(x == null ? '' : x) > String(y == null ? '' : y);
  }
  function mergeLearn(a, b) {                      // rs-learn: keep the most progress from both devices
    if (!isObj(a)) return b;
    if (!isObj(b)) return a;
    var out = newer(a, b);
    if (isObj(a.srs) || isObj(b.srs)) {
      var srs = {};
      [a.srs, b.srs].forEach(function (m) {
        Object.keys(objOr(m)).forEach(function (id) {
          var c = m[id], o = srs[id];
          if (!isObj(c)) return;
          if (!o || num(c.box) > num(o.box) || (num(c.box) === num(o.box) && later(c.due, o.due))) srs[id] = c;
        });
      });
      out.srs = srs;
    }
    if (isObj(a.daily) && isObj(b.daily)) {
      var da = a.daily, db = b.daily;
      var d = Object.assign({}, String(db.date || '') >= String(da.date || '') ? db : da);
      if (da.date === db.date) { d.done = Math.max(num(da.done), num(db.done)); d.streak = Math.max(num(da.streak), num(db.streak)); }
      if (hasOwn.call(da, 'best') || hasOwn.call(db, 'best')) d.best = Math.max(num(da.best), num(db.best), num(d.streak));
      out.daily = d;
    }
    if (isObj(a.mcqBest) || isObj(b.mcqBest)) out.mcqBest = maxMap(a.mcqBest, b.mcqBest);
    if (Array.isArray(a.mistakes) || Array.isArray(b.mistakes)) {
      var seen = {}, list = [];
      (Array.isArray(b.mistakes) ? b.mistakes : []).concat(Array.isArray(a.mistakes) ? a.mistakes : []).forEach(function (k) {
        var key = JSON.stringify(k);
        if (!seen[key]) { seen[key] = 1; list.push(k); }
      });
      out.mistakes = list.slice(0, 50);
    }
    return out;
  }
  function mergePrep(a, b) {                       // rs-prep: union of done prompts, check-ins and reflections
    if (!isObj(a)) return b;
    if (!isObj(b)) return a;
    var out = newer(a, b);
    if (isObj(a.done) || isObj(b.done)) out.done = maxMap(a.done, b.done);
    if (a.started && b.started) out.started = later(b.started, a.started) ? a.started : b.started;   // the earlier start
    return out;
  }
  // One entry of a season-bound map (a Ramadan day, a Ramadan journal entry, a day's Quran pages). x: the cloud
  // copy's, y: this device's (stamped with D). Returns what to keep; x of an earlier season goes to stash(x, season)
  // and gives way to y or to tomb(x). pick(x, y) resolves two entries of the same season (default: newer, y on a tie).
  function seasonal(x, y, D, dflt, tomb, stash, pick) {
    if (!isObj(x)) return y;
    var sx = recSeason(x, dflt);
    if (sx && !validSeason(x.season)) x = Object.assign({}, x, { season: sx });   // stamp what was inferred
    if (D && sx && sx > D) return x;               // a later season: this device has not moved on yet
    if (D && sx && sx < D) {                       // an earlier season: never comes back as this one's
      if (isObj(y) && tsOf(y) === tsOf(x)) return y;                     // the very entry this device kept for its season
      if (stash && !x.gone) stash(x, sx);
      if (!isObj(y)) return tomb(x);
      return tsOf(y) > tsOf(x) ? y : Object.assign({}, y, { ts: tsOf(x) + 1 });
    }
    if (!isObj(y)) return x;
    return pick ? pick(x, y) : (tsOf(y) >= tsOf(x) ? y : x);
  }
  function pagesPick(x, y) {                       // same day, same season: the newer change; two v7 values: the larger
    if (tsOf(x) === tsOf(y)) return Object.assign({}, y, { p: Math.max(num(x.p), num(y.p)) });
    return tsOf(y) > tsOf(x) ? y : x;
  }
  function mergeSettings(sa, sb) {
    var out = Object.assign({}, sa, sb);          // other settings: this device's (they are not applied from the cloud)
    var never = !RS.store.raw('rs-sync-at');
    ['prayer', 'mode'].forEach(function (k) {
      var ta = num(sa[k + 'Ts']), tb = num(sb[k + 'Ts']);
      var va = k === 'prayer' ? roundPrayer(sa[k]) : validMode(sa[k]), vb = k === 'prayer' ? roundPrayer(sb[k]) : validMode(sb[k]);
      var useA = ta > tb || (ta === tb && never && vb == null && va != null);
      out[k] = useA ? va : vb;
      out[k + 'Ts'] = useA ? ta : tb;
    });
    return out;
  }
  // a: the cloud copy, b: this device (wins ties). stash (optional) collects entries of earlier seasons:
  // {season: {days: {n: rec}, journal: {key: entry}, qPages: {n: entry}}}.
  function mergeAll(a, b, stash) {
    a = objOr(a);
    b = objOr(b);
    var sa = objOr(a.settings), sb = objOr(b.settings);
    var D = validSeason(sb.season) || newestSeason(a);        // a device without Ramadan data takes the copy's newest
    var dflt = validSeason(sa.season) || newestSeason(a) || seasonNoTs();   // for the copy's entries without a timestamp
    var out = { settings: mergeSettings(sa, sb), days: {}, qPages: {}, extras: {} };
    out.settings.season = D || null;
    var into = function (kind, key) {
      return stash ? function (x, s) { var o = stash[s] = stash[s] || { days: {}, journal: {}, qPages: {} }; o[kind][key] = x; } : null;
    };
    var da = objOr(a.days), db = objOr(b.days);
    keysOf(da, db).forEach(function (k) {
      var e = seasonal(da[k], db[k], D, dflt, function (x) {
        return { day: parseInt(k, 10) || 0, ck: {}, ts: tsOf(x) + 1, hayd: false, done: 0, tot: 0, pct: 0, pts: 0, season: D, gone: 1 };
      }, into('days', k));
      if (e !== undefined) out.days[k] = e;
    });
    var ea = objOr(a.extras), eb = objOr(b.extras);
    var qa = objOr(ea.qPagesTs), qb = objOr(eb.qPagesTs), la = objOr(a.qPages), qts = {};
    keysOf(qa, qb, la).forEach(function (k) {
      if (!dayKey(k)) return;
      var x = isObj(qa[k]) ? qa[k] : (num(la[k]) > 0 ? { p: num(la[k]), ts: 0 } : undefined);   // a copy from before change times
      var e = seasonal(x, qb[k], D, dflt, function (x0) { return { p: 0, ts: tsOf(x0) + 1, season: D }; }, into('qPages', k), pagesPick);
      if (!isObj(e)) return;
      qts[k] = e;
      if (num(e.p) > 0 && (!D || recSeason(e, dflt) === D)) out.qPages[k] = num(e.p);
    });
    out.badges = Object.assign({}, objOr(a.badges), objOr(b.badges));
    out.best = maxMap(a.best, b.best);
    var qza = objOr(a.quiz), qzb = objOr(b.quiz);
    out.quiz = {
      stats: { ans: Math.max(num(objOr(qza.stats).ans), num(objOr(qzb.stats).ans)), cor: Math.max(num(objOr(qza.stats).cor), num(objOr(qzb.stats).cor)) },
      best: maxMap(qza.best, qzb.best)
    };
    keysOf(ea, eb).forEach(function (k) {
      if (k === 'qPagesTs') return;
      if (k === 'learn') out.extras.learn = mergeLearn(ea.learn, eb.learn);
      else if (k === 'prep') out.extras.prep = mergePrep(ea.prep, eb.prep);
      else if (k === 'yr') {
        var ya = objOr(ea.yr), yb = objOr(eb.yr), yr = {};
        keysOf(ya, yb).forEach(function (d) { yr[d] = byTs(ya[d], yb[d]); });
        out.extras.yr = yr;
      } else if (k === 'journal' && (isObj(ea.journal) || isObj(eb.journal))) {
        var ja = objOr(ea.journal), jb = objOr(eb.journal), jo = {};
        keysOf(ja, jb).forEach(function (jk) {
          var e = isRJ(jk) ? seasonal(ja[jk], jb[jk], D, dflt, function (x0) { return { t: '', p: '', ts: tsOf(x0) + 1, season: D, gone: 1 }; }, into('journal', jk))
            : newer(ja[jk], jb[jk]);
          if (e !== undefined) jo[jk] = e;
        });
        out.extras.journal = jo;
      } else out.extras[k] = newer(ea[k], eb[k]);
    });
    out.extras.qPagesTs = qts;
    return out;
  }
  // The PUT body: compact records; year-round days older than fullDays as summaries (0: all of them).
  function packForPut(m, fullDays) {
    var cut = RS.todayISO(new Date(Date.now() - fullDays * 86400000));
    var days = {}, yr = {}, src = objOr(objOr(m.extras).yr);
    Object.keys(objOr(m.days)).forEach(function (k) { days[k] = packRec(m.days[k], parseInt(k, 10) || 0); });
    Object.keys(src).forEach(function (d) { yr[d] = fullDays && d >= cut ? packRec(src[d]) : yrSummary(src[d]); });
    return Object.assign({}, m, { days: days, extras: Object.assign({}, objOr(m.extras), { yr: yr }) });
  }
  // Entries of an earlier season found in the cloud copy go into this device's archive of that season (only what it
  // does not have yet), in the tracker's format: days and Quran pages as JSON text, journal entries as objects.
  function archiveStale(stash) {
    Object.keys(stash || {}).forEach(function (s) {
      if (!validSeason(s)) return;
      var st = stash[s], key = 'rs-archive-' + s, arc = RS.store.get(key, null), add = false;
      arc = isObj(arc) ? arc : { days: {}, qPages: null, best: null, journal: {} };
      arc.days = objOr(arc.days);
      arc.journal = objOr(arc.journal);
      Object.keys(objOr(st.days)).forEach(function (k) {
        if (hasOwn.call(arc.days, k) || !dayKey(k)) return;
        arc.days[k] = JSON.stringify(unpackRec(st.days[k], parseInt(k, 10)));
        add = true;
      });
      Object.keys(objOr(st.journal)).forEach(function (k) {
        if (hasOwn.call(arc.journal, k)) return;
        var e = Object.assign({}, st.journal[k]);
        delete e.season;
        arc.journal[k] = e;
        add = true;
      });
      var qk = Object.keys(objOr(st.qPages)).filter(function (k) { return dayKey(k) && num(objOr(st.qPages[k]).p) > 0; });
      if (qk.length) {
        var q = {};
        try { q = objOr(typeof arc.qPages === 'string' ? JSON.parse(arc.qPages) : arc.qPages); } catch (e) { q = {}; }
        qk.forEach(function (k) { if (!hasOwn.call(q, k)) { q[k] = num(st.qPages[k].p); add = true; } });
        arc.qPages = JSON.stringify(q);
      }
      if (add) RS.store.setRaw(key, JSON.stringify(arc));
    });
  }
  var applying = false;
  // Writes a merged snapshot to storage (only what changed), then tells the other modules. Entries of another season
  // and removed ones ({gone}) are never written, and a removal never deletes a record of this device.
  function applySnapshot(data) {
    if (!isObj(data)) return false;
    var stash = {};
    var m = mergeAll(data, buildSnapshot(), stash);
    var D = validSeason(m.settings.season);
    var ours = function (e) { return !D || recSeason(e, '') === D; };
    var changed = false, scores = false;
    function put(key, val, skipIfEmpty) {
      if (val === undefined || val === null) return;
      var cur = RS.store.get(key, undefined);
      if (cur === undefined && skipIfEmpty && skipIfEmpty(val)) return;
      if (sameJson(cur, val)) return;
      RS.store.set(key, val);
      changed = true;
    }
    function emptyObj(v) { return !isObj(v) || !Object.keys(v).length; }
    archiveStale(stash);
    applying = true;
    try {
      Object.keys(m.days).forEach(function (k) {
        var r = m.days[k];
        if (!dayKey(k) || !isObj(r) || r.gone || !ours(r)) return;
        var n = Number(k), cur = RS.store.get('rs-day-' + n, null);
        if (isObj(cur) && sameRec(cur, r)) return;
        RS.store.set('rs-day-' + n, unpackRec(r, n));
        changed = scores = true;
      });
      // Quran pages: the newest change of each day (a cleared day is 0); change times are kept so they are not news
      var meta = observe(), cq = qPagesMap(), had = {}, nq = {}, mq = objOr(m.extras.qPagesTs);
      Object.keys(cq).forEach(function (k) { if (num(cq[k]) > 0) had[k] = nq[k] = num(cq[k]); });
      Object.keys(mq).forEach(function (k) {
        var e = mq[k];
        if (!dayKey(k) || !isObj(e) || !ours(e)) return;
        var p = Math.max(0, Math.round(num(e.p)));
        if (p > 0) nq[k] = p; else delete nq[k];
        meta.q[k] = { p: p, ts: tsOf(e) };
      });
      if (!sameJson(had, nq)) { RS.store.set('rs-quran-pages', nq); changed = scores = true; }
      put('rs-badges', m.badges, emptyObj);
      put('rs-best-streaks', m.best, emptyObj);
      put('rs-quiz-stats', m.quiz.stats, function (v) { return !num(v.ans) && !num(v.cor); });
      put('rs-quiz-best', m.quiz.best, emptyObj);
      var x = Object.assign({}, m.extras), yr = x.yr, learn = x.learn, prep = x.prep;
      delete x.yr;
      delete x.learn;
      delete x.prep;
      delete x.qPagesTs;
      if (isObj(x.journal)) {                      // Ramadan entries of this season; this device's own entries always stay
        var cj = objOr(objOr(RS.store.get('rs-extras', null)).journal), nj = {};
        Object.keys(x.journal).forEach(function (k) {
          var e = x.journal[k];
          if (!isRJ(k)) { nj[k] = e; return; }
          if (!isObj(e) || e.gone || !ours(e)) { if (hasOwn.call(cj, k)) nj[k] = cj[k]; return; }
          var c = Object.assign({}, e);
          delete c.season;
          nj[k] = c;
        });
        Object.keys(cj).forEach(function (k) { if (!hasOwn.call(nj, k)) nj[k] = cj[k]; });
        x.journal = nj;
      }
      put('rs-extras', x, emptyObj);
      Object.keys(objOr(yr)).forEach(function (k) {
        var r = yr[k];
        if (!/^\d{4}-\d{2}-\d{2}$/.test(k) || !isObj(r) || r.sum) return;      // a summary never replaces a record
        var cur = RS.store.get('rs-yr-' + k, null);
        if (isObj(cur) && sameRec(cur, r)) return;
        RS.store.set('rs-yr-' + k, unpackRec(r, 0, k));
        changed = true;
      });
      if (isObj(learn)) put('rs-learn', learn);
      if (isObj(prep)) put('rs-prep', prep);
      // prayer location and mode: the newer choice (an explicit "none" included)
      var ms = m.settings, st = RS.settings, sc = false;
      var np = roundPrayer(ms.prayer), nm = validMode(ms.mode);
      if (!sameJson(roundPrayer(st.prayer), np)) { st.prayer = np; sc = true; }
      if (validMode(st.mode) !== nm) { st.mode = nm; sc = true; }
      meta.s.prayer = { v: np, ts: num(ms.prayerTs) };
      meta.s.mode = { v: nm, ts: num(ms.modeTs) };
      RS.store.set('rs-sync-meta', meta);
      if (sc) { RS.saveSettings(); changed = true; if (st.prayer) loadAdhan().then(noop, noop); }
    } finally { applying = false; }
    if (changed) {
      RS.emit('sync', { changed: true, scores: scores });
      softRefresh();
    }
    if (scores) cmpScoreSync(false);               // days from another device reach the leaderboard without a tick here
    return changed;
  }

  var sync = { timer: null, running: null, again: false, state: 'idle', err: '' };
  function markDirty() {
    if (!authToken() || !feat.sync) return;
    clearTimeout(sync.timer);
    sync.timer = setTimeout(function () { sync.timer = null; syncNow(false); }, 3000);
  }
  function fmtWhen(ts) {
    var d = new Date(num(ts));
    if (RS.todayISO(d) === RS.todayISO()) return RS.fmt.time(d);
    return RS.fmt.date(d, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  }
  function syncLabel() {
    if (!authToken()) return t('cloud.sync.off');
    if (!feat.loaded) return t('core.loading');
    if (!feat.sync) return t(feat.offline ? 'cloud.sync.offline' : (feat.failed ? 'cloud.sync.serverFailed' : 'cloud.sync.unavailable'));
    if (sync.state === 'syncing') return t('cloud.sync.syncing');
    if (sync.state === 'error') return t('cloud.sync.failed', { error: sync.err });
    var at = num(RS.store.get('rs-sync-at', 0));
    return at ? t('cloud.sync.at', { time: fmtWhen(at) }) : t('cloud.sync.never');
  }
  function setSyncState(s) {
    sync.state = s;
    var label = syncLabel();
    RS.$$('.cl-sync-label').forEach(function (el) { el.textContent = label; });
  }
  // One sync at a time: GET the server copy, merge it with this device, PUT the result (the server merges again),
  // then apply what comes back (merged once more with anything changed here in the meantime). The PUT is measured
  // first: year-round days beyond the last 400 (then 180, 60, none) go as summaries until it fits the server's limit.
  function syncNow(verbose) {
    if (!authToken()) return Promise.resolve(false);
    if (!feat.sync) {
      if (verbose) RS.toast(t(feat.offline ? 'err.network' : (feat.failed ? 'cloud.sync.serverFailed' : 'cloud.sync.unavailable')), { tone: 'error' });
      return Promise.resolve(false);
    }
    if (sync.running) { sync.again = true; return sync.running; }
    clearTimeout(sync.timer);
    sync.timer = null;
    setSyncState('syncing');
    var stash = {};
    sync.running = api('/api/sync').then(function (r) {
      var merged = mergeAll(r && isObj(r.data) ? r.data : null, buildSnapshot(), stash);
      var body = '';
      for (var i = 0; i < YR_FULL.length; i++) {
        body = JSON.stringify({ data: packForPut(merged, YR_FULL[i]) });
        if (body.length <= SYNC_LIMIT) break;
      }
      if (body.length > SYNC_LIMIT) throw codeErr('sync_too_large');
      return api('/api/sync', { method: 'PUT', raw: body });
    }).then(function (r) {
      archiveStale(stash);                         // what the cloud copy no longer holds stays on this device
      applySnapshot(r && r.data);
      RS.store.setRaw('rs-sync-at', String(Date.now()));
      setSyncState('ok');
      if (verbose) RS.toast(t('cloud.sync.done'), { tone: 'success' });
      return true;
    }, function (e) {
      if (e && e.code === 'unauthorized') { setSyncState('idle'); return false; }    // sessionExpired() told them
      sync.err = errText(e);
      setSyncState('error');
      if (verbose) RS.toast(sync.err, { tone: 'error' });
      return false;
    }).then(function (ok) {
      sync.running = null;
      if (sync.again) { sync.again = false; markDirty(); }
      return ok;
    });
    return sync.running;
  }

  /* ------------------------------------------------------------------ competitions: state */
  var cmp = {
    code: null, comp: null, board: null, roster: null, full: null, err: null, loading: null,
    view: 'individuals', otab: 'board', limit: 100, lastEnrol: null, pollT: null, scoreT: null, syncState: 'notSynced',
    mine: null, mineAt: 0, mineP: null
  };
  // pend: an invitation link waiting to be used (code, personal token t), a magic sign-in token; form: the join form
  // is open in the invitation card; focus: move focus to the invitation once the screen shows it
  var pend = { code: null, t: null, magic: null, claiming: false, form: false, focus: false };
  function cmpState() { var s = RS.store.get('rs-comp', null); return isObj(s) && s.code ? s : null; }
  function cmpSave(s) { if (s) RS.store.set('rs-comp', s); else RS.store.del('rs-comp'); }
  function resetCmp(code) {
    cmp.code = code || null;
    cmp.comp = cmp.board = cmp.roster = cmp.full = cmp.err = null;
    cmp.loading = null;
    cmp.view = 'individuals';
    cmp.otab = 'board';
    cmp.limit = 100;
    cmp.lastEnrol = null;
    cmp.syncState = 'notSynced';
    clearDrafts('os-');
    clearDrafts('op-');
    clearDrafts('cmp-enrol-');
  }
  // The competition's name when known (v7 saved only the code until Compete was opened); compName falls back to the
  // code, compKicker to the generic "Compete" label (so the code is never shown twice).
  function knownName(s) { return (cmp.comp && s && cmp.comp.code === s.code && cmp.comp.name) || (s && s.cname) || ''; }
  function compName(s) { return knownName(s) || (s && s.code) || ''; }
  function compKicker(s) { return knownName(s) || t('compete.kicker'); }
  function typeName(tp) { return RS.has('compete.type.' + tp) ? t('compete.type.' + tp) : String(tp || ''); }
  function joinUrl(code) { return location.origin + '/?join=' + code; }
  function inviteText(code) { return t('compete.inviteText', { code: code, url: joinUrl(code) }); }      // copied: has the link
  function rankText(n) { return t('compete.rankN', { n: nf(n) }); }
  function canShare() { return typeof navigator.share === 'function'; }
  function rememberComp() {
    var s = cmpState();
    if (!s || !cmp.comp || s.code !== cmp.comp.code) return;
    var d = (cmp.comp.settings && cmp.comp.settings.donateUrl) || '';
    if (s.cname !== cmp.comp.name || (s.donate || '') !== d) { s.cname = cmp.comp.name; s.donate = d; cmpSave(s); }
  }
  // v7 saved {role, code(, token, name, grp)} only: fetch the name and donation link once in the background, so Me,
  // the hero kicker and Today's Give links have them before Compete is first opened (public, cheap GET).
  var primed = false;
  function primeComp() {
    var s = cmpState();
    if (primed || !s || s.cname || !feat.competitions) return;
    primed = true;
    api('/api/comp/' + enc(s.code), { auth: false }).then(function (r) {
      var c = r && r.competition, cur = cmpState();
      if (!c || !cur || cur.code !== s.code || cur.cname) return;
      cur.cname = c.name || '';
      cur.donate = (c.settings && c.settings.donateUrl) || '';
      cmpSave(cur);
      if (routeNow() === 'me') patch('cl-comps', compCardHtml());
      else if (onCompete()) softRefresh();
    }, function () { primed = false; });
  }

  // Participant entries this device switched away from. The personal token is the only link to the entry's row on
  // the leaderboard (an anonymous entry cannot be recovered any other way), so switching keeps it here and "Your
  // competitions" offers it again.
  function prevEntries() {
    var a = RS.store.get('rs-comp-prev', null);
    return Array.isArray(a) ? a.filter(function (x) { return isObj(x) && x.code && x.token; }) : [];
  }
  function dropPrev(code, token) {
    var list = prevEntries();
    var keep = list.filter(function (x) { return !(x.code === code && (token == null || x.token === token)); });
    if (keep.length === list.length) return;
    if (keep.length) RS.store.set('rs-comp-prev', keep); else RS.store.del('rs-comp-prev');
  }
  function stashEntry(s) {
    if (!s || s.role !== 'participant' || !s.token) return;
    var e = { role: 'participant', code: s.code, token: s.token, name: s.name || '', grp: s.grp || '', cname: knownName(s), donate: s.donate || '' };
    RS.store.set('rs-comp-prev', [e].concat(prevEntries().filter(function (x) { return !(x.code === s.code && x.token === s.token); })).slice(0, 5));
  }
  // Makes entry this device's competition; the participant entry it replaces is kept in rs-comp-prev.
  function switchTo(entry) {
    var s = cmpState();
    if (s && !(s.code === entry.code && s.role === entry.role && (s.token || '') === (entry.token || ''))) stashEntry(s);
    if (entry.role === 'participant') dropPrev(entry.code, entry.token);
    cmpSave(entry);
    resetCmp(entry.code);
  }
  // Before replacing a participant entry, ask (the device stops sending scores there). Resolves true to go ahead.
  function confirmSwitch(code, role) {
    var s = cmpState();
    if (!s || s.role !== 'participant' || (s.code === code && s.role === role)) return Promise.resolve(true);
    return RS.confirm({ title: t('compete.switch.title'), body: t('compete.switch.body', { name: compName(s) }), ok: t('compete.switch.ok') });
  }
  function cmpAgg() {                              // v7 cmpAgg: per-day summary sent to /score
    var qp = qPagesMap(), tp = 0, dl = 0, sp = 0, pages = 0, last = 0, days = {};
    for (var d = 1; d <= 30; d++) {
      var x = getDay(d), q = num(qp[d]);
      if ((x && x.done > 0) || q) {
        dl++;
        tp += x ? x.pts : 0;
        sp += x ? x.pct : 0;
        pages += q;
        last = d;
        days[d] = { p: x ? x.pct : 0, t: x ? x.pts : 0, q: q };
      }
    }
    return { totalPts: tp, daysLogged: dl, avgPct: dl ? Math.round(sp / dl) : 0, quranPages: pages, lastDay: last, days: days };
  }
  function ensureLoaded(s) {
    if (cmp.code !== s.code) resetCmp(s.code);
    if (!cmp.board && !cmp.loading && !cmp.err) loadComp(s, false);
  }
  // Loads the leaderboard (organisers: also the roster and the full settings). Resolves with null when it worked, or
  // with the error (e.handled: the person was already told), and never rejects. quietPatch: a background or manual
  // refresh that patches the screen in place and keeps the last board on screen when it fails.
  function loadComp(s, quietPatch) {
    if (cmp.loading) return cmp.loading;
    if (!s || !feat.competitions) return Promise.resolve(codeErr(feat.offline ? 'network' : 'db_not_configured'));
    if (s.role === 'organiser' && !currentUser()) return Promise.resolve(codeErr('unauthorized'));
    var code = s.code;
    var first = !cmp.board;
    var p;
    if (s.role === 'organiser') {
      p = Promise.all([
        api('/api/comp/' + enc(code) + '/board'),
        api('/api/comp/' + enc(code) + '/participants'),
        api('/api/comp').then(null, function () { return null; })
      ]).then(function (rs) {
        if (cmp.code !== code) return;
        cmp.comp = rs[0].competition;
        cmp.board = rs[0];
        cmp.roster = (rs[1] && rs[1].participants) || [];
        var full = rs[2] && rs[2].competitions ? rs[2].competitions.filter(function (c) { return c.code === code; })[0] : null;
        if (full) cmp.full = objOr(full.settings);
      });
    } else {
      p = api('/api/comp/' + enc(code) + '/board' + (s.token ? '?token=' + enc(s.token) : '')).then(function (r) {
        if (cmp.code !== code) return;
        cmp.comp = r.competition;
        cmp.board = r;
      });
    }
    var done = p.then(function () {
      if (cmp.code !== code) return null;
      cmp.err = null;
      rememberComp();
      if (s.role !== 'organiser' && first) cmpScoreSync(true);
      if (onCompete()) { if (quietPatch && !first) patchCompete(); else softRefresh(); }
      return null;
    }, function (e) {
      if (cmp.code !== code) return e;
      if (e.status === 404) {
        cmpSave(null);
        resetCmp();
        dropPrev(code);
        RS.toast(t('compete.notFound'), { tone: 'error' });
        e.handled = true;
      } else if (s.role === 'organiser' && e.status === 403) {
        cmpSave(null);
        resetCmp();
        RS.toast(t('cloud.err.forbidden'), { tone: 'error' });
        e.handled = true;
      } else if (e.code === 'unauthorized') {
        e.handled = true;                          // sessionExpired() told them; the organiser view asks them to sign in
      } else if (!(quietPatch && cmp.board)) cmp.err = errText(e, 'compete.notFound');
      if (onCompete() || routeNow() === 'me') softRefresh();
      return e;
    }).then(function (res) { if (cmp.loading === done) cmp.loading = null; return res; });
    cmp.loading = done;
    return done;
  }
  function refreshComp() {
    var s = cmpState();
    if (!s) return Promise.resolve();
    cmp.err = null;
    return loadComp(s, true);
  }
  function setCmpSync(k) {
    cmp.syncState = k;
    var el = document.getElementById('cmp-sync');
    if (el) el.innerHTML = cmpSyncInner();
  }
  // Pushes this device's per-day summary to the participant's competition entry (debounced like v7).
  function cmpScoreSync(now) {
    var s = cmpState();
    if (!s || s.role !== 'participant' || !s.token || !feat.competitions) return;
    if (cmp.comp && cmp.comp.code === s.code && cmp.comp.open === false) return;
    clearTimeout(cmp.scoreT);
    cmp.scoreT = setTimeout(function () {
      cmp.scoreT = null;
      setCmpSync('syncing');
      api('/api/comp/' + enc(s.code) + '/score', { method: 'PUT', body: { token: s.token, days: cmpAgg().days }, auth: false }).then(function () {
        setCmpSync('synced');
        if (onCompete()) return refreshComp();
      }, function (e) {
        setCmpSync('notSynced');
        var cur = cmpState();
        if (e.status === 404 && cur && cur.code === s.code) {
          cmpSave(null);
          resetCmp();
          RS.toast(t('cloud.err.participantGone'), { tone: 'error' });
          if (onCompete()) softRefresh();
        } else if (e.code === 'closed' && cmp.comp && cmp.comp.code === s.code) {
          cmp.comp.open = false;
          if (onCompete()) patchCompete();
        }
      });
    }, now ? 0 : 2000);
  }
  function loadMine(force) {
    if (!currentUser() || !feat.accounts) return Promise.resolve(null);
    if (!force && cmp.mine && Date.now() - cmp.mineAt < 60000) return Promise.resolve(cmp.mine);
    if (cmp.mineP) return cmp.mineP;
    cmp.mineP = api('/api/auth/me').then(function (r) {
      cmp.mine = { owned: (r && r.owned) || [], joined: (r && r.joined) || [] };
      cmp.mineAt = Date.now();
      if (r && isObj(r.user)) RS.store.set('rs-user', r.user);
      patch('cmp-mine', '<div id="cmp-mine">' + mineCardHtml() + '</div>');
      patch('cl-mycomps', '<div id="cl-mycomps">' + myCompsHtml() + '</div>');
      return cmp.mine;
    }, function () { return null; }).then(function (x) { cmp.mineP = null; return x; });
    return cmp.mineP;
  }
  // Accepts the pending invitation link. The competition this device is in (if any) stays saved until the server
  // has accepted the invitation: a link that is not valid never costs the device its current entry.
  function claimInvite() {
    var code = pend.code, tok = pend.t;
    if (!code || !tok || pend.claiming) return;
    pend.claiming = true;
    if (onCompete()) softRefresh();
    api('/api/comp/' + enc(code) + '/join', { method: 'POST', body: { t: tok } }).then(function (r) {
      pend.claiming = false;
      clearInvite();
      joinedOk(r, '', '');
    }, function (e) {
      pend.claiming = false;
      pend.t = null;
      pend.form = false;
      if (cmpState()) pend.code = null;            // in a competition: the invitation card goes; else the join form keeps the code
      clearInvite();
      RS.toast(errText(e, 'cloud.err.badInvite'), { tone: 'error' });
      if (onCompete()) softRefresh();
    });
  }
  function joinedOk(r, name, grp) {
    var c = r.competition || {};
    switchTo({ role: 'participant', code: c.code, token: r.token, name: (r.participant && r.participant.name) || name,
      grp: (r.participant && r.participant.grp) || grp || '', cname: c.name || '', donate: (c.settings && c.settings.donateUrl) || '' });
    clearDrafts('cmp-join-');
    pend.code = null;
    pend.t = null;
    pend.form = pend.focus = false;
    cmp.comp = c;
    cmp.mine = null;
    RS.toast(t('compete.joined'), { tone: 'success' });
    var onIt = routeNow() === 'compete';
    if (onIt) RS.refresh(); else RS.router.go('compete');
    setTimeout(function () { window.scrollTo(0, 0); if (onIt) focusSoon('#cmp-hero'); }, 60);
  }
  function storeInvite() {
    try { sessionStorage.setItem('rs-invite', pend.t); sessionStorage.setItem('rs-invite-code', pend.code); } catch (e) { /* ignore */ }
  }
  function clearInvite() {
    try { sessionStorage.removeItem('rs-invite'); sessionStorage.removeItem('rs-invite-code'); } catch (e) { /* ignore */ }
  }
  function takeParams(p) {
    p = p || {};
    if (p.magic) pend.magic = String(p.magic);
    if (p.join) {
      var code = String(p.join).trim().toUpperCase().slice(0, 12);
      var s = cmpState();
      if (!(s && s.code === code)) {
        drafts['cmp-join-code'] = code;
        pend.code = code;
        pend.t = null;
        pend.form = false;
        if (p.t) { pend.t = String(p.t); storeInvite(); }
        pend.focus = !pend.t || !!s;               // a personal link on a free device is claimed at once: nothing to focus
      }
    }
    ready.then(handlePending);
  }
  function handlePending() {
    if (!feat.loaded) return;
    if (pend.magic) {
      var m = pend.magic;
      pend.magic = null;
      if (feat.accounts) magicExchange(m);
      else RS.toast(acctOffText(), { tone: 'error' });
    }
    if (pend.t && feat.competitions && !cmpState()) claimInvite();
  }

  /* ------------------------------------------------------------------ competitions: shared pieces */
  function rankBadge(rank) {
    return '<span class="cl-rank' + (rank <= 3 ? ' is-top is-' + rank : '') + '" aria-hidden="true">' + esc(nf(rank)) + '</span>';
  }
  // "5,618 / pts" stacked: a screen reader reads the visually hidden sentence ("5,618 points"), not the run-together parts
  function ptsBlock(n, unit, srKey) {
    return '<span class="cl-pts"><span class="cl-pts-n" aria-hidden="true">' + esc(nf(n)) + '</span><span class="cl-pts-u" aria-hidden="true">' + esc(unit) + '</span>' +
      '<span class="sr-only">' + esc(tn(srKey || 'compete.ptsSr', num(n))) + '</span></span>';
  }
  // The code is read character by character ("B B T P R H"): a visually hidden spaced copy is what a screen reader
  // reads; the large visible code is aria-hidden (aria-label on a plain span is not reliably announced).
  function codeBox(code) {
    return '<div class="cl-codebox"><span class="caption">' + esc(t('compete.code.label')) + '</span>' +
      '<span class="cl-code" aria-hidden="true">' + esc(code) + '</span><span class="sr-only">' + esc(String(code).split('').join(' ')) + '</span></div>';
  }
  // "Share" opens the system share sheet; where there is none (desktop, many in-app browsers) it would only copy
  // again, so only "Copy invitation" is shown.
  function inviteButtons() {
    return '<div class="btn-row mt-3">' + ui.btn(t('compete.code.copy'), { variant: 'secondary', icon: 'copy', act: 'cmp.copy' }) +
      (canShare() ? ui.btn(t('compete.code.share'), { variant: 'secondary', icon: 'share-2', act: 'cmp.share' }) : '') + '</div>';
  }
  function mark(icon, label, cls) {
    return '<span class="cl-mark' + (cls ? ' ' + cls : '') + '" title="' + esc(label) + '">' + RS.icon(icon, { size: 15, label: label }) + '</span>';
  }
  function personRow(r, prizes, meId, org) {
    var rank = num(r.rank) || 1;
    var isMe = meId != null && r.id === meId;
    var title = '<span class="sr-only">' + esc(t('compete.rankSr', { n: nf(rank) })) + ' </span>' + bdi(r.name) +
      (isMe ? ' <span class="cl-you">' + esc(t('compete.you')) + '</span>' : '') + (org && r.flagged ? mark('triangle-alert', t('compete.flagged'), 'is-warn') : '');
    var sub = metaLine([r.grp, tn('compete.days', num(r.daysLogged)), RS.fmt.pct(num(r.avgPct)), tn('compete.pages', num(r.quranPages))]);
    var prize = rank <= 10 && prizes[rank - 1] ? '<span class="cl-prize">' + RS.icon('gift', { size: 14 }) +
      '<span><span class="sr-only">' + esc(t('compete.prizeSr')) + ' </span>' + bdi(prizes[rank - 1]) + '</span></span>' : '';
    return ui.row({ lead: rankBadge(rank), titleHtml: title, subHtml: sub + prize,
      trail: ptsBlock(r.totalPts, t('compete.pts'), 'compete.ptsSr'), cls: 'cl-lb' + (isMe ? ' cl-me' : '') });
  }
  function teamRow(g) {
    var rank = num(g.rank) || 1;
    var sub = metaLine([tn('compete.members', num(g.members)), tn('compete.teamTotal', num(g.totalPts)), RS.fmt.pct(num(g.avgPct)), tn('compete.pages', num(g.quranPages))]);
    return ui.row({ lead: rankBadge(rank), titleHtml: '<span class="sr-only">' + esc(t('compete.rankSr', { n: nf(rank) })) + ' </span>' + bdi(g.grp),
      subHtml: sub, trail: ptsBlock(g.avgPts, t('compete.avgPts'), 'compete.avgPtsSr'), cls: 'cl-lb' });
  }
  // Leaderboard card. o: {full (board page / organiser board), withMe (compete tab), org (organiser tools), limit}
  function boardCardHtml(o) {
    o = o || {};
    var c = cmp.comp, b = cmp.board, body;
    if (!b || !c) body = ui.loading(t('compete.loadingBoard'));
    else {
      var teamsOn = !!(c.settings && c.settings.teams !== false && b.groups && b.groups.length);
      var view = teamsOn && cmp.view === 'teams' ? 'teams' : 'individuals';
      var seg = teamsOn ? ui.seg([{ value: 'individuals', text: t('compete.board.individuals') }, { value: 'teams', text: t('compete.board.teams') }],
        view, { act: 'cmp.view', label: t('compete.board.segLabel'), cls: 'cl-seg' }) : '';
      var list = '';
      if (view === 'teams') {
        list = ui.list(b.groups.map(teamRow), { cls: 'cl-board', label: t('compete.board.teams') });
      } else if (!b.individuals.length) {
        list = ui.empty({ icon: 'users', body: t('compete.board.empty') });
      } else {
        var limit = o.full ? cmp.limit : (o.limit || 10);
        var prizes = c.prizes || [], meId = b.me ? b.me.id : null;
        var rows = b.individuals.slice(0, limit).map(function (r) { return personRow(r, prizes, meId, o.org); });
        list = ui.list(rows, { cls: 'cl-board', label: t('compete.board.title') });
        if (o.withMe && b.me && b.me.rank > limit) {
          list += '<p class="cl-ellipsis" aria-hidden="true">···</p>' + ui.list([personRow(b.me, prizes, meId, false)], { cls: 'cl-board' });
        }
        if (o.full && b.individuals.length > limit) {
          list += ui.btn(tn('compete.board.more', b.individuals.length - limit), { variant: 'secondary', block: true, act: 'cmp.more', cls: 'mt-3' });
        }
      }
      body = seg + list;
    }
    var action = o.full ? null : { text: t('compete.board.all'), act: 'nav.go', arg: 'compete/board', icon: 'chevron-right' };
    return ui.card({ id: 'cmp-board', kicker: { icon: 'chart-column', text: t('compete.board.title') }, action: action, body: body });
  }
  function boardOpts() {
    var s = cmpState();
    var org = !!(s && s.role === 'organiser');
    if (routeNow() === 'compete/board') return { full: true, org: org };
    return org ? { full: true, org: true } : { limit: 10, withMe: true };
  }
  function cmpSyncInner() {
    var k = cmp.syncState;
    var icon = k === 'synced' ? 'circle-check' : (k === 'syncing' ? 'refresh-cw' : 'cloud-off');
    return '<span class="cl-status-ic" aria-hidden="true">' + RS.icon(icon, { size: 16 }) + '</span><span>' + esc(t('compete.sync.' + k)) + '</span>';
  }
  // The competition's type is the kicker (the hero already shows its name); a closed competition has a final
  // leaderboard, so no score-sync status is shown for it.
  function infoCard(s, org) {
    var c = cmp.comp;
    if (!c) return '';
    var st = objOr(c.settings), closed = c.open === false;
    var body = closed ? '<div class="chips">' + ui.chip(t('compete.closed'), { icon: 'lock' }) + '</div><div class="mt-3">' +
      ui.note(t('compete.closedNote'), { icon: 'lock', tone: 'plain' }) + '</div>' : '';
    if (st.message) body += '<p class="quote' + (body ? ' mt-3' : '') + '" dir="auto">' + esc(st.message) + '</p>';
    if (st.sponsor) body += '<p class="caption' + (body ? ' mt-2' : '') + '">' + th('compete.sponsor', { name: st.sponsor }) + '</p>';
    if (!org && !closed) body += '<p class="cl-status" id="cmp-sync" aria-live="polite">' + cmpSyncInner() + '</p>';
    if (!closed && !org) {
      // v7 offered every participant Copy, Share and the (public) QR poster to bring others in
      body += codeBox(c.code) + inviteButtons() + ui.list([ui.row({ icon: 'printer', title: t('compete.tools.poster'), sub: t('compete.tools.posterSub'),
        act: 'cmp.openUrl', arg: 'poster', chevron: true })], { cls: 'mt-3 cl-info-rows' });
    }
    return ui.card({ id: 'cmp-info', cls: 'cl-info', kicker: { icon: 'building-2', text: typeName(c.type) }, body: body });
  }
  function errorCard() {
    return ui.card({ body: ui.empty({ icon: 'wifi-off', title: t('compete.loadFailed'), body: cmp.err || t('err.generic'),
      action: { text: t('core.retry'), act: 'cmp.retry', icon: 'refresh-cw' } }) });
  }
  // An invitation link (?join=CODE, with or without a personal token) opened on a device that is in another
  // competition. Nothing is replaced until the new competition has accepted the person: a personal link is claimed
  // once they choose Switch; a code-only link then shows the join form in this card, with the code filled in.
  function pendingInviteCard(s) {
    if (!pend.code || !s || s.code === pend.code) return '';
    var kick = { icon: 'mail', text: t('compete.invitePending.title', { code: pend.code }) };
    if (pend.claiming) return ui.card({ id: 'cmp-invite', kicker: kick, body: ui.loading(t('compete.join.joining')) });
    if (!pend.t && pend.form) {
      return ui.card({ id: 'cmp-invite', kicker: kick, body: '<p class="caption">' + th('compete.invitePending.formNote', { name: compName(s) }) + '</p>' +
        '<div class="mt-3">' + joinFormHtml(true) + '</div>' });
    }
    return ui.card({ id: 'cmp-invite', kicker: kick,
      body: '<p>' + th(pend.t ? 'compete.invitePending.body' : 'compete.invitePending.bodyCode', { name: compName(s), code: pend.code }) + '</p><div class="btn-row mt-4">' +
        ui.btn(t('compete.invitePending.switch'), { act: 'cmp.inviteSwitch' }) +
        ui.btn(t('compete.invitePending.dismiss'), { variant: 'secondary', act: 'cmp.inviteDismiss' }) + '</div>' });
  }
  // After an invitation link landed (once the screen shows it): the invitation card's Switch, or the join form's name.
  function landFocus() {
    if (!pend.focus) return;
    var sel = document.getElementById('cmp-invite') ? ['#cmp-invite button[data-act="cmp.inviteSwitch"]', '#cmp-join-name', '#cmp-invite']
      : (document.getElementById('cmp-join') ? ['#cmp-join-name'] : null);
    if (!sel) return;
    pend.focus = false;
    focusSoon(sel);
  }

  /* ------------------------------------------------------------------ competitions: heroes */
  function heroMsg(text, loading, cta) {
    return ui.hero({ id: 'cmp-hero', kicker: { icon: 'trophy', text: t('compete.kicker') }, text: loading ? '' : text,
      extra: loading ? ui.loading(text) : '', cta: cta || null });
  }
  // Hero label while there is no board: loading, or a short "not loaded" (the error card below has the title and why).
  function boardLabel(fallback) { return cmp.err && !cmp.board ? t('compete.heroNotLoaded') : fallback; }
  function participantHero(s) {
    var b = cmp.board, me = b && b.me, agg = cmpAgg();
    var pts = me ? me.totalPts : agg.totalPts, days = me ? me.daysLogged : agg.daysLogged, pages = me ? me.quranPages : agg.quranPages;
    var label = !b ? boardLabel(t('compete.loadingBoard')) : (me ? tn('compete.ofN', num(b.participants)) : tn('compete.notRanked', num(b.participants)));
    var prizes = (cmp.comp && cmp.comp.prizes) || [];
    var prize = me && me.rank <= 10 && prizes[me.rank - 1] ? prizes[me.rank - 1] : '';
    var d = Math.min(30, num(days));
    return ui.hero({
      id: 'cmp-hero', kicker: { icon: 'trophy', text: compKicker(s) },
      number: me ? rankText(me.rank) : '–', label: label,
      ring: daysRing(d),
      metrics: [{ label: t('compete.m.points'), value: nf(pts) }, { label: t('compete.m.days'), value: nf(days) }, { label: t('compete.m.quran'), value: nf(pages) }],
      cta: { eyebrow: t('compete.cta.boardEyebrow'), text: t('compete.cta.board'), act: 'nav.go', arg: 'compete/board' },
      extra: prize ? '<p class="cl-hero-prize">' + RS.icon('gift', { size: 16 }) + '<span>' + th('compete.prizeFor', { n: nf(me.rank), prize: prize }) + '</span></p>' : ''
    });
  }
  function daysRing(d) { return { pct: Math.round(d / 30 * 100), text: nf(d), sub: t('compete.ring.sub'), label: tn('compete.ring.label', d) }; }
  function orgStats() {
    var b = cmp.board, r = cmp.roster;
    var sum = 0;
    if (b) b.individuals.forEach(function (x) { sum += num(x.totalPts); });
    var claimed = r ? r.filter(function (p) { return p.claimed; }) : null;
    var inactive = claimed ? claimed.filter(function (p) { return num(p.inactiveDays) >= 3; }).length : null;
    return {
      n: b ? num(b.participants) : null, teams: b ? (b.groups || []).length : null,
      avg: b && b.individuals.length ? Math.round(sum / b.individuals.length) : 0,
      top: b && b.individuals[0] ? num(b.individuals[0].totalPts) : 0,
      inactive: inactive, claimed: claimed ? claimed.length : 0,
      activePct: claimed && claimed.length ? Math.round((claimed.length - inactive) / claimed.length * 100) : 0
    };
  }
  function activeRing(st) {
    return { pct: st.activePct, text: st.inactive == null || !st.claimed ? '–' : RS.fmt.pct(st.activePct), sub: t('compete.orgHero.ringSub'),
      label: t('compete.orgHero.ringLabel', { pct: RS.fmt.pct(st.activePct) }) };
  }
  // The join code is the eyebrow; the action shares it (system share sheet) or, without one, copies the invitation.
  function shareCta(code) {
    var c = cmp.comp;
    if (c && c.open === false) return { eyebrow: code, text: t('compete.closed') };
    return canShare() ? { eyebrow: code, text: t('compete.orgHero.cta'), act: 'cmp.share' } : { eyebrow: code, text: t('compete.code.copy'), act: 'cmp.copy' };
  }
  function orgHero(s) {
    var st = orgStats(), dash = '–';
    return ui.hero({
      id: 'cmp-hero', kicker: { icon: 'users', text: compKicker(s) },
      number: st.n == null ? dash : nf(st.n), label: st.n == null ? boardLabel(t('compete.loadingBoard')) : tn('compete.participantsWord', st.n),
      ring: activeRing(st),
      metrics: [{ label: t('compete.m.teams'), value: st.teams == null ? dash : nf(st.teams) }, { label: t('compete.m.avg'), value: st.n == null ? dash : nf(st.avg) },
        { label: t('compete.m.inactive'), value: st.inactive == null ? dash : nf(st.inactive) }],
      cta: shareCta(s.code)
    });
  }
  // Leaderboard page: participants count, a ring (organiser: active in the last 3 days; participant: your days of 30).
  function boardHero(s) {
    var st = orgStats(), b = cmp.board, dash = '–';
    var org = s.role === 'organiser';
    var mine = b && b.me ? Math.min(30, num(b.me.daysLogged)) : Math.min(30, cmpAgg().daysLogged);
    var third = org ? { label: t('compete.m.avg'), value: st.n == null ? dash : nf(st.avg) }
      : { label: t('compete.m.yourRank'), value: b && b.me ? rankText(b.me.rank) : dash };
    return ui.hero({
      id: 'cmp-hero', kicker: { icon: 'chart-column', text: compKicker(s) },
      number: st.n == null ? dash : nf(st.n), label: st.n == null ? boardLabel(t('compete.loadingBoard')) : tn('compete.participantsWord', st.n),
      ring: org ? activeRing(st) : daysRing(mine),
      metrics: [{ label: t('compete.m.teams'), value: st.teams == null ? dash : nf(st.teams) }, { label: t('compete.m.top'), value: st.n == null ? dash : nf(st.top) }, third],
      cta: shareCta(s.code)
    });
  }

  /* ------------------------------------------------------------------ competitions: screens */
  // The join form (the join card, or inside the invitation card: with "Keep current" to leave things as they are)
  function joinFormHtml(invite) {
    return '<form data-act-submit="cmp.join" novalidate>' +
      fld({ id: 'cmp-join-code', label: t('compete.join.code'), placeholder: t('compete.join.codePh'), maxlength: 6, autocomplete: 'off', cls: 'cl-codefield',
        attrs: { autocapitalize: 'characters', spellcheck: 'false', dir: 'ltr' } }) +
      fld({ id: 'cmp-join-name', label: t('compete.join.name'), placeholder: t('compete.join.namePh'), hint: t('compete.join.nameHint'), maxlength: 40, autocomplete: 'nickname' }) +
      fld({ id: 'cmp-join-grp', label: t('compete.join.group'), placeholder: t('compete.join.groupPh'), maxlength: 40 }) +
      errBox('cmp-join-err') +
      ui.btn(t('compete.join.submit'), { type: 'submit', block: true, icon: 'log-in', cls: 'mt-4' }) +
      (invite ? ui.btn(t('compete.invitePending.dismiss'), { variant: 'secondary', block: true, act: 'cmp.inviteDismiss', cls: 'mt-2' }) : '') +
      '<p class="caption t-center mt-3">' + esc(t('compete.join.note')) + '</p></form>';
  }
  function joinCardHtml() {
    return ui.card({ id: 'cmp-join', kicker: { icon: 'user-plus', text: t('compete.join.kicker') }, title: t('compete.join.title'), body: joinFormHtml(false) });
  }
  function mineCardHtml() {
    var rows = myCompRows(true);
    if (!rows.length) return '';
    return ui.card({ kicker: { icon: 'list', text: t('compete.mine.title') }, body: ui.list(rows) });
  }
  // "Your competitions": the ones this account organises or joined (signed in), plus the participant entries this
  // device switched away from (rs-comp-prev, also when signed out). The current one is skipped.
  function myCompRows(skipCurrent) {
    var m = cmp.mine && currentUser() ? cmp.mine : null, s = cmpState(), rows = [], seen = {};
    function isCur(role, code, token) {
      return !!(skipCurrent && s && s.role === role && s.code === code && (role !== 'participant' || !token || !s.token || s.token === token));
    }
    (m ? m.owned || [] : []).forEach(function (c) {
      if (isCur('organiser', c.code)) return;
      rows.push(ui.row({ icon: 'building-2', titleHtml: bdi(c.name), subHtml: metaLine([t('compete.mine.owned'), c.code, c.open === false ? t('compete.closed') : '']),
        act: 'cmp.pick', arg: c.code, chevron: true }));
    });
    (m ? m.joined || [] : []).forEach(function (c, i) {
      seen[c.code + '|' + c.token] = 1;
      if (!isCur('participant', c.code, c.token)) rows.push(joinedRow(c.name, c.display_name, c.code, 'm' + i));
    });
    prevEntries().forEach(function (c, i) {
      if (!seen[c.code + '|' + c.token] && !isCur('participant', c.code, c.token)) rows.push(joinedRow(c.cname, c.name, c.code, 'p' + i));
    });
    return rows;
  }
  function joinedRow(cname, member, code, key) {
    // a meta item is a flex box: text + <bdi> inside one span, or the space between them is dropped
    return ui.row({ icon: 'user', titleHtml: bdi(cname || code), subHtml: ui.meta([member ? '<span>' + th('compete.mine.joined', { name: member }) + '</span>' : '', bdi(code)]),
      act: 'cmp.resume', arg: key, chevron: true });
  }
  // The participant entry behind a "Your competitions" row (m<i>: joined with this account, p<i>: kept on this device).
  function joinedEntry(key) {
    key = String(key || '');
    var i = parseInt(key.slice(1), 10), c;
    if (key.charAt(0) === 'm') {
      c = cmp.mine && cmp.mine.joined ? cmp.mine.joined[i] : null;
      return c ? { role: 'participant', code: c.code, token: c.token, name: c.display_name || '', grp: c.grp || '', cname: c.name || '' } : null;
    }
    c = prevEntries()[i];
    return c ? Object.assign({}, c, { role: 'participant' }) : null;
  }
  function orgPromoHtml() {
    return ui.card({
      kicker: { icon: 'school', text: t('compete.org.kicker') }, title: t('compete.org.title'),
      body: '<p>' + esc(t('compete.org.body')) + '</p><p class="caption mt-2">' + esc(t('compete.org.features')) + '</p>' +
        ui.btn(t('compete.org.cta'), { variant: 'secondary', block: true, icon: 'plus', act: 'nav.go', arg: 'compete/org', cls: 'mt-4' })
    });
  }
  // Offline, or the server check failed (may pass): Try again. A server without a database: an explanation only.
  function unavailableHtml() {
    if (feat.offline) return heroMsg(t('compete.offline.text'), false, { eyebrow: t('compete.offline.eyebrow'), text: t('core.retry'), act: 'cloud.retry' });
    if (feat.failed) return heroMsg(t('compete.failed.text'), false, { eyebrow: t('compete.failed.eyebrow'), text: t('core.retry'), act: 'cloud.retry' });
    return heroMsg(t('compete.unavailable.text'), false, null);
  }
  function notJoinedHtml() {
    var h = [];
    var agg = cmpAgg();
    // Everything already logged on this device counts from the moment you join: show it.
    h.push(ui.hero({ id: 'cmp-hero', kicker: { icon: 'trophy', text: t('compete.kicker') },
      text: t(agg.daysLogged ? 'compete.invite.textCounts' : 'compete.invite.text'),
      metrics: agg.daysLogged ? [{ label: t('compete.m.points'), value: nf(agg.totalPts) }, { label: t('compete.m.days'), value: nf(agg.daysLogged) },
        { label: t('compete.m.quran'), value: nf(agg.quranPages) }] : null,
      cta: { eyebrow: t('compete.invite.eyebrow'), text: t('compete.invite.cta'), act: 'cmp.focusJoin' } }));
    h.push(joinCardHtml());
    h.push('<div id="cmp-mine">' + mineCardHtml() + '</div>');
    h.push(orgPromoHtml());
    return h.join('');
  }
  function participantHtml(s) {
    var c = cmp.comp, h = [];
    h.push(participantHero(s));
    h.push(pendingInviteCard(s));
    if (cmp.err && !cmp.board) { h.push(errorCard()); h.push(leaveHtml()); return h.join(''); }
    h.push(infoCard(s, false));
    if (c && c.settings && c.settings.donateUrl) {
      h.push(ui.card({ cls: 'is-tight', body: ui.list([ui.row({ icon: 'hand-heart', title: t('compete.give'),
        subHtml: c.settings.sponsor ? th('compete.giveSub', { name: c.settings.sponsor }) : esc(t('compete.giveSubDefault')), act: 'cloud.give', chevron: true })]) }));
    }
    h.push(boardCardHtml(boardOpts()));
    h.push('<div id="cmp-mine">' + mineCardHtml() + '</div>');
    h.push(leaveHtml());
    if (currentUser()) loadMine(false);
    return h.join('');
  }
  function leaveHtml() {
    return '<div class="cl-end">' + ui.btn(t('compete.leave'), { variant: 'danger', act: 'cmp.leave', block: true, icon: 'log-out' }) + '</div>';
  }
  // Organiser dashboard tabs (ARIA tabs: one tab stop, the arrow keys move between them, see the keydown handler): one
  // row of chips that scrolls sideways when it does not fit (never two rows). The chosen tab's content is its panel.
  var OTABS = [['board', 'chart-column'], ['roster', 'users'], ['enrol', 'user-plus'], ['settings', 'settings'], ['tools', 'layers']];
  function orgTabsHtml() {
    return '<div class="chips cl-tabs" role="tablist" aria-label="' + esc(t('compete.tabs.label')) + '">' + OTABS.map(function (x) {
      var on = cmp.otab === x[0];
      return '<button type="button" class="chip' + (on ? ' is-active' : '') + '" role="tab" id="cmp-tab-' + x[0] + '" aria-selected="' + on +
        '" aria-controls="cmp-tabpanel" tabindex="' + (on ? '0' : '-1') + '" data-act="cmp.otab" data-arg="' + x[0] + '">' + RS.icon(x[1], { size: 15 }) +
        '<span>' + esc(t('compete.tab.' + x[0])) + '</span></button>';
    }).join('') + '</div>';
  }
  document.addEventListener('keydown', function (e) {
    var tab = e.target && e.target.closest ? e.target.closest('.cl-tabs [role="tab"]') : null;
    if (!tab || e.altKey || e.ctrlKey || e.metaKey) return;
    var list = RS.$$('[role="tab"]', tab.parentNode), i = list.indexOf(tab), rtl = RS.dir() === 'rtl', to = -1;
    if (e.key === 'ArrowRight') to = i + (rtl ? -1 : 1);
    else if (e.key === 'ArrowLeft') to = i + (rtl ? 1 : -1);
    else if (e.key === 'Home') to = 0;
    else if (e.key === 'End') to = list.length - 1;
    else return;
    e.preventDefault();
    var next = list[(to + list.length) % list.length];
    focusEl(next);                                 // focus first: the re-render puts focus back on this tab
    RS.runAct('cmp.otab', next.getAttribute('data-arg'), next);
  });
  function scrollTabs() {
    var bar = document.querySelector('#view .cl-tabs'), on = bar && bar.querySelector('.chip.is-active');
    if (!bar || !on || bar.scrollWidth <= bar.clientWidth) return;
    var b = bar.getBoundingClientRect(), r = on.getBoundingClientRect();
    if (r.left < b.left) bar.scrollLeft -= b.left - r.left + 24;
    else if (r.right > b.right) bar.scrollLeft += r.right - b.right + 24;
  }
  // An organiser entry on a device that is signed out (Compete and the leaderboard page): sign in to manage it.
  function orgSignInHero(s) {
    return ui.hero({ id: 'cmp-hero', kicker: { icon: 'users', text: compKicker(s) }, text: t('compete.signInToManage'),
      cta: { eyebrow: s.code, text: t('compete.signIn'), act: 'acct.open', arg: 'login' } });
  }
  function backToAllHtml() {
    return '<div class="cl-end">' + ui.btn(t('compete.tools.switch'), { variant: 'secondary', block: true, act: 'cmp.switch', icon: 'arrow-left' }) + '</div>';
  }
  function organiserHtml(s) {
    var h = [];
    if (!currentUser()) return orgSignInHero(s) + backToAllHtml();
    ensureLoaded(s);
    h.push(orgHero(s));
    h.push(pendingInviteCard(s));
    if (cmp.err && !cmp.board) {
      h.push(errorCard());
      h.push(backToAllHtml());
      return h.join('');
    }
    var c = cmp.comp;
    if (c && c.open === false) h.push(ui.note(t('compete.closedNote'), { icon: 'lock', tone: 'plain' }));
    h.push(orgTabsHtml());
    var tab = cmp.otab, panel;
    if (!c) panel = ui.card({ body: ui.loading(t('compete.loadingBoard')) });
    else if (tab === 'roster') panel = rosterCardHtml();
    else if (tab === 'enrol') panel = enrolHtml();
    else if (tab === 'settings') panel = orgSettingsHtml();
    else if (tab === 'tools') panel = toolsHtml(s);
    else panel = boardCardHtml(boardOpts());
    h.push('<div class="cl-tabpanel" role="tabpanel" id="cmp-tabpanel" aria-labelledby="cmp-tab-' + esc(tab) + '">' + panel + '</div>');
    return h.join('');
  }
  function rosterCardHtml() {
    var r = cmp.roster;
    if (!r) return ui.card({ id: 'cmp-roster', body: ui.loading() });
    var flagged = r.filter(function (p) { return p.flagged; }).length;
    var inactive = r.filter(function (p) { return p.claimed && num(p.inactiveDays) >= 3; }).length;
    var invited = r.filter(function (p) { return !p.claimed; }).length;
    var rows = r.map(function (p) {
      var marks = (p.flagged ? mark('triangle-alert', t('compete.flagged'), 'is-warn') : '') + (p.hidden ? mark('eye-off', t('compete.roster.hidden')) : '') +
        (!p.claimed ? mark('mail', t('compete.roster.invited')) : '') + (p.phone ? mark('message-circle', t('compete.roster.whatsapp')) : '');
      var sub = [p.grp].concat(p.claimed ? [tn('compete.ptsN', num(p.totalPts)), tn('compete.days', num(p.daysLogged))] : [t('compete.roster.invited')]);
      if (p.claimed && num(p.inactiveDays) >= 3) sub.push(tn('compete.roster.inactive', num(p.inactiveDays)));
      var acts = (p.flagged ? ui.iconBtn('check', { act: 'cmp.unflag', arg: p.id, label: t('compete.roster.clearFlag', { name: p.name }) }) : '') +
        ui.iconBtn(p.hidden ? 'eye' : 'eye-off', { act: 'cmp.hide', arg: p.id, label: t(p.hidden ? 'compete.roster.show' : 'compete.roster.hide', { name: p.name }) }) +
        ui.iconBtn('trash-2', { act: 'cmp.remove', arg: p.id, label: t('compete.roster.remove', { name: p.name }), cls: 'cl-danger' });
      return ui.row({ titleHtml: bdi(p.name) + marks, subHtml: metaLine(sub), trail: '<span class="cl-acts">' + acts + '</span>',
        cls: 'cl-ros' + (p.hidden ? ' is-dim' : '') });
    });
    return ui.card({
      id: 'cmp-roster', kicker: { icon: 'users', text: t('compete.roster.title', { n: nf(r.length) }) },
      body: '<p class="caption">' + ui.meta([esc(tn('compete.roster.sumFlagged', flagged)), esc(tn('compete.roster.sumInactive', inactive)),
        esc(tn('compete.roster.sumInvited', invited))]) + '</p>' +
        (rows.length ? ui.list(rows, { cls: 'cl-roster mt-2', label: t('compete.roster.listLabel') }) : ui.empty({ icon: 'users', body: t('compete.roster.empty') })) +
        '<p class="caption mt-3">' + esc(t('compete.roster.note')) + '</p>'
    });
  }
  function enrolHtml() {
    var out = cmp.lastEnrol;
    var h = ui.card({
      id: 'cmp-enrol', kicker: { icon: 'user-plus', text: t('compete.enrol.title') },
      body: '<p>' + esc(t('compete.enrol.body')) + '</p><form class="mt-4" data-act-submit="cmp.enrol" novalidate>' +
        area({ id: 'cmp-enrol-text', label: t('compete.enrol.names'), placeholder: t('compete.enrol.namesPh'), rows: 6 }) +
        '<div class="mt-3">' + fld({ id: 'cmp-enrol-grp', label: t('compete.enrol.group'), hint: t('compete.enrol.groupHint'), maxlength: 40 }) + '</div>' +
        errBox('cmp-enrol-err') +
        ui.btn(t('compete.enrol.submit'), { type: 'submit', block: true, icon: 'link', cls: 'mt-4' }) + '</form>'
    });
    if (out && out.length) {
      h += ui.card({
        id: 'cmp-enrol-out', kicker: { icon: 'circle-check', text: tn('compete.enrol.done', out.length) },
        body: '<p class="caption">' + esc(t('compete.enrol.private')) + '</p>' + ui.list(out.map(function (p, i) {
          return ui.row({ titleHtml: bdi(p.name), subHtml: p.grp ? bdi(p.grp) : '', trail: ui.btn(t('compete.enrol.copy'), { variant: 'secondary', size: 'sm', icon: 'copy', act: 'cmp.copyLink', arg: i,
            label: t('compete.enrol.copyFor', { name: p.name }) }) });
        }), { cls: 'mt-2' }) + ui.btn(t('compete.enrol.csv'), { variant: 'secondary', block: true, icon: 'download', act: 'cmp.linksCsv', cls: 'mt-3' })
      });
    }
    return h;
  }
  function prizeFields(prefix, prizes) {
    var h = '<div class="cl-prizes">';
    for (var i = 0; i < 10; i++) {
      var id = prefix + '-p' + i;
      h += '<div class="cl-prize-f"><label class="cl-prize-n" for="' + id + '"><span aria-hidden="true">' + esc(rankText(i + 1)) + '</span>' +
        '<span class="sr-only">' + esc(t('compete.prizes.label', { n: i + 1 })) + '</span></label>' +
        '<input class="input" id="' + id + '" name="' + id + '" maxlength="80" data-draft="" value="' + esc(draft(id, prizes[i] || '')) + '"' +
        (i === 0 ? ' placeholder="' + esc(t('compete.prizes.ph')) + '"' : '') + '></div>';
    }
    return h + '</div>';
  }
  function settingToggle(key, on, title, sub) {
    return ui.row({ title: title, sub: sub, toggle: { on: on, act: 'cmp.toggleSet', arg: key }, cls: 'cl-set-tgl' });
  }
  function orgSettingsHtml() {
    var c = cmp.comp, st = Object.assign({}, objOr(c.settings), objOr(cmp.full));
    var teams = draft('os-teams', st.teams !== false), u13 = draft('os-u13', !!st.under13);
    var prizes = ui.card({
      id: 'cmp-prizes', kicker: { icon: 'gift', text: t('compete.prizes.title') },
      body: '<p class="caption">' + esc(t('compete.prizes.hint')) + '</p><form class="mt-3" data-act-submit="cmp.prizes" novalidate>' + prizeFields('op', c.prizes || []) +
        errBox('cmp-prizes-err') + ui.btn(t('compete.prizes.save'), { type: 'submit', variant: 'secondary', block: true, cls: 'mt-4' }) + '</form>'
    });
    var settings = ui.card({
      id: 'cmp-settings', kicker: { icon: 'settings', text: t('compete.set.title') },
      body: '<form data-act-submit="cmp.settings" novalidate>' +
        fld({ id: 'os-name', label: t('compete.set.name'), value: c.name, maxlength: 80 }) +
        fld({ id: 'os-cap', label: t('compete.set.cap'), type: 'number', inputmode: 'numeric', min: 50, max: 800, value: st.dailyCap || '', placeholder: t('compete.set.capPh'), hint: t('compete.set.capHint') }) +
        fld({ id: 'os-msg', label: t('compete.set.message'), value: st.message || '', maxlength: 300, hint: t('compete.set.messageHint') }) +
        fld({ id: 'os-sponsor', label: t('compete.set.sponsor'), value: st.sponsor || '', maxlength: 120, placeholder: t('compete.set.sponsorPh'), hint: t('compete.set.sponsorHint') }) +
        fld({ id: 'os-donate', label: t('compete.set.donate'), type: 'url', inputmode: 'url', value: st.donateUrl || '', maxlength: 300, placeholder: t('compete.set.donatePh'), hint: t('compete.set.donateHint') }) +
        '<div class="mt-3">' + ui.list([settingToggle('teams', teams, t('compete.set.teams'), t('compete.set.teamsSub')),
          settingToggle('u13', u13, t('compete.set.u13'), t('compete.set.u13Sub'))]) + '</div>' +
        errBox('cmp-settings-err') + ui.btn(t('compete.set.save'), { type: 'submit', block: true, cls: 'mt-4' }) + '</form>'
    });
    return prizes + settings;
  }
  function toolsHtml(s) {
    var c = cmp.comp;
    // a closed competition takes nobody new: no invitation to copy or share
    var invite = c.open === false ? '' : ui.card({ kicker: { icon: 'qr-code', text: t('compete.tools.invite') }, body: codeBox(c.code) + inviteButtons() });
    var reports = ui.card({ kicker: { icon: 'file-text', text: t('compete.tools.title') }, body: ui.list([
      ui.row({ icon: 'printer', title: t('compete.tools.poster'), sub: t('compete.tools.posterSub'), act: 'cmp.openUrl', arg: 'poster', chevron: true }),
      ui.row({ icon: 'award', title: t('compete.tools.certs'), sub: t('compete.tools.certsSub'), act: 'cmp.openUrl', arg: 'certs', chevron: true }),
      ui.row({ icon: 'download', title: t('compete.tools.csv'), sub: t('compete.tools.csvSub'), act: 'cmp.csv', chevron: true }),
      ui.row({ icon: 'refresh-cw', title: t('compete.tools.refresh'), act: 'cmp.refresh', chevron: true })
    ]) });
    var open = c.open !== false;
    var danger = ui.card({ cls: 'cl-danger-card', kicker: { icon: 'triangle-alert', text: t('compete.tools.danger') }, body: ui.list([
      ui.row({ icon: open ? 'lock' : 'lock-open', title: t(open ? 'compete.tools.close' : 'compete.tools.reopen'), sub: t(open ? 'compete.tools.closeSub' : 'compete.tools.reopenSub'),
        act: 'cmp.openToggle', cls: open ? 'cl-danger-row' : '' }),
      ui.row({ icon: 'trash-2', title: t('compete.tools.delete'), sub: t('compete.tools.deleteSub'), act: 'cmp.delete', cls: 'cl-danger-row' })
    ]) });
    var back = ui.card({ cls: 'is-tight', body: ui.list([ui.row({ icon: 'arrow-left', title: t('compete.tools.switch'), sub: t('compete.tools.switchSub'),
      act: 'cmp.switch', chevron: true })]) });
    return invite + reports + back + danger;
  }
  function patchCompete() {
    var s = cmpState();
    if (!s) { softRefresh(); return; }
    var r = routeNow();
    if (r === 'compete/board') {
      patch('cmp-hero', boardHero(s));
      patch('cmp-board', boardCardHtml(boardOpts()));
      return;
    }
    if (r !== 'compete') return;
    if (s.role === 'organiser') { if (!currentUser()) return; patch('cmp-hero', orgHero(s)); } else patch('cmp-hero', participantHero(s));
    if (document.getElementById('cmp-board')) patch('cmp-board', boardCardHtml(boardOpts()));
    if (document.getElementById('cmp-roster')) patch('cmp-roster', rosterCardHtml());
  }
  function competeTopbar(title, back) {
    var s = cmpState();
    var actions = s && feat.competitions && (s.role !== 'organiser' || currentUser()) ? [{ icon: 'refresh-cw', act: 'cmp.refresh', label: t('compete.refresh') }] : [];
    RS.topbar({ title: title, back: back || false, actions: actions });
  }
  function renderCompete(el) {
    competeTopbar(t('nav.compete'));
    if (!feat.loaded) { el.innerHTML = heroMsg(t('compete.loading'), true); return; }
    if (!feat.competitions) { el.innerHTML = unavailableHtml(); return; }
    var s = cmpState();
    if (!s && pend.claiming) { el.innerHTML = heroMsg(t('compete.join.joining'), true); return; }
    if (!s) {
      if (cmp.code) resetCmp();
      el.innerHTML = notJoinedHtml();
      if (currentUser()) loadMine(false);
      landFocus();
      return;
    }
    if (s.role === 'organiser') { el.innerHTML = organiserHtml(s); scrollTabs(); landFocus(); return; }
    ensureLoaded(s);
    el.innerHTML = participantHtml(s);
    landFocus();
  }
  function renderBoardPage(el) {
    var s = cmpState();
    RS.topbar({ title: t('compete.board.title'), back: 'compete',
      actions: s && feat.competitions ? [{ icon: 'refresh-cw', act: 'cmp.refresh', label: t('compete.refresh') }] : [] });
    if (!feat.loaded) { el.innerHTML = heroMsg(t('compete.loading'), true); return; }
    if (!feat.competitions) { el.innerHTML = unavailableHtml(); return; }
    if (s && s.role === 'organiser' && !currentUser()) { el.innerHTML = orgSignInHero(s); return; }
    if (!s) {
      el.innerHTML = heroMsg(t('compete.board.none'), false, { eyebrow: t('compete.invite.eyebrow'), text: t('compete.invite.cta'), act: 'nav.go', arg: 'compete' });
      return;
    }
    ensureLoaded(s);
    el.innerHTML = boardHero(s) + (cmp.err && !cmp.board ? errorCard() : boardCardHtml(boardOpts()));
  }
  function renderOrgPage(el) {
    RS.topbar({ title: t('org.title'), back: 'compete' });
    var hero = ui.hero({
      id: 'cmp-hero', kicker: { icon: 'school', text: t('org.hero.kicker') }, text: t('org.hero.text'),
      metrics: [{ label: t('org.hero.mPrizes'), value: t('org.hero.vPrizes') }, { label: t('org.hero.mSetup'), value: t('org.hero.vSetup') }, { label: t('org.hero.mCost'), value: t('org.hero.vCost') }],
      cta: feat.competitions ? { eyebrow: t('org.hero.eyebrow'), text: t('org.hero.cta'), act: 'cmp.focusOrg' } : null
    });
    if (!feat.loaded) { el.innerHTML = hero + ui.card({ body: ui.loading() }); return; }
    if (!feat.competitions) {
      var again = feat.offline || feat.failed;
      el.innerHTML = hero + ui.card({ body: ui.note(t(feat.offline ? 'compete.offline.text' : (feat.failed ? 'compete.failed.text' : 'compete.unavailable.text')),
        { icon: feat.offline ? 'wifi-off' : 'cloud-off', tone: 'plain' }) +
        (again ? '<div class="mt-3">' + ui.btn(t('core.retry'), { variant: 'secondary', icon: 'refresh-cw', act: 'cloud.retry' }) + '</div>' : '') });
      return;
    }
    var u = currentUser();
    var details = ui.card({ kicker: { icon: 'building-2', text: t('org.form.title') },
      body: fld({ id: 'org-name', label: t('org.name'), placeholder: t('org.namePh'), maxlength: 80, autocomplete: 'organization', required: true }) +
        pick({ id: 'org-type', label: t('org.type'), value: 'School', options: TYPES.map(function (x) { return { value: x, text: typeName(x) }; }) }) });
    var prizes = ui.card({ kicker: { icon: 'gift', text: t('compete.prizes.title') },
      body: '<p class="caption">' + esc(t('compete.prizes.hint')) + '</p><div class="mt-3">' + prizeFields('org', []) + '</div>' });
    var acct = u ? ui.card({ kicker: { icon: 'user-check', text: t('org.account.title') },
      body: '<p>' + th('org.as', { name: userName(u) }) + '</p>' })
      : ui.card({ kicker: { icon: 'user', text: t('org.account.title') },
        body: '<p>' + esc(t('org.account.body')) + '</p><div class="mt-3">' + orgModeSeg(draft('org-mode', 'register')) +
          '<input type="hidden" name="org-mode" id="org-mode" value="' + esc(draft('org-mode', 'register')) + '"></div><div class="mt-3">' +
          fld({ id: 'org-email', label: t('acct.email'), type: 'email', autocomplete: 'email', inputmode: 'email', maxlength: 120 }) +
          ui.field({ id: 'org-pass', label: t('acct.password'), type: 'password', autocomplete: draft('org-mode', 'register') === 'login' ? 'current-password' : 'new-password',
            hint: t('acct.passwordHint'), maxlength: 200 }) + '</div>' });
    el.innerHTML = hero + '<form class="cl-stack" id="org-form" data-act-submit="cmp.create" novalidate>' + details + prizes + acct +
      errBox('org-err') + ui.btn(t('org.submit'), { type: 'submit', block: true, icon: 'plus' }) +
      '<p class="caption t-center">' + esc(t('org.after')) + '</p></form>';
  }
  function orgModeSeg(mode) {
    return ui.seg([{ value: 'register', text: t('org.account.new') }, { value: 'login', text: t('org.account.existing') }], mode,
      { act: 'org.acctMode', label: t('org.account.title'), id: 'org-mode-seg' });
  }
  function startPoll() {
    stopPoll();
    cmp.pollT = setInterval(function () {
      if (document.hidden || !onCompete() || !feat.competitions) return;
      var s = cmpState();
      if (s && (s.role !== 'organiser' || currentUser())) loadComp(s, true);
    }, 60000);
  }
  function stopPoll() { if (cmp.pollT) { clearInterval(cmp.pollT); cmp.pollT = null; } }
  // Opening Compete re-sends a participant's scores, as v7 did (the first board load of a session sends them too).
  function onCompeteShow() {
    startPoll();
    var s = cmpState();
    if (s && s.role === 'participant' && cmp.board && cmp.code === s.code) cmpScoreSync(true);
  }

  RS.router.register('compete', {
    title: function () { return t('nav.compete'); },
    render: renderCompete,
    onShow: onCompeteShow,
    onHide: stopPoll
  });
  RS.router.register('compete/board', {
    tab: 'compete', parent: 'compete',
    title: function () { return t('compete.board.title'); },
    render: renderBoardPage,
    onShow: onCompeteShow,
    onHide: stopPoll
  });
  RS.router.register('compete/org', {
    tab: 'compete', parent: 'compete',
    title: function () { return t('org.title'); },
    render: renderOrgPage
  });

  /* ------------------------------------------------------------------ prayer times (adhan, offline) */
  var adhanP = null;
  function adhanLib() { var a = window.adhan; return a && a.PrayerTimes && a.CalculationMethod ? a : null; }
  function loadAdhan() {
    if (adhanLib()) return Promise.resolve(adhanLib());
    if (!adhanP) {
      // The service worker precaches exactly this URL (no query string), so prayer times work offline.
      adhanP = RS.lazy('vendor/adhan.umd.min.js').then(function () {
        if (!adhanLib()) throw new Error('adhan');
        return adhanLib();
      }, function (e) { adhanP = null; throw e; });
    }
    return adhanP;
  }
  var adhanFailed = false;
  function onAdhanReady() {
    adhanFailed = false;
    // The Today screen rendered a loading placeholder before the library arrived: show the real times now.
    if (document.querySelector('.cl-prayer.is-pending') || (routeNow() === 'today' && started())) softRefresh();
  }
  function onAdhanFail() {
    if (adhanFailed) return;
    adhanFailed = true;
    var card = document.querySelector('.cl-prayer.is-pending');
    if (card) patch(card.id, prayerCardFail());
  }
  // The prayer location is kept, synced and sent with reminders rounded to 2 decimals (about 1 km; prayer times move by
  // under a minute). Older data (v7 kept 4 decimals, about 11 m) is rounded wherever it is read or passed on.
  function round2(n) { return Math.round(Number(n) * 100) / 100; }
  function roundPrayer(p) {
    if (!isObj(p)) return null;
    var lat = Number(p.lat), lng = Number(p.lng);
    if (!isFinite(lat) || !isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
    return Object.assign({}, p, { lat: round2(lat), lng: round2(lng) });
  }
  function pcfg() {
    var p = roundPrayer(RS.settings.prayer);
    if (!p) return null;
    return { lat: p.lat, lng: p.lng, method: METHODS.indexOf(p.method) >= 0 ? p.method : 'MuslimWorldLeague', madhab: p.madhab === 'hanafi' ? 'hanafi' : 'shafi' };
  }
  function validDate(d) { return d instanceof Date && !isNaN(d.getTime()); }
  function timesFor(date) {
    var A = adhanLib(), c = pcfg();
    if (!A || !c) return null;
    try {
      var params = A.CalculationMethod[c.method]();
      if (c.madhab === 'hanafi') params.madhab = A.Madhab.Hanafi;
      var d = date instanceof Date ? date : new Date();
      return new A.PrayerTimes(new A.Coordinates(c.lat, c.lng), new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12), params);
    } catch (e) { return null; }
  }
  function tomorrow(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 12); }
  function fmtT(d) { return validDate(d) ? RS.fmt.time(d) : '–'; }
  function pName(id) { return t('prayer.' + id); }
  // A fasting day comes from the calendar, never from the app mode (a competition keeps the mode on Ramadan all year):
  // a day of Ramadan that is not marked as a sisters' (hayd) day, or a Sunnah fast logged for that date. The two Eids
  // and the days of Tashreeq (1 Shawwal, 10-13 Dhul Hijjah) are never fasting days.
  function fastingOn(date) {
    var h = RS.hijri(date);
    if ((h.month === 10 && h.day === 1) || (h.month === 12 && h.day >= 10 && h.day <= 13)) return false;
    if (h.month === 9) { var r = getDay(RS.clamp(h.day, 1, 30)); return !(r && r.hayd); }
    var iso = RS.todayISO(date), yr = RS.store.get('rs-yr-' + iso, null);
    if (isObj(yr) && yr.hayd) return false;
    var x = RS.store.get('rs-extras', null);
    var f = isObj(x) && isObj(x.fasts) ? x.fasts[iso] : null;
    return !!(isObj(f) && f.v);
  }
  function fastingToday() { return fastingOn(new Date()); }
  // The next prayer (or sunrise, which ends Fajr) after now; after Isha it is tomorrow's Fajr.
  function nextInfo(now, pt) {
    var order = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'];
    for (var i = 0; i < order.length; i++) {
      var d = pt[order[i]];
      if (validDate(d) && d > now) return { id: order[i], time: d, tomorrow: false };
    }
    var tm = timesFor(tomorrow(now));
    return tm && validDate(tm.fajr) ? { id: 'fajr', time: tm.fajr, tomorrow: true } : null;
  }
  function currentId(now, pt) {
    var cur = null;
    FIVE.forEach(function (p) { if (validDate(pt[p]) && now >= pt[p]) cur = p; });
    if (cur === 'fajr' && validDate(pt.sunrise) && now >= pt.sunrise) cur = null;      // Fajr time ends at sunrise
    return cur;
  }
  function cta() {
    var c = pcfg();
    if (!c) return null;
    if (!adhanLib()) {
      loadAdhan().then(onAdhanReady, onAdhanFail);
      return { eyebrow: t('prayer.title'), text: t(adhanFailed ? 'prayer.failedShort' : 'prayer.loading'), act: 'prayer.open' };
    }
    var now = new Date(), pt = timesFor(now);
    if (!pt) return null;
    var fasting = fastingToday();
    if (fasting && validDate(pt.fajr) && now < pt.fajr) {
      return { eyebrow: t('prayer.cta.atEyebrow', { prayer: pName('fajr'), time: fmtT(pt.fajr) }), text: t('prayer.cta.suhoor', { time: RS.fmt.dur(pt.fajr - now) }), act: 'prayer.open' };
    }
    if (fasting && validDate(pt.maghrib) && now < pt.maghrib) {
      return { eyebrow: t('prayer.cta.atEyebrow', { prayer: pName('maghrib'), time: fmtT(pt.maghrib) }), text: t('prayer.cta.iftar', { time: RS.fmt.dur(pt.maghrib - now) }), act: 'prayer.open' };
    }
    var nx = nextInfo(now, pt);
    if (!nx) return { eyebrow: t('prayer.title'), text: t('prayer.all'), act: 'prayer.open' };
    if (nx.id === 'sunrise') {
      return { eyebrow: t('prayer.cta.atEyebrow', { prayer: pName('sunrise'), time: fmtT(nx.time) }), text: t('prayer.cta.fajrEnds', { time: RS.fmt.dur(nx.time - now) }), act: 'prayer.open' };
    }
    if (nx.tomorrow && fastingOn(nx.time)) {       // after Isha: suhoor only when tomorrow is a fasting day (not Eid)
      return { eyebrow: t('prayer.cta.atEyebrow', { prayer: pName('fajr'), time: fmtT(nx.time) }), text: t('prayer.cta.suhoor', { time: RS.fmt.dur(nx.time - now) }), act: 'prayer.open' };
    }
    return { eyebrow: t('prayer.cta.nextEyebrow', { time: fmtT(nx.time) }), text: t('prayer.cta.in', { prayer: pName(nx.id), time: RS.fmt.dur(nx.time - now) }), act: 'prayer.open' };
  }
  // "51.51, -0.13 · Moonsighting Committee": the coordinates are one left-to-right isolate (the minus sign stays
  // with its number in right-to-left languages) and the separator is drawn by RS.ui.meta.
  function whereHtml() {
    var c = pcfg();
    if (!c) return '';
    return ui.meta([ltr(t('prayer.coords', { lat: c.lat.toFixed(2), lng: c.lng.toFixed(2) })), bdi(t('prayer.m.' + c.method))]);
  }
  function whereLine(cls) {
    return '<p class="cl-where caption' + (cls ? ' ' + cls : '') + '">' + RS.icon('map-pin', { size: 14 }) + '<span class="cl-where-t">' + whereHtml() + '</span></p>';
  }
  function methodOptions() { return METHODS.map(function (m) { return { value: m, text: t('prayer.m.' + m) }; }); }
  function madhabOptions() { return [{ value: 'shafi', text: t('prayer.madhab.shafi') }, { value: 'hanafi', text: t('prayer.madhab.hanafi') }]; }
  function duaHtml() {
    return '<div class="cl-dua">' + ui.kicker('moon', t('prayer.dua.kicker')) + ui.arabic(IFTAR_DUA.ar) +
      '<p class="cl-translit" lang="ar-Latn" dir="ltr">' + esc(IFTAR_DUA.tr) + '</p>' +
      '<p class="cl-dua-mean">' + esc(t('prayer.dua.meaning')) + '</p>' +
      '<div class="mt-2">' + ui.ref({ ref: IFTAR_DUA.ref, grade: IFTAR_DUA.grade }) + '</div>' +
      '<p class="caption mt-2">' + esc(t('prayer.dua.before')) + '</p></div>';
  }
  function showDua(now, pt) {                      // from 20 minutes before Maghrib until Isha, on a fasting day
    if (!fastingToday() || !validDate(pt.maghrib)) return false;
    var end = validDate(pt.isha) ? pt.isha : new Date(pt.maghrib.getTime() + 90 * 60000);
    return now >= new Date(pt.maghrib.getTime() - 20 * 60000) && now < end;
  }
  function failHtml() {
    return ui.note(t('prayer.failed'), { icon: 'wifi-off', tone: 'plain' }) +
      '<div class="mt-3">' + ui.btn(t('core.retry'), { variant: 'secondary', icon: 'refresh-cw', act: 'prayer.retry' }) + '</div>';
  }
  function prayerCardFail() {
    return ui.card({ id: 'cloud-prayer-card', cls: 'cl-prayer', kicker: { icon: 'clock', text: t('prayer.title') }, body: failHtml() });
  }
  function cardHtml() {
    var c = pcfg();
    if (!c) return '';
    if (!adhanLib()) {
      loadAdhan().then(onAdhanReady, onAdhanFail);
      if (adhanFailed) return prayerCardFail();
      return ui.card({ id: 'cloud-prayer-card', cls: 'cl-prayer is-pending', kicker: { icon: 'clock', text: t('prayer.title') }, body: ui.loading(t('prayer.loading')) });
    }
    var now = new Date(), pt = timesFor(now);
    if (!pt) return prayerCardFail();
    var cur = currentId(now, pt), nx = nextInfo(now, pt), fasting = fastingToday();
    var rows = FIVE.map(function (p) {
      var isCur = cur === p;
      var sub = [];
      if (p === 'fajr' && fasting) sub.push(t('prayer.suhoorEnds'));
      if (p === 'maghrib' && fasting) sub.push(t('prayer.iftar'));
      if (nx && !nx.tomorrow && nx.id === p) sub.push(t('prayer.inTime', { time: RS.fmt.dur(nx.time - now) }));
      if (p === 'fajr' && nx && !nx.tomorrow && nx.id === 'sunrise') sub.push(t('prayer.endsIn', { time: RS.fmt.dur(nx.time - now) }));
      return ui.row({ titleHtml: esc(pName(p)) + (isCur ? ' <span class="cl-now">' + esc(t('prayer.now')) + '</span>' : ''), subHtml: metaLine(sub),
        value: fmtT(pt[p]), cls: 'cl-pr' + (isCur ? ' cl-cur' : '') });
    });
    var body = ui.list(rows, { label: t('prayer.title') }) + (showDua(now, pt) ? duaHtml() : '') + whereLine();
    return ui.card({ id: 'cloud-prayer-card', cls: 'cl-prayer', kicker: { icon: 'clock', text: t('prayer.title') },
      action: { text: t('prayer.all'), act: 'prayer.open', icon: 'chevron-right' }, body: body });
  }
  function next() {
    var c = pcfg();
    if (!c || !adhanLib()) return null;
    var now = new Date(), pt = timesFor(now);
    var nx = pt ? nextInfo(now, pt) : null;
    return nx ? { id: nx.id, name: pName(nx.id), time: nx.time, inMs: nx.time - now, tomorrow: nx.tomorrow } : null;
  }
  function times(date) {
    var pt = timesFor(date || new Date());
    if (!pt) return null;
    return { fajr: pt.fajr, sunrise: pt.sunrise, dhuhr: pt.dhuhr, asr: pt.asr, maghrib: pt.maghrib, isha: pt.isha };
  }
  function prayerSheetBody() {
    var c = pcfg(), now = new Date(), pt = timesFor(now);
    if (!pt) return ui.note(t('prayer.failed'), { icon: 'wifi-off', tone: 'plain' });
    var cur = currentId(now, pt), fasting = fastingToday();
    var rows = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'].map(function (p) {
      var sub = p === 'fajr' && fasting ? t('prayer.suhoorEnds') : (p === 'maghrib' && fasting ? t('prayer.iftar') : (p === 'sunrise' ? t('prayer.sunriseSub') : ''));
      return ui.row({ titleHtml: esc(pName(p)) + (cur === p ? ' <span class="cl-now">' + esc(t('prayer.now')) + '</span>' : ''), sub: sub, value: fmtT(pt[p]),
        cls: 'cl-pr' + (cur === p ? ' cl-cur' : '') });
    });
    var A = adhanLib();
    try {
      var sun = new A.SunnahTimes(pt);
      if (validDate(sun.lastThirdOfTheNight)) rows.push(ui.row({ title: t('prayer.lastThird'), sub: t('prayer.lastThirdSub'), value: fmtT(sun.lastThirdOfTheNight), cls: 'cl-pr' }));
    } catch (e) { /* not available */ }
    var cd = cta();
    return '<p class="caption">' + metaLine([RS.fmt.date(now, { weekday: 'long', day: 'numeric', month: 'long' }), RS.fmt.hijri(now)]) + '</p>' +
      (cd ? '<div class="mt-3" id="cl-prayer-cd">' + countdownHtml(cd) + '</div>' : '') +
      '<div class="cl-prayer mt-2">' + ui.list(rows, { label: t('prayer.title') }) + '</div>' +
      (fasting ? duaHtml() : '') +
      '<div class="mt-4">' + ui.select({ id: 'cl-method', label: t('prayer.method'), value: c.method, act: 'prayer.method', hint: t('prayer.methodHint'), options: methodOptions() }) +
      ui.select({ id: 'cl-madhab', label: t('prayer.madhab'), value: c.madhab, act: 'prayer.madhab', hint: t('prayer.madhabHint'), options: madhabOptions() }) + '</div>' +
      whereLine('mt-4');
  }
  function countdownHtml(cd) { return ui.note('', { icon: 'clock', html: metaLine([cd.text, cd.eyebrow]) }); }
  var PRAYER_ACTIONS = function () { return [{ text: t('prayer.changeLocation'), act: 'prayer.setup', icon: 'map-pin' }]; };
  // The times sheet. While the offline library loads it shows a spinner; if it cannot load, a Try again button. The
  // "Change location" action is always there, so the sheet is never a dead end.
  function openPrayer() {
    if (!pcfg()) { openPrayerSetup(); return; }
    if (!adhanLib()) {
      RS.sheet.open({ title: t('prayer.title'), body: ui.loading(t('prayer.loading')), cls: 'cl-prayer-sheet', actions: PRAYER_ACTIONS() });
      loadAdhan().then(function () {
        var b = RS.sheet.body();
        if (b && b.closest('.cl-prayer-sheet')) b.innerHTML = prayerSheetBody();
        onAdhanReady();
      }, function () {
        adhanFailed = true;
        var b = RS.sheet.body();
        if (b && b.closest('.cl-prayer-sheet')) b.innerHTML = failHtml();
      });
      return;
    }
    RS.sheet.open({ title: t('prayer.title'), body: prayerSheetBody(), cls: 'cl-prayer-sheet', actions: PRAYER_ACTIONS() });
  }
  function openPrayerSetup() {
    var c = pcfg();
    var p = isObj(RS.settings.prayer) ? RS.settings.prayer : {};
    var method = c ? c.method : (METHODS.indexOf(p.method) >= 0 ? p.method : 'MuslimWorldLeague');
    // One primary action: Save (the footer button submits the form, so Enter in a field saves too).
    var body = '<p>' + esc(t('prayer.setup.body')) + '</p>' +
      ui.btn(t('prayer.setup.locate'), { variant: 'secondary', block: true, icon: 'map-pin', act: 'prayer.locate', cls: 'mt-4', id: 'cl-locate' }) +
      '<p class="cl-or"><span>' + esc(t('prayer.setup.manual')) + '</span></p>' +
      '<form id="cl-prayer-form" data-act-submit="prayer.save" novalidate><div class="cl-latlng">' +
      ui.field({ id: 'cl-lat', label: t('prayer.setup.lat'), value: c ? String(c.lat) : '', placeholder: t('prayer.setup.latPh'), maxlength: 12, autocomplete: 'off', attrs: { dir: 'ltr', spellcheck: 'false' } }) +
      ui.field({ id: 'cl-lng', label: t('prayer.setup.lng'), value: c ? String(c.lng) : '', placeholder: t('prayer.setup.lngPh'), maxlength: 12, autocomplete: 'off', attrs: { dir: 'ltr', spellcheck: 'false' } }) +
      '</div><div class="mt-3">' + ui.select({ id: 'cl-setup-method', label: t('prayer.method'), value: method, hint: t('prayer.methodHint'), options: methodOptions() }) +
      ui.select({ id: 'cl-setup-madhab', label: t('prayer.madhab'), value: c ? c.madhab : 'shafi', hint: t('prayer.madhabHint'), options: madhabOptions() }) + '</div>' +
      errBox('cl-prayer-err') + '</form>' +
      (c ? '<div class="t-center mt-3"><button type="button" class="link-btn cl-danger-link" data-act="prayer.remove">' + esc(t('prayer.setup.remove')) + '</button></div>' : '');
    RS.sheet.open({ title: t('prayer.setup.title'), body: body, cls: 'cl-setup-sheet',
      actions: [{ text: t('core.cancel'), act: 'sheet.close' }, { text: t('prayer.setup.save'), variant: 'primary', type: 'submit', attrs: { form: 'cl-prayer-form' } }] });
  }
  function savePrayer(lat, lng, method, madhab) {
    var p = { lat: round2(lat), lng: round2(lng), method: METHODS.indexOf(method) >= 0 ? method : 'MuslimWorldLeague' };
    if (madhab === 'hanafi') p.madhab = 'hanafi';
    RS.settings.prayer = p;
    RS.saveSettings();
    RS.emit('data', { source: 'cloud' });
    RS.sheet.close();
    RS.toast(t('prayer.setup.saved'), { tone: 'success' });
    loadAdhan().then(function () { softRefresh(); }, onAdhanFail);
    softRefresh();
  }
  function parseCoord(v) {
    var s = String(v == null ? '' : v).trim().replace(/−/g, '-');
    if (/^-?\d+,\d+$/.test(s)) s = s.replace(',', '.');
    if (!/^-?\d+(\.\d+)?$/.test(s)) return NaN;
    return parseFloat(s);
  }
  // Keeps the prayer card (and an open prayer sheet's countdown) current without re-rendering the screen.
  setInterval(function () {
    if (document.hidden || !pcfg() || !adhanLib()) return;
    var card = document.getElementById('cloud-prayer-card');
    if (card && !card.contains(document.activeElement)) patch('cloud-prayer-card', cardHtml());
    var cd = document.getElementById('cl-prayer-cd');
    if (cd) { var c = cta(); if (c) cd.innerHTML = countdownHtml(c); }
  }, 30000);

  /* ------------------------------------------------------------------ push reminders */
  function pushSupported() { return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window; }
  // {hour} while reminders are on; hour is null for a v7 subscription (rs-push '1'), whose hour only the server knows
  function pushState() {
    var v = RS.store.get('rs-push', null);
    if (!v) return null;
    return { hour: isObj(v) && PUSH_HOURS.indexOf(num(v.hour)) >= 0 ? num(v.hour) : null };
  }
  function hourText(h) { return RS.fmt.time(new Date(2000, 0, 1, h, 0)); }
  function b64ToU8(b) {
    var p = new Array((4 - b.length % 4) % 4 + 1).join('=');
    var raw = atob((b + p).replace(/-/g, '+').replace(/_/g, '/'));
    var a = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) a[i] = raw.charCodeAt(i);
    return a;
  }
  // The app's service worker (registered by main.js) receives the pushes. No registration → fail at once, not hang.
  function swReady() {
    return navigator.serviceWorker.getRegistration().then(function (reg) {
      if (!reg) throw codeErr('push_sw');
      if (reg.active) return reg;
      return new Promise(function (resolve, reject) {
        var timer = setTimeout(function () { reject(codeErr('push_sw')); }, 10000);
        navigator.serviceWorker.ready.then(function (r) { clearTimeout(timer); resolve(r); }, function () { clearTimeout(timer); reject(codeErr('push_sw')); });
      });
    }, function () { throw codeErr('push_sw'); });
  }
  function askPermission() {
    if (Notification.permission === 'granted') return Promise.resolve('granted');
    return new Promise(function (resolve) {
      var r = Notification.requestPermission(resolve);
      if (r && typeof r.then === 'function') r.then(resolve, function () { resolve('denied'); });
    });
  }
  function pushSubscribe(sub, hour) {
    var c = pcfg();
    var tz = '';
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { tz = ''; }
    return api('/api/push/subscribe', { method: 'POST', body: { sub: sub && sub.toJSON ? sub.toJSON() : sub, prefs: { hour: hour, iftar: !!c, oddNights: true },
      tz: tz, lat: c ? c.lat : null, lng: c ? c.lng : null, lang: RS.lang() } });
  }
  function openPushSheet(editing) {
    var cur = pushState();
    RS.sheet.open({
      title: t('push.sheet.title'),
      body: '<p>' + esc(t('push.sheet.body')) + '</p><div class="mt-4">' + ui.select({ id: 'cl-push-hour', label: t('push.sheet.hour'), value: cur && cur.hour != null ? cur.hour : 20,
        hint: t('push.sheet.hint'), options: PUSH_HOURS.map(function (h) { return { value: h, text: hourText(h) }; }) }) + '</div>',
      actions: [{ text: t('core.cancel'), act: 'sheet.close' }, { text: t(editing ? 'push.sheet.save' : 'push.sheet.on'), act: editing ? 'push.saveTime' : 'push.enable', variant: 'primary', icon: 'bell' }]
    });
  }
  function chosenHour() {
    var el = document.getElementById('cl-push-hour');
    var h = el ? parseInt(el.value, 10) : 20;
    return PUSH_HOURS.indexOf(h) >= 0 ? h : 20;
  }
  function pushOff() {
    var done = function () { RS.store.del('rs-push'); RS.toast(t('push.disabled')); softRefresh(); };
    if (!pushSupported()) { done(); return; }
    swReady().then(function (reg) { return reg.pushManager.getSubscription(); }).then(function (sub) {
      if (!sub) return null;
      api('/api/push/subscribe', { method: 'DELETE', body: { endpoint: sub.endpoint } }).then(noop, noop);
      return sub.unsubscribe();
    }).then(done, done);
  }

  /* ------------------------------------------------------------------ share progress */
  function curDay() {
    var d = RS.tracker && typeof RS.tracker.todayIndex === 'function' ? num(RS.tracker.todayIndex()) : num(RS.settings.day);
    return RS.clamp(d || 1, 1, 30);
  }
  function calcStreak(day, fn) {                   // v7 calcStreak, read from storage
    var s = 0;
    for (var d = day - 1; d >= 1; d--) { var x = getDay(d); if (x && fn(x.ck)) s++; else break; }
    var td = getDay(day);
    if (td && fn(td.ck)) s++;
    return s;
  }
  function streaksNow() {
    if (RS.tracker && typeof RS.tracker.streaks === 'function') {
      try { var st = RS.tracker.streaks(); if (isObj(st)) return st; } catch (e) { /* fall back */ }
    }
    var day = curDay();
    return {
      fajr: calcStreak(day, function (c) { return c && c.fajr; }),
      night: calcStreak(day, function (c) { return c && c.isha; }),
      quran: calcStreak(day, function (c) { return c && (c['quran-recitation'] || c['quran-reflection'] || c['quran-listening']); }),
      charity: calcStreak(day, function (c) { return c && (c['charity-given'] || c['fed-fasting']); })
    };
  }
  function totalPages() { var q = qPagesMap(), n = 0; for (var d = 1; d <= 30; d++) n += num(q[d]); return n; }
  function badgeCount() { var b = objOr(RS.store.get('rs-badges', null)); return Object.keys(b).filter(function (k) { return !!b[k]; }).length; }
  // Outside Ramadan the day-of-Ramadan card would be misleading (it is built from the Ramadan day records and the
  // public /s/ page says "Day N of Ramadan"): share a preparing / year-round line and the app link instead.
  function shareProgress() {
    var mode = RS.appMode();
    if (mode !== 'ramadan') {
      var left = mode === 'prep' && RS.prep && typeof RS.prep.daysUntilRamadan === 'function' ? RS.prep.daysUntilRamadan() : null;
      var line = mode === 'prep' ? (left > 0 ? tn('share.prepText', num(left)) : t('share.prepTextSoon')) : t('share.yearText');
      shareOrCopy({ title: t('core.app'), text: line, url: location.origin + '/' }, t('cloud.copied'));
      return Promise.resolve();
    }
    var day = curDay();
    var dr = getDay(day), pct = dr ? dr.pct : 0;
    var st = streaksNow(), streak = Math.max(num(st.fajr), num(st.quran));
    var q = totalPages(), b = badgeCount();
    var u = currentUser(), cs = cmpState();
    var name = (u && u.name) || (cs && cs.role === 'participant' && cs.name) || '';
    var parts = [t('share.text', { day: nf(day), pct: RS.fmt.pct(pct) })];
    if (streak) parts.push(tn('share.streak', streak));
    parts.push(tn('share.pages', q));
    var text = parts.join(' · ') + ' · ' + t('share.suffix');
    var base = location.origin + '/';
    var done = function (url) { shareOrCopy({ title: t('core.app'), text: text, url: url }, t('cloud.copied')); };
    if (!feat.db) { done(base); return Promise.resolve(); }
    return api('/api/share', { method: 'POST', body: { d: day, p: pct, s: Math.min(30, streak), q: Math.min(604, q), b: Math.min(12, b), n: String(name).slice(0, 24) }, auth: false })
      .then(function (r) { done((r && r.url) || base); }, function () { done(base); });
  }

  /* ------------------------------------------------------------------ AI helpers */
  function aiAvailable() { return !!(feat.loaded && feat.ai); }
  function enText(key) { var en = RS.I18N && RS.I18N.en; return en && hasOwn.call(en, key) ? en[key] : (RS.has(key) ? RS.t(key) : ''); }
  var explainSeq = 0;
  function explain(id) {
    var d = RS.content && RS.content.deeds && RS.content.deeds[id];
    if (!d) return;
    if (!aiAvailable()) { RS.toast(t('ai.off'), { tone: 'error' }); return; }
    var seq = ++explainSeq;
    var label = RS.has('deed.' + id + '.label') ? t('deed.' + id + '.label') : id;
    RS.sheet.open({ title: label, body: ui.loading(t('ai.thinking')), cls: 'cl-ai-sheet' });
    api('/api/ai/explain', { method: 'POST', auth: false, body: { label: enText('deed.' + id + '.label') || label, ref: d.ref || '', exp: enText('deed.' + id + '.exp'),
      lang: RS.lang(), level: RS.settings.level === 'kids' || RS.settings.level === 'new' ? RS.settings.level : 'adult' } }).then(function (r) {
      var b = RS.sheet.body();
      if (seq !== explainSeq || !b || !b.closest('.cl-ai-sheet')) return;
      var paras = String((r && r.text) || '').split(/\n\s*\n/).map(function (p) { return p.trim(); }).filter(Boolean);
      b.innerHTML = '<div class="cl-ai">' + paras.map(function (p) { return '<p>' + esc(p).replace(/\n/g, '<br>') + '</p>'; }).join('') + '</div>' +
        (d.ref ? '<div class="mt-3">' + ui.ref({ ref: d.ref, url: d.url, grade: d.grade }) + '</div>' : '') +
        '<div class="mt-4">' + ui.note(t('ai.note'), { icon: 'info', tone: 'plain' }) + '</div>';
    }, function (e) {
      var b = RS.sheet.body();
      if (seq !== explainSeq || !b || !b.closest('.cl-ai-sheet')) return;
      b.innerHTML = ui.note(errText(e), { icon: 'triangle-alert', tone: 'danger' }) +
        '<div class="mt-3">' + ui.btn(t('core.retry'), { variant: 'secondary', icon: 'refresh-cw', act: 'ai.explain', arg: id, block: true }) + '</div>';
    });
  }
  function reflect() {
    if (!aiAvailable()) return Promise.resolve('');
    var day = curDay();
    var y = getDay(Math.max(1, day - 1));
    var done = [], missed = [];
    var deeds = (RS.content && RS.content.deeds) || {};
    if (y) Object.keys(y.ck).forEach(function (id) { if (!deeds[id]) return; (y.ck[id] ? done : missed).push(enText('deed.' + id + '.label') || id); });
    var st = streaksNow();
    return api('/api/ai/reflect', { method: 'POST', auth: false, body: { lang: RS.lang(), summary: { day: day, pct: y ? y.pct : 0, quran: num(qPagesMap()[day - 1]),
      streaks: { fajr: num(st.fajr), quran: num(st.quran) }, done: done.slice(0, 20), missed: missed.slice(0, 10) } } })
      .then(function (r) { return String((r && r.prompt) || '').trim(); }, function () { return ''; });   // the caller shows its own message
  }
  // Rewrites true/false cards for the reading level (kids) or the advanced quiz level; answers never change.
  function quizTransform(cards) {
    var s = RS.settings;
    var lvl = s.level === 'kids' ? 'kids' : (s.quizLevel === 'advanced' ? 'advanced' : null);
    if (!aiAvailable() || !lvl || !Array.isArray(cards) || !cards.length) return Promise.resolve(cards);
    var chunks = [];
    for (var i = 0; i < cards.length; i += 12) chunks.push(cards.slice(i, i + 12));
    return Promise.all(chunks.map(function (chunk) {
      var send = chunk.map(function (c) { c = objOr(c); return { q: String(c.q || ''), a: !!c.a, x: String(c.x || ''), r: String(c.r || c.ref || '') }; });
      if (!send.some(function (c) { return c.q; })) return chunk;
      return api('/api/ai/quiz', { method: 'POST', auth: false, body: { level: lvl, lang: RS.lang(), cards: send } }).then(function (r) {
        var out = r && Array.isArray(r.cards) ? r.cards : [];
        return chunk.map(function (c, k) {
          var n = out[k];
          if (!isObj(n) || !isObj(c)) return c;
          var o = Object.assign({}, c);
          if (typeof n.q === 'string' && n.q.trim()) o.q = n.q;
          if (typeof n.x === 'string' && n.x.trim()) o.x = n.x;
          return o;
        });
      }, function () { return chunk; });
    })).then(function (parts) { return [].concat.apply([], parts); });
  }

  /* ------------------------------------------------------------------ Me cards + settings rows */
  function competition() {
    var s = cmpState();
    if (!s) return null;
    return { role: s.role === 'organiser' ? 'organiser' : 'participant', code: s.code, name: compName(s), member: s.name || '', grp: s.grp || '' };
  }
  function acctOffText() { return t(feat.offline ? 'acct.offline' : (feat.failed ? 'acct.failed' : 'acct.unavailable')); }
  function accountCardHtml() {
    var kick = { icon: 'cloud', text: t('acct.kicker') };
    if (!feat.loaded) return ui.card({ id: 'cl-account', kicker: kick, body: ui.loading() });
    if (!feat.accounts) {
      var again = feat.offline || feat.failed;
      return ui.card({ id: 'cl-account', kicker: kick, title: t('acct.title'),
        body: ui.note(acctOffText(), { icon: feat.offline ? 'wifi-off' : 'cloud-off', tone: 'plain' }) +
          (again ? '<div class="mt-3">' + ui.btn(t('core.retry'), { variant: 'secondary', icon: 'refresh-cw', act: 'cloud.retry', arg: 'acct' }) + '</div>' : '') });
    }
    var u = currentUser();
    if (u) return ui.card({ id: 'cl-account', kicker: kick, title: u.name || u.email || t('acct.kicker'), body: accountBodyHtml(u, false) });
    return ui.card({ id: 'cl-account', kicker: kick, title: t('acct.title'),
      body: '<p>' + esc(t('acct.body')) + '</p><div class="btn-row mt-4">' + ui.btn(t('acct.signIn'), { act: 'acct.open', arg: 'login', icon: 'log-in' }) +
        ui.btn(t('acct.create'), { variant: 'secondary', act: 'acct.open', arg: 'register', icon: 'user-plus' }) + '</div>' +
        '<p class="caption mt-3">' + esc(t('acct.privacy')) + '</p>' });
  }
  function myCompsHtml() {
    var rows = myCompRows(true);
    return rows.length ? ui.list(rows) : '';
  }
  function compCardHtml() {
    if (!feat.competitions) return '';
    var rows = [], s = cmpState();
    if (s) {
      var org = s.role === 'organiser', name = knownName(s);
      var b = cmp.board && cmp.code === s.code ? cmp.board : null;
      var sub = org ? t('compete.mine.owned') : (b && b.me ? t('compete.me.rank', { rank: nf(b.me.rank), n: nf(b.participants) }) : t('compete.me.participant'));
      // Before the name is known (v7 data; primeComp fetches it) the row says "Your competition" and shows the code.
      rows.push(ui.row({ icon: 'trophy', titleHtml: name ? bdi(name) : esc(t('compete.me.current')), subHtml: metaLine([sub, name ? '' : s.code]),
        act: 'nav.go', arg: 'compete', chevron: true }));
    } else {
      rows.push(ui.row({ icon: 'trophy', title: t('compete.me.join'), sub: t('compete.me.joinSub'), act: 'nav.go', arg: 'compete', chevron: true }));
    }
    var mine = '<div id="cl-mycomps">' + myCompsHtml() + '</div>';
    if (currentUser()) loadMine(false);
    return ui.card({ id: 'cl-comps', kicker: { icon: 'users', text: t('compete.me.kicker') }, body: ui.list(rows) + mine });
  }
  function meCardsHtml() { return accountCardHtml() + compCardHtml(); }
  function settingsRows() {
    var rows = [];
    if (feat.accounts) {
      rows.push(ui.row({ icon: 'cloud', title: t('cloud.set.sync'), subHtml: '<span class="cl-sync-label">' + esc(syncLabel()) + '</span>', act: 'cloud.account', chevron: true }));
    }
    if (feat.push && pushSupported()) {
      var ps = pushState();
      rows.push(ui.row({ icon: 'bell', title: t('push.title'), sub: t(ps ? 'push.onSub' : 'push.offSub'), toggle: { on: !!ps, act: 'push.toggle' } }));
      if (ps) rows.push(ui.row({ icon: 'clock', title: t('push.time'), value: ps.hour != null ? hourText(ps.hour) : t('push.timeChoose'), act: 'push.time', chevron: true }));
    }
    rows.push(ui.row({ icon: 'map-pin', title: t('prayer.set.title'), subHtml: pcfg() ? whereHtml() : esc(t('prayer.set.off')), act: 'prayer.setup', chevron: true }));
    if (aiAvailable()) {
      rows.push(ui.row({ icon: 'graduation-cap', title: t('ai.quizLevel'), sub: t('ai.quizLevelSub'), toggle: { on: RS.settings.quizLevel === 'advanced', act: 'ai.quizLevel' } }));
    }
    return rows;
  }
  // The Me settings screen puts this straight into a card body: a hairline list of the cloud rows.
  function settingsRowsHtml() { return ui.list(settingsRows(), { cls: 'cl-settings' }); }

  /* ------------------------------------------------------------------ actions */
  RS.act('cloud.retry', function (where) {
    featLoad().then(function () {
      if (where === 'acct') focusSoon(['#cl-account button', '#cl-account']);
      else focusHeroCta();
    });
  });
  RS.act('cloud.account', function () { openAccount('login'); });
  RS.act('acct.open', function (mode) { openAccount(mode); });
  RS.act('acct.submit', function (v, form) {
    if (isBusy(form)) return;
    var mode = v.mode === 'register' ? 'register' : 'login';
    var email = String(v['acct-email'] || '').trim(), pass = String(v['acct-pass'] || ''), name = String(v['acct-name'] || '').trim();
    if (!validEmail(email)) { formErr(form, t('acct.badEmail'), '#acct-email'); return; }
    if (pass.length < 6) { formErr(form, t('acct.badPassword'), '#acct-pass'); return; }
    formBusy(form, true);
    api('/api/auth/' + mode, { method: 'POST', auth: false, body: mode === 'register' ? { email: email, password: pass, name: name } : { email: email, password: pass } })
      .then(function (r) {
        clearDrafts('acct-');
        setAuth(r.token, r.user);
        RS.sheet.close();
        RS.toast(t(mode === 'register' ? 'acct.created' : 'acct.welcome'), { tone: 'success' });
        syncNow(true);
      }, function (e) { formBusy(form, false); formErr(form, errText(e), e.code === 'bad_credentials' ? '#acct-pass' : null); });
  });
  RS.act('acct.magic', function (arg, el) {
    var form = el && el.closest ? el.closest('form') : null;
    var input = form ? form.querySelector('#acct-email') : null;
    var email = input ? input.value.trim() : '';
    if (!validEmail(email)) { formErr(form, t('acct.badEmail'), '#acct-email'); return; }
    btnBusy(el, true);
    api('/api/auth/magic', { method: 'POST', auth: false, body: { email: email } }).then(function () {
      RS.sheet.close();
      RS.toast(t('acct.magicSent'), { tone: 'success', ms: 5000 });
    }, function (e) { btnBusy(el, false); formErr(form, errText(e)); });
  });
  RS.act('acct.sync', function () { syncNow(true); });
  function focusSignIn() {
    focusSoon(['#cl-account button[data-act="acct.open"][data-arg="login"]', '#view [data-act="cloud.account"]', '#cmp-hero button.cta', '#cl-account']);
  }
  RS.act('acct.logout', function () {
    var s = cmpState();
    if (s && s.role === 'organiser') resetCmp(s.code);
    setAuth(null, null, true);
    if (RS.sheet.isOpen()) RS.sheet.close();
    RS.refresh();
    focusSignIn();
    RS.toast(t('acct.loggedOut'));
  });
  RS.act('acct.delete', function (arg, el) {
    if (el && el.getAttribute('aria-disabled') === 'true') return;
    btnBusy(el, true);
    // Competitions this account organises keep running with no manager once it is gone (the server keeps them and
    // clears the owner): say so, so they can be closed or deleted first.
    loadMine(false).then(function (m) {
      btnBusy(el, false);
      var owned = m && m.owned ? m.owned.length : 0;
      var body = owned ? tn('acct.delete.bodyOwned', owned) : t('acct.delete.body');
      return RS.confirm({ title: t('acct.delete.title'), body: body, ok: t('acct.delete.ok'), danger: true });
    }).then(function (ok) {
      if (!ok) return;
      api('/api/auth/me', { method: 'DELETE' }).then(function () {
        var s = cmpState();
        if (s && s.role === 'organiser') { cmpSave(null); resetCmp(); }
        setAuth(null, null, true);
        if (RS.sheet.isOpen()) RS.sheet.close();
        RS.refresh();
        focusSignIn();
        RS.toast(t('acct.deleted'));
      }, function (e) { RS.toast(errText(e), { tone: 'error' }); });
    });
  });

  RS.act('share.progress', function () { shareProgress(); });
  RS.act('share.again', function () {
    if (!lastShare || !navigator.share) return;
    var p = lastShare.p;
    navigator.share(p).then(function () { RS.sheet.close(); }, noop);
  });
  RS.act('share.copyLast', function () {
    if (!lastShare) return;
    var p = lastShare.p;
    RS.sheet.close();
    copyText(shareText(p), lastShare.msg);
  });

  RS.act('cloud.give', function () {
    var s = cmpState();
    var url = (cmp.comp && s && cmp.comp.code === s.code && cmp.comp.settings && cmp.comp.settings.donateUrl) || (s && s.donate) || DEFAULT_DONATE;
    if (!/^https?:\/\//i.test(url)) url = /^[\w.-]+\.[a-z]{2,}(\/.*)?$/i.test(url) ? 'https://' + url : DEFAULT_DONATE;
    openUrl(url);
  });

  RS.act('ai.explain', function (id) { explain(id); });
  RS.act('ai.quizLevel', function () {
    RS.settings.quizLevel = RS.settings.quizLevel === 'advanced' ? 'standard' : 'advanced';
    RS.saveSettings();
    RS.emit('data', { source: 'cloud' });
    RS.refresh();
  });

  RS.act('prayer.open', function () { openPrayer(); });
  RS.act('prayer.setup', function () { openPrayerSetup(); });
  // Try again after the offline prayer-times library failed to load: the sheet opens again in its loading state; on
  // Today the screen is redrawn once the library is there (card and hero countdown) and focus goes to the card.
  RS.act('prayer.retry', function (arg, el) {
    adhanFailed = false;
    var b = RS.sheet.body();
    if (b && b.closest('.cl-prayer-sheet')) { openPrayer(); return; }
    btnBusy(el, true);
    loadAdhan().then(function () {
      RS.refresh();
      var card = document.getElementById('cloud-prayer-card');
      if (card) focusEl(headingOf(card));
    }, function () {
      adhanFailed = true;
      btnBusy(el, false);
      RS.toast(t('prayer.failed'), { tone: 'error' });
    });
  });
  RS.act('prayer.locate', function (arg, el) {
    if (!navigator.geolocation) { RS.toast(t('prayer.setup.noGeo'), { tone: 'error' }); return; }
    btnBusy(el, true);
    RS.toast(t('prayer.setup.locating'));
    navigator.geolocation.getCurrentPosition(function (pos) {
      var m = document.getElementById('cl-setup-method'), h = document.getElementById('cl-setup-madhab');
      savePrayer(pos.coords.latitude, pos.coords.longitude, m ? m.value : 'MuslimWorldLeague', h ? h.value : 'shafi');
    }, function () {
      btnBusy(el, false);
      RS.toast(t('prayer.setup.noGeo'), { tone: 'error' });
      focusSoon('#cl-lat');
    }, { timeout: 10000, maximumAge: 600000 });
  });
  function submitPrayerForm() {
    var form = document.getElementById('cl-prayer-form');
    if (!form) return;
    var lat = parseCoord((form.querySelector('#cl-lat') || {}).value), lng = parseCoord((form.querySelector('#cl-lng') || {}).value);
    if (!isFinite(lat) || Math.abs(lat) > 90) { formErr(form, t('prayer.setup.invalid'), '#cl-lat'); return; }
    if (!isFinite(lng) || Math.abs(lng) > 180) { formErr(form, t('prayer.setup.invalid'), '#cl-lng'); return; }
    savePrayer(lat, lng, (form.querySelector('#cl-setup-method') || {}).value, (form.querySelector('#cl-setup-madhab') || {}).value);
  }
  RS.act('prayer.submit', submitPrayerForm);
  RS.act('prayer.save', submitPrayerForm);
  RS.act('prayer.remove', function () {
    RS.settings.prayer = null;
    RS.saveSettings();
    RS.emit('data', { source: 'cloud' });
    RS.sheet.close();
    RS.toast(t('prayer.setup.removed'));
    softRefresh();
  });
  function setPrayerOpt(key, val) {
    var p = isObj(RS.settings.prayer) ? Object.assign({}, RS.settings.prayer) : null;
    if (!p) return;
    if (key === 'method') p.method = METHODS.indexOf(val) >= 0 ? val : 'MuslimWorldLeague';
    else if (val === 'hanafi') p.madhab = 'hanafi';
    else delete p.madhab;
    RS.settings.prayer = p;
    RS.saveSettings();
    RS.emit('data', { source: 'cloud' });
    var b = RS.sheet.body();
    if (b && b.closest('.cl-prayer-sheet')) {
      b.innerHTML = prayerSheetBody();
      var f = b.querySelector(key === 'method' ? '#cl-method' : '#cl-madhab');
      if (f) { try { f.focus({ preventScroll: true }); } catch (e) { f.focus(); } }
    }
    RS.refresh();
  }
  RS.act('prayer.method', function (v) { setPrayerOpt('method', v); });
  RS.act('prayer.madhab', function (v) { setPrayerOpt('madhab', v); });

  RS.act('push.toggle', function () {
    if (pushState()) { pushOff(); return; }
    if (!pushSupported()) { RS.toast(t('push.unsupported'), { tone: 'error' }); return; }
    if (!feat.push) { RS.toast(t('push.serverOff'), { tone: 'error' }); return; }
    openPushSheet(false);
  });
  RS.act('push.time', function () { openPushSheet(true); });
  RS.act('push.enable', function (arg, el) {
    var hour = chosenHour();
    btnBusy(el, true);
    askPermission().then(function (p) {
      if (p !== 'granted') throw codeErr('push_denied');
      return api('/api/push/key');
    }).then(function (k) {
      if (!k || !k.enabled || !k.publicKey) throw codeErr('push_off');
      return swReady().then(function (reg) {
        return reg.pushManager.getSubscription().then(function (sub) {
          return sub || reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(k.publicKey) });
        });
      });
    }).then(function (sub) { return pushSubscribe(sub, hour); }).then(function () {
      RS.store.set('rs-push', { on: 1, hour: hour });
      RS.sheet.close();
      RS.toast(t('push.enabled'), { tone: 'success' });
      softRefresh();
    }).catch(function (e) {
      btnBusy(el, false);
      RS.toast(e && ERR[e.code] ? t(ERR[e.code]) : (e && e.status != null && e.status >= 0 ? errText(e) : t('push.failed')), { tone: 'error' });
    });
  });
  RS.act('push.saveTime', function (arg, el) {
    var hour = chosenHour();
    btnBusy(el, true);
    swReady().then(function (reg) { return reg.pushManager.getSubscription(); }).then(function (sub) {
      if (!sub) throw codeErr('push_sw');
      return pushSubscribe(sub, hour);
    }).then(function () {
      RS.store.set('rs-push', { on: 1, hour: hour });
      RS.sheet.close();
      RS.toast(t('push.saved'), { tone: 'success' });
      softRefresh();
    }).catch(function (e) {
      btnBusy(el, false);
      RS.toast(e && ERR[e.code] ? t(ERR[e.code]) : errText(e), { tone: 'error' });
    });
  });

  // competitions
  RS.act('cmp.focusJoin', function () { focusSoon('#cmp-join-code'); });
  RS.act('cmp.focusOrg', function () { focusSoon('#org-name'); });
  RS.act('cmp.join', function (v, form) {
    if (isBusy(form)) return;
    var code = String(v['cmp-join-code'] || '').trim().toUpperCase(), name = String(v['cmp-join-name'] || '').trim(), grp = String(v['cmp-join-grp'] || '').trim();
    var invite = pend.t && pend.code === code;
    if (!code) { formErr(form, t('compete.join.missing'), '#cmp-join-code'); return; }
    if (!/^[A-Z0-9]{6}$/.test(code)) { formErr(form, t('compete.join.badCode'), '#cmp-join-code'); return; }
    if (!name && !invite) { formErr(form, t('compete.join.missing'), '#cmp-join-name'); return; }
    formBusy(form, true);
    api('/api/comp/' + enc(code) + '/join', { method: 'POST', body: invite ? { t: pend.t, grp: grp } : { name: name, grp: grp } }).then(function (r) {
      clearInvite();
      joinedOk(r, name, grp);
      cmpScoreSync(true);
    }, function (e) {
      formBusy(form, false);
      formErr(form, errText(e, 'cloud.err.compNotFound'), e.code === 'name_required' ? '#cmp-join-name' : '#cmp-join-code');
    });
  });
  // Opening another competition from "Your competitions": a participant entry it replaces is asked about first and
  // kept (rs-comp-prev), so it can be opened again from the same list.
  function openEntry(entry) {
    switchTo(entry);
    if (routeNow() === 'compete') { RS.refresh(); window.scrollTo(0, 0); focusSoon('#cmp-hero'); } else RS.router.go('compete');
  }
  RS.act('cmp.pick', function (code) {
    code = String(code || '');
    var own = cmp.mine && cmp.mine.owned ? cmp.mine.owned.filter(function (c) { return c.code === code; })[0] : null;
    confirmSwitch(code, 'organiser').then(function (ok) { if (ok) openEntry({ role: 'organiser', code: code, cname: own ? own.name : '' }); });
  });
  RS.act('cmp.resume', function (key) {
    var e = joinedEntry(key);
    if (!e) return;
    confirmSwitch(e.code, 'participant').then(function (ok) { if (ok) openEntry(e); });
  });
  RS.act('cmp.leave', function () {
    var s = cmpState();
    if (!s) return;
    RS.confirm({ title: t('compete.leave.title'), body: t('compete.leave.body'), ok: t('compete.leave.ok'), danger: true }).then(function (ok) {
      if (!ok) return;
      stashEntry(s);                               // the entry stays on the leaderboard: "Your competitions" can reopen it
      cmpSave(null);
      resetCmp();
      RS.toast(t('compete.left'));
      if (routeNow() === 'compete') { RS.refresh(); focusHeroCta(); } else RS.router.go('compete');
    });
  });
  RS.act('cmp.switch', function () {
    cmpSave(null);
    resetCmp();
    if (routeNow() === 'compete') RS.refresh(); else RS.router.go('compete');
  });
  // Topbar / Tools refresh: says whether it worked (a failed refresh keeps the last board and shows why).
  RS.act('cmp.refresh', function () {
    var s = cmpState();
    if (!s) { featLoad(); return; }
    cmp.err = null;
    var p = loadComp(s, true);
    if (s.role === 'participant') cmpScoreSync(true);
    p.then(function (e) {
      if (!e) RS.toast(t('compete.refreshed'), { tone: 'success' });
      else if (!e.handled) RS.toast(errText(e, 'compete.notFound'), { tone: 'error' });
    });
  });
  RS.act('cmp.retry', function () {
    var s = cmpState();
    cmp.err = null;
    if (s) loadComp(s, false);
    softRefresh();
  });
  RS.act('cmp.view', function (v) {
    cmp.view = v === 'teams' ? 'teams' : 'individuals';
    patch('cmp-board', boardCardHtml(boardOpts()));
  });
  // "Show more": focus moves to the first row that was just shown, where reading continues.
  RS.act('cmp.more', function () {
    var from = cmp.limit;
    cmp.limit += 100;
    patch('cmp-board', boardCardHtml(boardOpts()));
    var list = RS.$('#cmp-board ul.cl-board');
    var li = list && list.children[from], row = li && li.querySelector('.row');
    if (row) { row.setAttribute('tabindex', '-1'); row.setAttribute('data-cl-focus', ''); focusEl(row); }
  });
  RS.act('cmp.otab', function (v) {
    cmp.otab = ['board', 'roster', 'enrol', 'settings', 'tools'].indexOf(v) >= 0 ? v : 'board';
    RS.refresh();
  });
  RS.act('cmp.copy', function () {
    var s = cmpState();
    if (s) copyText(inviteText(s.code), t('compete.code.copied'));
  });
  RS.act('cmp.share', function () {
    var s = cmpState();
    if (!s) return;
    // The link goes in url only (share targets add it to the text themselves); copying adds it once.
    shareOrCopy({ title: t('core.app'), text: t('compete.inviteShareText', { code: s.code }), url: joinUrl(s.code) }, t('compete.code.copied'));
  });
  RS.act('cmp.openUrl', function (what) {
    var s = cmpState();
    if (!s) return;
    if (what === 'certs') { openCerts(s.code); return; }
    openUrl(API + '/poster/' + enc(s.code), t('compete.tools.poster'));
  });
  // Certificates need the organiser's sign-in. The page is fetched with the Authorization header (the session token
  // never goes into a URL, the browser history or server logs) and written into a tab opened at the tap, so no pop-up
  // blocker stops it. Where no tab could be opened or written, a sheet offers the page as a file to open and print.
  var certsHtml = null;
  function openCerts(code) {
    var w = null;
    try { w = window.open('', '_blank'); } catch (e) { w = null; }
    if (w) {
      try { w.opener = null; w.document.title = t('compete.tools.certs'); w.document.body.textContent = t('compete.certs.loading'); } catch (e) { /* written below */ }
    }
    var shut = function () { if (w) { try { w.close(); } catch (e) { /* ignore */ } } };
    fetch(API + '/api/comp/' + enc(code) + '/certs', { headers: { Authorization: 'Bearer ' + authToken() }, cache: 'no-store' }).then(function (r) {
      if (!r.ok) { var err = new Error('certs'); err.status = r.status; throw err; }
      return r.text();
    }).then(function (html) {
      var shown = false;
      if (w && !w.closed) {
        try { w.document.open(); w.document.write(html); w.document.close(); shown = true; } catch (e) { shown = false; }
      }
      if (shown) return;
      shut();
      certsHtml = { code: code, html: html };
      RS.sheet.open({ title: t('compete.tools.certs'), body: '<p>' + esc(t('compete.certs.blocked')) + '</p>' +
        ui.btn(t('compete.certs.download'), { act: 'cmp.certsSave', block: true, icon: 'download', cls: 'mt-4' }) });
    }, function (e) {
      shut();
      if (e && e.status === 401) { sessionExpired(); return; }
      RS.toast(e && e.status ? errText(e) : t('err.network'), { tone: 'error' });
    });
  }
  RS.act('cmp.certsSave', function () {
    if (!certsHtml) return;
    downloadBlob(new Blob([certsHtml.html], { type: 'text/html;charset=utf-8' }), t('compete.certs.file', { code: certsHtml.code }));
    RS.sheet.close();
  });
  RS.act('cmp.csv', function () {
    var s = cmpState();
    if (!s) return;
    fetch(API + '/api/comp/' + enc(s.code) + '/export', { headers: { Authorization: 'Bearer ' + authToken() }, cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error('export');
      return r.blob();
    }).then(function (b) { downloadBlob(b, t('compete.csv.file', { code: s.code })); RS.toast(t('compete.csvDone'), { tone: 'success' }); },
      function () { RS.toast(t('compete.csvFailed'), { tone: 'error' }); });
  });
  function rosterPatch(id, body) {
    var s = cmpState();
    if (!s) return;
    api('/api/comp/' + enc(s.code) + '/participants', { method: 'PATCH', body: Object.assign({ id: id }, body) })
      .then(function () { return refreshComp(); }, function (e) { RS.toast(errText(e), { tone: 'error' }); });
  }
  function rosterFind(id) { return (cmp.roster || []).filter(function (p) { return String(p.id) === String(id); })[0] || null; }
  RS.act('cmp.unflag', function (id) { rosterPatch(parseInt(id, 10), { flagged: false }); });
  RS.act('cmp.hide', function (id) {
    var p = rosterFind(id);
    rosterPatch(parseInt(id, 10), { hidden: !(p && p.hidden) });
  });
  RS.act('cmp.remove', function (id) {
    var s = cmpState();
    var p = rosterFind(id) || ((cmp.board && cmp.board.individuals) || []).filter(function (x) { return String(x.id) === String(id); })[0];
    if (!s) return;
    RS.confirm({ title: t('compete.roster.removeTitle', { name: p ? p.name : '' }), body: t('compete.roster.removeBody'), ok: t('compete.roster.removeOk'), danger: true }).then(function (ok) {
      if (!ok) return;
      api('/api/comp/' + enc(s.code) + '/participants?id=' + enc(parseInt(id, 10)), { method: 'DELETE' }).then(function () {
        RS.toast(t('compete.roster.removed'));
        return refreshComp();
      }, function (e) { RS.toast(errText(e), { tone: 'error' }); });
    });
  });
  RS.act('cmp.enrol', function (v, form) {
    if (isBusy(form)) return;
    var s = cmpState();
    var text = String(v['cmp-enrol-text'] || ''), grp = String(v['cmp-enrol-grp'] || '').trim();
    if (!s) return;
    if (!text.trim()) { formErr(form, t('compete.enrol.empty'), '#cmp-enrol-text'); return; }
    formBusy(form, true);
    api('/api/comp/' + enc(s.code) + '/enrol', { method: 'POST', body: { text: text, grp: grp } }).then(function (r) {
      cmp.lastEnrol = (r && r.participants) || [];
      delete drafts['cmp-enrol-text'];
      RS.toast(tn('compete.enrol.done', num(r && r.enrolled)), { tone: 'success' });
      refreshComp();
      RS.refresh();
      focusSoon('#cmp-enrol-out');
    }, function (e) { formBusy(form, false); formErr(form, errText(e), '#cmp-enrol-text'); });
  });
  RS.act('cmp.copyLink', function (i) {
    var p = (cmp.lastEnrol || [])[parseInt(i, 10)];
    if (p) copyText(p.link, t('compete.enrol.copied', { name: p.name }));
  });
  RS.act('cmp.linksCsv', function () {
    var s = cmpState();
    var rows = [[t('compete.csv.name'), t('compete.csv.group'), t('compete.csv.link')]].concat((cmp.lastEnrol || []).map(function (p) { return [p.name, p.grp, p.link]; }));
    downloadBlob(new Blob(['﻿' + rows.map(csvLine).join('\r\n')], { type: 'text/csv;charset=utf-8' }), t('compete.csv.linksFile', { code: s ? s.code : '' }));
  });
  RS.act('cmp.prizes', function (v, form) {
    if (isBusy(form)) return;
    var s = cmpState();
    if (!s) return;
    var prizes = [];
    for (var i = 0; i < 10; i++) prizes.push(String(v['op-p' + i] || '').trim());
    formBusy(form, true);
    api('/api/comp/' + enc(s.code), { method: 'PATCH', body: { prizes: prizes } }).then(function (r) {
      cmp.comp = Object.assign({}, cmp.comp, r.competition, { settings: Object.assign({}, objOr(cmp.comp && cmp.comp.settings), objOr(r.competition.settings)) });
      cmp.full = objOr(r.competition.settings);
      clearDrafts('op-');
      RS.toast(t('compete.prizes.saved'), { tone: 'success' });
      RS.refresh();
    }, function (e) { formBusy(form, false); formErr(form, errText(e)); });
  });
  RS.act('cmp.toggleSet', function (key, el) {
    if (!el) return;
    var on = el.getAttribute('aria-checked') !== 'true';
    el.setAttribute('aria-checked', String(on));
    var tg = el.querySelector('.tgl');
    if (tg) tg.classList.toggle('is-on', on);
    drafts[key === 'u13' ? 'os-u13' : 'os-teams'] = on;
  });
  RS.act('cmp.settings', function (v, form) {
    if (isBusy(form)) return;
    var s = cmpState();
    if (!s) return;
    var cap = String(v['os-cap'] || '').trim(), donate = String(v['os-donate'] || '').trim();
    if (cap && !(parseInt(cap, 10) >= 50 && parseInt(cap, 10) <= 800)) { formErr(form, t('compete.set.badCap'), '#os-cap'); return; }
    if (donate && !/^https?:\/\//i.test(donate)) {
      if (/^[\w.-]+\.[a-z]{2,}(\/\S*)?$/i.test(donate)) donate = 'https://' + donate;
      else { formErr(form, t('compete.set.badUrl'), '#os-donate'); return; }
    }
    var teamsEl = form.querySelector('[data-act="cmp.toggleSet"][data-arg="teams"]'), u13El = form.querySelector('[data-act="cmp.toggleSet"][data-arg="u13"]');
    var body = { name: String(v['os-name'] || '').trim() || (cmp.comp && cmp.comp.name), settings: {
      dailyCap: cap ? parseInt(cap, 10) : '', message: String(v['os-msg'] || '').trim(), sponsor: String(v['os-sponsor'] || '').trim(), donateUrl: donate,
      teams: !teamsEl || teamsEl.getAttribute('aria-checked') === 'true', under13: u13El && u13El.getAttribute('aria-checked') === 'true' ? true : null } };
    formBusy(form, true);
    api('/api/comp/' + enc(s.code), { method: 'PATCH', body: body }).then(function (r) {
      cmp.comp = Object.assign({}, cmp.comp, r.competition);
      cmp.full = objOr(r.competition.settings);
      clearDrafts('os-');
      rememberComp();
      // The server answers with what it stored: a setting it did not take (e.g. turning "Participants under 13" off,
      // which this API version ignores) is reported instead of a "saved" message, and the screen shows the stored value.
      var missed = settingsMissed(body, r.competition);
      if (missed.length) RS.toast(t('compete.set.notSaved', { fields: listText(missed) }), { tone: 'error' });
      else RS.toast(t('compete.set.saved'), { tone: 'success' });
      refreshComp();
      RS.refresh();
    }, function (e) { formBusy(form, false); formErr(form, errText(e)); });
  });
  function settingsMissed(sent, comp) {
    var got = objOr(comp && comp.settings), want = sent.settings, out = [];
    function str(v) { return v == null ? '' : String(v); }
    if (sent.name && str(comp && comp.name) !== sent.name) out.push(t('compete.set.name'));
    if (str(got.dailyCap || '') !== str(want.dailyCap)) out.push(t('compete.set.cap'));
    if (str(got.message) !== want.message) out.push(t('compete.set.message'));
    if (str(got.sponsor) !== want.sponsor) out.push(t('compete.set.sponsor'));
    if (str(got.donateUrl) !== want.donateUrl) out.push(t('compete.set.donate'));
    if ((got.teams !== false) !== want.teams) out.push(t('compete.set.teams'));
    if (!!got.under13 !== !!want.under13) out.push(t('compete.set.u13'));
    return out;
  }
  RS.act('cmp.openToggle', function () {
    var s = cmpState(), c = cmp.comp;
    if (!s || !c) return;
    var go = function () {
      api('/api/comp/' + enc(s.code), { method: 'PATCH', body: { open: c.open === false } }).then(function (r) {
        cmp.comp = Object.assign({}, cmp.comp, r.competition);
        RS.toast(t(r.competition.open ? 'compete.reopenedToast' : 'compete.closedToast'));
        refreshComp();
        RS.refresh();
      }, function (e) { RS.toast(errText(e), { tone: 'error' }); });
    };
    if (c.open === false) { go(); return; }
    RS.confirm({ title: t('compete.close.title'), body: t('compete.close.body'), ok: t('compete.close.ok'), danger: true }).then(function (ok) { if (ok) go(); });
  });
  RS.act('cmp.delete', function () {
    var s = cmpState(), c = cmp.comp;
    if (!s || !c) return;
    RS.confirm({ title: t('compete.delete.title'), body: t('compete.delete.body'), ok: t('compete.delete.ok'), danger: true }).then(function (ok) {
      if (!ok) return false;
      return RS.confirm({ title: t('compete.delete2.title', { name: c.name }), body: t('compete.delete2.body'), ok: t('compete.delete2.ok'), danger: true });
    }).then(function (ok) {
      if (!ok) return;
      api('/api/comp/' + enc(s.code), { method: 'DELETE' }).then(function () {
        cmpSave(null);
        resetCmp();
        cmp.mine = null;
        RS.toast(t('compete.deleted'));
        RS.refresh();
        focusHeroCta();
      }, function (e) { RS.toast(errText(e), { tone: 'error' }); });
    });
  });
  // The invitation card asked already; replacing a participant entry is confirmed (and the entry kept) as above.
  // Nothing is replaced until the server has accepted the invitation (claimInvite).
  RS.act('cmp.inviteSwitch', function () {
    if (!pend.code) return;
    confirmSwitch(pend.code, 'participant').then(function (ok) {
      if (!ok) return;
      if (pend.t) { claimInvite(); return; }
      // a code-only link: the join form opens in the invitation card (this device's entry stays until the join works)
      pend.form = true;
      drafts['cmp-join-code'] = pend.code;
      if (!patch('cmp-invite', pendingInviteCard(cmpState()))) RS.refresh();
      focusSoon(['#cmp-join-name', '#cmp-invite']);
    });
  });
  RS.act('cmp.inviteDismiss', function () {
    pend.code = null;
    pend.t = null;
    pend.form = pend.focus = false;
    clearInvite();
    clearDrafts('cmp-join-');
    RS.refresh();
    focusHeroCta();
  });
  RS.act('cmp.create', function (v, form) {
    if (isBusy(form)) return;
    var name = String(v['org-name'] || '').trim(), type = TYPES.indexOf(v['org-type']) >= 0 ? v['org-type'] : 'Other';
    if (!name) { formErr(form, t('org.missingName'), '#org-name'); return; }
    var prizes = [];
    for (var i = 0; i < 10; i++) prizes.push(String(v['org-p' + i] || '').trim());
    var account = null;
    if (!currentUser()) {
      var email = String(v['org-email'] || '').trim(), pass = String(v['org-pass'] || '');
      if (!validEmail(email)) { formErr(form, t('org.missingAccount'), '#org-email'); return; }
      if (pass.length < 6) { formErr(form, t('org.missingAccount'), '#org-pass'); return; }
      account = { mode: v['org-mode'] === 'login' ? 'login' : 'register', body: { email: email, password: pass } };
    }
    // This device switches to the organiser view of the new competition: a participant entry is asked about first.
    confirmSwitch(null, 'organiser').then(function (ok) {
      if (!ok) return;
      formBusy(form, true);
      // A new organiser account, or sign in to an existing one (the person chooses, so no request is made in vain)
      var pre = account ? api('/api/auth/' + account.mode, { method: 'POST', auth: false, body: account.body })
        .then(function (r) { setAuth(r.token, r.user, true); }) : Promise.resolve();
      pre.then(function () { return api('/api/comp', { method: 'POST', body: { name: name, type: type, prizes: prizes } }); }).then(function (r) {
        var c = r.competition;
        switchTo({ role: 'organiser', code: c.code, cname: c.name });
        clearDrafts('org-');
        cmp.mine = null;
        RS.toast(t('org.created'), { tone: 'success' });
        if (feat.sync) syncNow(false);
        RS.router.go('compete');
        setTimeout(function () { window.scrollTo(0, 0); }, 60);
      }, function (e) {
        formBusy(form, false);
        if (e.code === 'email_in_use') setOrgMode('login');
        formErr(form, errText(e), e.code === 'bad_credentials' ? '#org-pass' : (e.code === 'email_in_use' ? '#org-email' : null));
        if (currentUser()) softRefresh();
      });
    });
  });
  function setOrgMode(mode) {
    mode = mode === 'login' ? 'login' : 'register';
    drafts['org-mode'] = mode;
    var seg = document.getElementById('org-mode-seg'), hid = document.getElementById('org-mode'), pass = document.getElementById('org-pass');
    if (seg) RS.$$('.seg-btn', seg).forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-arg') === mode)); });
    if (hid) hid.value = mode;
    if (pass) pass.setAttribute('autocomplete', mode === 'login' ? 'current-password' : 'new-password');
  }
  RS.act('org.acctMode', function (mode) { setOrgMode(mode); });

  /* ------------------------------------------------------------------ events + boot */
  RS.on('data', function () {
    if (applying) return;
    observe();                                     // the change time of Quran pages, the prayer location and the mode
    markDirty();
    cmpScoreSync(false);
  });
  RS.on('params', takeParams);
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) return;
    if (sync.timer) { clearTimeout(sync.timer); sync.timer = null; syncNow(false); }
    if (cmp.scoreT) { clearTimeout(cmp.scoreT); cmp.scoreT = null; cmpScoreSync(true); }
  });
  // An invitation link opened before a reload (v7 kept it in sessionStorage too)
  try {
    var invT = sessionStorage.getItem('rs-invite'), invC = sessionStorage.getItem('rs-invite-code');
    if (invT && invC) { pend.t = invT; pend.code = invC; drafts['cmp-join-code'] = invC; ready.then(handlePending); }
  } catch (e) { /* ignore */ }
  // A location saved by v7 (4 decimals, about 11 m) is kept at about 1 km from now on, like a new one.
  (function () {
    var p = RS.settings.prayer, r = roundPrayer(p);
    if (r && (r.lat !== Number(p.lat) || r.lng !== Number(p.lng))) { RS.settings.prayer = r; RS.saveSettings(); }
  })();
  if (pcfg()) loadAdhan().then(noop, noop);        // prayer times usually ready before Today first renders
  observe();                                       // before any change: what is on the device now counts as time 0 (once)
  featLoad();

  RS.cloud = {
    ready: ready,
    feat: feat,
    user: currentUser,
    signedIn: function () { return !!authToken(); },
    syncSoon: markDirty,
    syncNow: syncNow,
    shareProgress: shareProgress,
    competition: competition,
    give: function () { RS.runAct('cloud.give'); },
    prayer: {
      configured: function () { return !!pcfg(); },
      loaded: function () { return !!adhanLib(); },
      cta: cta,
      cardHtml: cardHtml,
      next: next,
      times: times,
      open: openPrayer,
      setup: openPrayerSetup
    },
    meCardsHtml: meCardsHtml,
    settingsRowsHtml: settingsRowsHtml,
    aiAvailable: aiAvailable,
    explain: explain,
    reflect: reflect,
    quizTransform: quizTransform
  };
})();
