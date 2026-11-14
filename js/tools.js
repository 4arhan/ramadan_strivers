/* =====================================================================================================
   Ramadan Strivers v8 — tools.js. Small helpers around the date of Ramadan, prayer times and sharing:
   - The Ramadan countdown card (Today, outside Ramadan) and the start-date note with the "my mosque started on a
     different day" control (settings.hijriOff), plus the estimated-date disclaimer used wherever a date is shown.
   - The Prep tab: from Rajab until Ramadan (or while the Prep plan is running) the Compete tab becomes Prep, unless
     the device is in a competition.
   - Qibla direction (great-circle bearing to the Kaaba, with the phone's compass where the browser gives one).
   - A printable 30-day Ramadan timetable for the prayer location.
   - Story-sized (1080 x 1920) share images drawn on a canvas: progress and the hadith of the day.
   - First-launch setup questions: who uses the app (settings.level), what to do first, prayer times.
   API      RS.tools = {ramadanStart(), daysToRamadan(), countdownHtml(), dateNoteHtml(o), disclaimer(short),
            prepTabOn(), firstRun}
   Actions  tl.moon (arg -1|0|1) · tl.qibla · tl.compass · tl.timetable · tl.story (arg progress|hadith) ·
            tl.storySave · tl.setup · tl.setupGo · tl.setupSkip · tl.setupLang
   Storage  rs-setup ('1' once the setup questions were answered or skipped; this device only)
   ===================================================================================================== */
(function () {
  'use strict';
  var RS = window.RS;
  if (!RS || !RS.ui) return;
  var ui = RS.ui, t = RS.t, tn = RS.tn, esc = RS.esc;
  var DAY = 86400000, KAABA = { lat: 21.4225241, lng: 39.8261818 };
  function nf(n) { return RS.fmt.n(n, { maximumFractionDigits: 0 }); }
  function noon(d) { d = d || new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12); }
  function plus(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, 12); }
  function P() { var p = RS.cloud && RS.cloud.prayer; return p && typeof p.configured === 'function' ? p : null; }
  function bdi(s) { return '<bdi>' + esc(s) + '</bdi>'; }

  // Captured before the boot sequence saves any settings: a device that has never run the app.
  var firstRun = false;
  try { firstRun = !localStorage.getItem('rs-settings') && !localStorage.getItem('rs-setup') && !localStorage.getItem('rs-day-1') && !localStorage.getItem('rs-extras'); } catch (e) { firstRun = false; }

  /* ------------------------------------------------------------------ the date of Ramadan */
  // 1 Ramadan as the app counts it (the calculated Hijri calendar plus the moon-sighting setting): the current
  // Ramadan's first day while it runs, else the next one.
  function ramadanStart(from) {
    var today = noon(from), h = RS.hijri(today);
    if (h.month === 9) return plus(today, 1 - h.day);
    for (var i = 1; i <= 400; i++) { var d = plus(today, i), x = RS.hijri(d); if (x.month === 9 && x.day === 1) return d; }
    return null;
  }
  function daysToRamadan() { var s = ramadanStart(); if (!s) return null; return Math.max(0, Math.round((s - noon()) / DAY)); }
  function eidDate() {
    var s = ramadanStart();
    if (!s) return null;
    for (var i = 28; i <= 31; i++) { var d = plus(s, i), x = RS.hijri(d); if (x.month === 10 && x.day === 1) return d; }
    return plus(s, 30);
  }
  function longDate(d) { return RS.fmt.date(d, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); }
  function disclaimer(short) { return t(short ? 'tl.disclaimerShort' : 'tl.disclaimer'); }
  function off() { return RS.clamp(parseInt(RS.settings.hijriOff, 10) || 0, -1, 1); }
  // "Did your mosque announce a different date?" Earlier (+1: the Hijri date moves a day ahead) · As shown · Later.
  function moonControl() {
    return '<div class="tl-moon mt-3"><p class="tl-moon-q">' + esc(t('tl.moon.q')) + '</p>' +
      ui.seg([{ value: '1', text: t('tl.moon.earlier') }, { value: '0', text: t('tl.moon.asShown') }, { value: '-1', text: t('tl.moon.later') }], String(off()),
        { act: 'tl.moon', label: t('tl.moon.q'), cls: 'tl-moon-seg' }) + '</div>';
  }
  // The estimated date, the disclaimer and the control. o.eid: the Eid line instead of the start (end of Ramadan).
  function dateNoteHtml(o) {
    o = o || {};
    var d = o.eid ? eidDate() : ramadanStart(), inRam = RS.hijri().month === 9;
    var line = d ? t(o.eid ? 'tl.eidOn' : (inRam ? 'tl.startedOn' : 'tl.startsOn'), { date: longDate(d) }) : '';
    return ui.card({ kicker: { icon: 'moon', text: t(o.eid ? 'tl.eidKicker' : 'tl.dateKicker') }, cls: 'tl-date is-tight', id: o.id || null,
      body: (line ? '<p class="tl-date-l">' + bdi(line) + '</p>' : '') + ui.note(disclaimer(), { icon: 'info', tone: 'plain', cls: 'mt-2' }) + moonControl() });
  }
  // Today, outside Ramadan: how many days until Ramadan, the estimated date and the way into Ramadan Prep.
  function countdownHtml() {
    var n = daysToRamadan(), s = ramadanStart();
    if (n == null || !s) return '';
    var active = !!(RS.prep && typeof RS.prep.active === 'function' && safe(function () { return RS.prep.active(); }, false));
    var hasPrep = RS.router.has('prep');
    return ui.card({ kicker: { icon: 'moon-star', text: t('tl.cd.kicker') }, cls: 'tl-cd', id: 'tl-cd',
      body: '<p class="tl-cd-n"><span class="tl-cd-num">' + esc(nf(n)) + '</span> <span class="tl-cd-unit">' + esc(tn('tl.cd.days', n)) + '</span></p>' +
        '<p class="tl-date-l">' + bdi(t('tl.startsOn', { date: longDate(s) })) + '</p>' +
        ui.note(disclaimer(), { icon: 'info', tone: 'plain', cls: 'mt-2' }) + moonControl() +
        (hasPrep ? '<div class="btn-row mt-4">' + ui.btn(t(active ? 'tl.cd.continue' : 'tl.cd.start'), { act: 'nav.go', arg: 'prep', icon: 'sprout', block: true }) + '</div>' : '') });
  }
  function safe(fn, dflt) { try { return fn(); } catch (e) { return dflt; } }
  RS.act('tl.moon', function (v) {
    var n = RS.clamp(parseInt(v, 10) || 0, -1, 1);
    if (n === off()) return;
    RS.settings.hijriOff = n;
    RS.saveSettings();
    RS.emit('data', { source: 'tools' });
    var s = ramadanStart();
    RS.toast(n === 0 ? t('tl.moon.reset') : t('tl.moon.saved', { date: s ? longDate(s) : '' }), { tone: 'success' });
    RS.refresh();
  });

  /* ------------------------------------------------------------------ the Prep tab */
  // From Rajab (month 7) until Ramadan, or while the Prep plan is running before Ramadan, the fourth tab is Prep.
  // A device in a competition keeps Compete (its leaderboard is what the person is there for).
  function prepTabOn() {
    if (!RS.router || !RS.router.has('prep')) return false;
    if (RS.appMode() === 'ramadan' || RS.store.raw('rs-comp')) return false;
    var h = RS.hijri();
    if (h.month === 7 || h.month === 8) return true;
    return !!(RS.prep && typeof RS.prep.active === 'function' && safe(function () { return RS.prep.active(); }, false));
  }

  /* ------------------------------------------------------------------ Qibla */
  function rad(x) { return x * Math.PI / 180; }
  function qiblaOf(c) {
    var p1 = rad(c.lat), p2 = rad(KAABA.lat), dl = rad(KAABA.lng - c.lng);
    var y = Math.sin(dl) * Math.cos(p2), x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
    var brg = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
    var a = Math.pow(Math.sin((p2 - p1) / 2), 2) + Math.cos(p1) * Math.cos(p2) * Math.pow(Math.sin(dl / 2), 2);
    return { bearing: brg, km: 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) };
  }
  var DIRS = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'];
  function dirName(b) { return t('tl.dir.' + DIRS[Math.round(b / 45) % 8]); }
  function dialSvg(bearing) {
    var ticks = '';
    for (var i = 0; i < 72; i++) {
      var a = i * 5, major = a % 90 === 0, r1 = major ? 80 : (a % 30 === 0 ? 84 : 87);
      ticks += '<line x1="100" y1="' + (100 - r1) + '" x2="100" y2="12" transform="rotate(' + a + ' 100 100)" class="' + (major ? 'tl-tk-m' : 'tl-tk') + '"/>';
    }
    return '<svg class="tl-dial" viewBox="0 0 200 200" role="img" aria-label="' + esc(t('tl.qibla.dialLabel', { deg: nf(bearing) })) + '">' +
      '<g id="tl-rose">' + '<circle cx="100" cy="100" r="92" class="tl-ring"/>' + ticks +
      '<text x="100" y="36" class="tl-n" text-anchor="middle">' + esc(t('tl.dir.nShort')) + '</text>' +
      '<g transform="rotate(' + bearing.toFixed(1) + ' 100 100)"><line x1="100" y1="100" x2="100" y2="30" class="tl-needle"/>' +
      '<path d="M100 18 l9 16 h-18 z" class="tl-head"/><rect x="93" y="2" width="14" height="14" rx="2" class="tl-kaaba"/></g></g>' +
      '<circle cx="100" cy="100" r="5" class="tl-hub"/></svg>';
  }
  var compass = { on: false, handler: null };
  function stopCompass() {
    if (compass.handler) { window.removeEventListener('deviceorientationabsolute', compass.handler, true); window.removeEventListener('deviceorientation', compass.handler, true); }
    compass.on = false; compass.handler = null;
  }
  function openQibla() {
    var p = P(), c = p && p.configured() && typeof p.coords === 'function' ? p.coords() : null;
    if (!c) {
      RS.sheet.open({ title: t('tl.qibla.title'), body: '<p>' + esc(t('tl.qibla.needLocation')) + '</p>' + ui.btn(t('tl.qibla.setLocation'), { act: 'prayer.setup', icon: 'map-pin', block: true, cls: 'mt-4' }) });
      return;
    }
    var q = qiblaOf(c), place = typeof p.place === 'function' ? p.place() : '';
    var canCompass = 'DeviceOrientationEvent' in window;
    RS.sheet.open({ title: t('tl.qibla.title'), cls: 'tl-qibla-sheet', onClose: stopCompass,
      body: '<div class="tl-qibla">' + dialSvg(q.bearing) + '</div>' +
        '<p class="tl-qibla-deg">' + esc(t('tl.qibla.bearing', { deg: nf(q.bearing), dir: dirName(q.bearing) })) + '</p>' +
        '<p class="caption t-center">' + (place ? bdi(place) + ' · ' : '') + esc(t('tl.qibla.distance', { km: nf(q.km) })) + '</p>' +
        '<p class="caption t-center" id="tl-compass-status" role="status" aria-live="polite">' + esc(t('tl.qibla.static')) + '</p>' +
        (canCompass ? ui.btn(t('tl.qibla.useCompass'), { act: 'tl.compass', icon: 'compass', block: true, variant: 'secondary', cls: 'mt-3', id: 'tl-compass-btn' }) : '') +
        ui.note(t('tl.qibla.note'), { icon: 'info', tone: 'plain', cls: 'mt-3' }) });
  }
  // Rotates the rose so north points north while the phone turns; the Kaaba marker then shows the way to face.
  function startCompass() {
    var status = function (k) { var el = document.getElementById('tl-compass-status'); if (el) el.textContent = t(k); };
    var go = function () {
      stopCompass();
      var got = false;
      compass.handler = function (e) {
        var h = null;
        if (typeof e.webkitCompassHeading === 'number' && !isNaN(e.webkitCompassHeading)) h = e.webkitCompassHeading;
        else if (e.absolute && typeof e.alpha === 'number') h = (360 - e.alpha) % 360;
        if (h == null) return;
        var rose = document.getElementById('tl-rose');
        if (!rose) { stopCompass(); return; }
        rose.setAttribute('transform', 'rotate(' + (-h).toFixed(1) + ' 100 100)');
        if (!got) { got = true; status('tl.qibla.live'); }
      };
      window.addEventListener('ondeviceorientationabsolute' in window ? 'deviceorientationabsolute' : 'deviceorientation', compass.handler, true);
      compass.on = true;
      status('tl.qibla.waiting');
      setTimeout(function () { if (compass.on && !got) status('tl.qibla.noCompass'); }, 3000);
    };
    var D = window.DeviceOrientationEvent;
    if (D && typeof D.requestPermission === 'function') {          // iOS asks first, from a tap
      D.requestPermission().then(function (r) { if (r === 'granted') go(); else status('tl.qibla.denied'); }, function () { status('tl.qibla.denied'); });
    } else go();
  }
  RS.act('tl.qibla', openQibla);
  RS.act('tl.compass', startCompass);

  /* ------------------------------------------------------------------ printable Ramadan timetable */
  function timetableHtml() {
    var p = P(), s = ramadanStart();
    var rows = [], cols = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'];
    for (var i = 0; i < 30; i++) {
      var d = plus(s, i), pt = p.times(d);
      if (!pt) continue;
      rows.push('<tr><td>' + esc(nf(i + 1)) + '</td><td>' + esc(RS.fmt.date(d, { weekday: 'short', day: 'numeric', month: 'short' })) + '</td>' +
        cols.map(function (k) { return '<td' + (k === 'fajr' || k === 'maghrib' ? ' class="hl"' : '') + '>' + esc(p.fmt(pt[k])) + '</td>'; }).join('') + '</tr>');
    }
    var hy = RS.hijri(s).year, place = typeof p.place === 'function' ? p.place() : '', method = typeof p.methodName === 'function' ? p.methodName() : '';
    var heads = [t('tl.tt.day'), t('tl.tt.date'), t('tl.tt.suhoor'), t('prayer.sunrise'), t('prayer.dhuhr'), t('prayer.asr'), t('tl.tt.iftar'), t('prayer.isha')];
    var dir = RS.dir ? RS.dir() : 'ltr';
    return '<!doctype html><html lang="' + esc(RS.lang()) + '" dir="' + esc(dir) + '"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<title>' + esc(t('tl.tt.title', { year: String(hy) })) + '</title><style>' +
      '@page{size:A4;margin:12mm}*{box-sizing:border-box}body{font:13px/1.35 Manrope,system-ui,-apple-system,"Segoe UI",Roboto,"Noto Sans Arabic","Noto Sans Bengali","Noto Sans Devanagari",Arial,sans-serif;color:#101915;margin:0;padding:16px}' +
      'h1{font-size:22px;margin:0 0 2px}p{margin:2px 0;color:#4A5852}table{width:100%;border-collapse:collapse;margin-top:12px;font-variant-numeric:tabular-nums}' +
      'th,td{padding:5px 6px;text-align:center;border-bottom:1px solid #DDE5E0}th{background:#0B2219;color:#EEF8F2;font-weight:700;font-size:12px}' +
      'td{white-space:nowrap}td.hl{font-weight:800;color:#03684C}@media (max-width:600px){body{font-size:11px;padding:8px}th,td{padding:4px 3px}th{font-size:10px}}tr:nth-child(even) td{background:#F2F5F3}.note{margin-top:10px;font-size:12px}.brand{margin-top:6px;font-size:12px;color:#047857;font-weight:700}' +
      '@media print{body{padding:0}button{display:none}}button{margin-top:12px;font:inherit;padding:8px 14px;border-radius:999px;border:0;background:#0B2219;color:#fff}' +
      '</style></head><body><h1>' + esc(t('tl.tt.title', { year: String(hy) })) + '</h1><p><bdi>' + esc(place) + '</bdi>' + (method ? ' · ' + esc(method) : '') + '</p>' +
      '<table><thead><tr>' + heads.map(function (x) { return '<th>' + esc(x) + '</th>'; }).join('') + '</tr></thead><tbody>' + rows.join('') + '</tbody></table>' +
      '<p class="note">' + esc(disclaimer()) + ' ' + esc(t('tl.tt.note')) + '</p><p class="brand">ramadanstrivers.com</p>' +
      '<button type="button" onclick="print()">' + esc(t('tl.tt.print')) + '</button></body></html>';
  }
  var ttDoc = null;
  function openTimetable() {
    var p = P();
    if (!p || !p.configured()) { RS.sheet.open({ title: t('tl.tt.sheet'), body: '<p>' + esc(t('tl.tt.needLocation')) + '</p>' + ui.btn(t('tl.qibla.setLocation'), { act: 'prayer.setup', icon: 'map-pin', block: true, cls: 'mt-4' }) }); return; }
    var w = null;
    try { w = window.open('', '_blank'); } catch (e) { w = null; }
    var build = function () {
      var html = timetableHtml(), shown = false;
      if (w && !w.closed) { try { w.opener = null; w.document.open(); w.document.write(html); w.document.close(); shown = true; } catch (e) { shown = false; } }
      if (shown) return;
      ttDoc = html;
      RS.sheet.open({ title: t('tl.tt.sheet'), body: '<p>' + esc(t('tl.tt.blocked')) + '</p>' + ui.btn(t('tl.tt.download'), { act: 'tl.ttSave', block: true, icon: 'download', cls: 'mt-4' }) });
    };
    if (p.loaded()) build();
    else if (typeof p.load === 'function') p.load().then(build, function () { if (w) { try { w.close(); } catch (e) { /* ignore */ } } RS.toast(t('prayer.failed'), { tone: 'error' }); });
  }
  RS.act('tl.timetable', openTimetable);
  RS.act('tl.ttSave', function () {
    if (!ttDoc) return;
    var blob = new Blob([ttDoc], { type: 'text/html;charset=utf-8' }), url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = t('tl.tt.file') + '.html'; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1500);
  });

  /* ------------------------------------------------------------------ story share images (1080 x 1920) */
  var W = 1080, H = 1920;
  function wrap(ctx, text, maxW) {
    var words = String(text).split(/\s+/), lines = [], line = '';
    if (/^[　-鿿]/.test(text) || words.length === 1) {          // Chinese: wrap by character
      var chars = Array.from(String(text)); line = '';
      chars.forEach(function (ch) { if (ctx.measureText(line + ch).width > maxW && line) { lines.push(line); line = ch; } else line += ch; });
      if (line) lines.push(line);
      return lines;
    }
    words.forEach(function (w) { var test = line ? line + ' ' + w : w; if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; } else line = test; });
    if (line) lines.push(line);
    return lines;
  }
  var FONT = 'Manrope, system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans Arabic", "Noto Sans Bengali", "Noto Sans Devanagari", "Noto Sans SC", Arial, sans-serif';
  function bg(ctx) {
    var g = ctx.createLinearGradient(W * 0.7, 0, W * 0.3, H);
    g.addColorStop(0, '#143A2D'); g.addColorStop(0.46, '#0B2219'); g.addColorStop(1, '#06130F');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    var r = ctx.createRadialGradient(W * 0.88, 0, 0, W * 0.88, 0, W * 0.9);
    r.addColorStop(0, 'rgba(52,211,153,0.30)'); r.addColorStop(1, 'rgba(52,211,153,0)');
    ctx.fillStyle = r; ctx.fillRect(0, 0, W, H);
    // the app's crescent, large and faint
    ctx.save(); ctx.globalAlpha = 0.10; ctx.fillStyle = '#A7F3D0'; ctx.beginPath(); ctx.arc(W * 0.86, H * 0.80, 420, 0, Math.PI * 2);
    ctx.arc(W * 0.86 + 150, H * 0.80 - 120, 380, 0, Math.PI * 2, true); ctx.fill('evenodd'); ctx.restore();
  }
  function brand(ctx, rtl) {
    ctx.textAlign = 'center'; ctx.direction = rtl ? 'rtl' : 'ltr';
    ctx.fillStyle = '#A7F3D0'; ctx.font = '700 44px ' + FONT; ctx.fillText('Ramadan Strivers', W / 2, 150);
    ctx.fillStyle = '#06281C';
    var w = 640, x = (W - w) / 2, y = H - 230, h = 110;
    var gr = ctx.createLinearGradient(x, y, x + w, y + h); gr.addColorStop(0, '#C4F9E0'); gr.addColorStop(1, '#6EE7B7');
    ctx.fillStyle = gr; ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, 55); else ctx.rect(x, y, w, h); ctx.fill();
    ctx.fillStyle = '#05241A'; ctx.font = '800 46px ' + FONT; ctx.direction = 'ltr'; ctx.fillText('ramadanstrivers.com', W / 2, y + 72);
  }
  function drawProgress(ctx, rtl) {
    var s = RS.social && RS.social.summary ? RS.social.summary() : null;
    bg(ctx); brand(ctx, rtl);
    ctx.textAlign = 'center'; ctx.direction = rtl ? 'rtl' : 'ltr';
    var ram = s && s.m === 'ramadan';
    ctx.fillStyle = '#6EE7B7'; ctx.font = '700 56px ' + FONT;
    ctx.fillText(ram ? t('tl.story.day', { n: nf(s.d) }) : t('tl.story.yearTitle'), W / 2, 420);
    // ring
    var pct = s ? RS.clamp(s.p, 0, 100) : 0, cx = W / 2, cy = 820, R = 300;
    ctx.lineWidth = 46; ctx.strokeStyle = 'rgba(167,243,208,0.14)'; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = '#6EE7B7'; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0.005, pct / 100)); ctx.stroke();
    ctx.fillStyle = '#EEF8F2'; ctx.font = '300 200px ' + FONT; ctx.fillText(RS.fmt.pct(pct), cx, cy + 70);
    ctx.fillStyle = '#B6CEC3'; ctx.font = '600 44px ' + FONT; ctx.fillText(t('tl.story.today'), cx, cy + 150);
    var items = [];
    if (s && s.s > 0) items.push([nf(s.s), t('tl.story.streak')]);
    if (s) items.push([nf(s.q), t('tl.story.pages')]);
    if (ram && s) items.push([nf(s.d), t('tl.story.days')]);
    var colW = W / Math.max(1, items.length);
    items.forEach(function (it, i) {
      var x = colW * i + colW / 2;
      ctx.fillStyle = '#EEF8F2'; ctx.font = '300 110px ' + FONT; ctx.fillText(it[0], x, 1340);
      ctx.fillStyle = '#B6CEC3'; ctx.font = '600 38px ' + FONT;
      wrap(ctx, it[1], colW - 40).slice(0, 2).forEach(function (l, j) { ctx.fillText(l, x, 1410 + j * 48); });
    });
  }
  function hadithToday() {
    var s = RS.social && RS.social.summary ? RS.social.summary() : null, day = s && s.m === 'ramadan' ? s.d : ((RS.hijri().day - 1) % 30) + 1;
    var rec = ((RS.content && RS.content.hadith) || []).filter(function (x) { return x && x.n === day; })[0];
    return RS.has('hadith.' + day) ? { text: t('hadith.' + day), ref: rec && rec.ref ? rec.ref : '' } : null;
  }
  function drawHadith(ctx, rtl) {
    var hd = hadithToday();
    bg(ctx); brand(ctx, rtl);
    ctx.textAlign = 'center'; ctx.direction = rtl ? 'rtl' : 'ltr';
    ctx.fillStyle = '#6EE7B7'; ctx.font = '700 52px ' + FONT; ctx.fillText(t('tl.story.hadithTitle'), W / 2, 400);
    ctx.fillStyle = '#A7F3D0'; ctx.font = '300 240px Georgia, serif'; ctx.globalAlpha = 0.35; ctx.fillText('“', W / 2, 640); ctx.globalAlpha = 1;
    var size = 64, lines;
    do { ctx.font = '500 ' + size + 'px ' + FONT; lines = wrap(ctx, hd ? hd.text : '', W - 200); size -= 4; } while (lines.length * size * 1.45 > 760 && size > 36);
    var lh = (size + 4) * 1.45, y0 = 700 + Math.max(0, (760 - lines.length * lh) / 2);
    ctx.fillStyle = '#EEF8F2';
    lines.forEach(function (l, i) { ctx.fillText(l, W / 2, y0 + i * lh); });
    if (hd && hd.ref) { ctx.fillStyle = '#B6CEC3'; ctx.font = '600 42px ' + FONT; ctx.direction = 'ltr'; ctx.fillText(hd.ref, W / 2, y0 + lines.length * lh + 70); }
  }
  var story = null;     // {blob, name, kind}
  function makeStory(kind) {
    var c = document.createElement('canvas'); c.width = W; c.height = H;
    var ctx = c.getContext('2d'), rtl = (RS.dir ? RS.dir() : 'ltr') === 'rtl';
    (kind === 'hadith' ? drawHadith : drawProgress)(ctx, rtl);
    return new Promise(function (res) { c.toBlob(function (b) { res({ blob: b, url: c.toDataURL('image/png'), kind: kind }); }, 'image/png'); });
  }
  function openStory(kind) {
    kind = kind === 'hadith' ? 'hadith' : 'progress';
    if (kind === 'hadith' && !hadithToday()) { RS.toast(t('err.generic'), { tone: 'error' }); return; }
    var ready = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
    ready.then(function () { return makeStory(kind); }).then(function (st) {
      story = st;
      var name = (kind === 'hadith' ? 'hadith-' : 'my-ramadan-') + RS.todayISO(new Date()) + '.png';
      story.name = name;
      var canShare = !!(navigator.canShare && st.blob && navigator.canShare({ files: [new File([st.blob], name, { type: 'image/png' })] }));
      RS.sheet.open({ title: t('tl.story.sheet'), cls: 'tl-story-sheet',
        body: '<img class="tl-story-img" src="' + st.url + '" alt="' + esc(t(kind === 'hadith' ? 'tl.story.altHadith' : 'tl.story.altProgress')) + '">' +
          '<p class="caption mt-2">' + esc(t('tl.story.hint')) + '</p>',
        actions: [{ text: t('tl.story.save'), act: 'tl.storySave', icon: 'download' }].concat(canShare ? [{ text: t('share.share'), act: 'tl.storyShare', icon: 'share-2', variant: 'primary' }] : []) });
    });
  }
  RS.act('tl.story', openStory);
  RS.act('tl.storySave', function () {
    if (!story || !story.blob) return;
    var url = URL.createObjectURL(story.blob), a = document.createElement('a');
    a.href = url; a.download = story.name; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1500);
  });
  RS.act('tl.storyShare', function () {
    if (!story || !story.blob || !navigator.share) return;
    var f = new File([story.blob], story.name, { type: 'image/png' });
    navigator.share({ files: [f], text: t('share.suffix') + ' · ramadanstrivers.com' }).then(function () { RS.sheet.close(); }, function () { /* cancelled */ });
  });
  // The share sheet: a link or text (the existing share), or a story image.
  RS.act('tl.share', function () {
    if (RS.org && !RS.org.flag('storyImages')) { RS.runAct('share.progress'); return; }   // images switched off: the plain share
    var ram = RS.appMode() === 'ramadan';
    RS.sheet.open({ title: t('share.sheetTitle'), body: ui.list([
      ui.row({ icon: 'share-2', title: t('tl.share.link'), sub: t('tl.share.linkSub'), act: 'tl.shareLink', chevron: true }),
      ui.row({ icon: 'star', title: t('tl.share.story'), sub: t('tl.share.storySub'), act: 'tl.story', arg: 'progress', chevron: true })
    ].concat(hadithToday() && ram ? [ui.row({ icon: 'scroll-text', title: t('tl.share.hadith'), sub: t('tl.share.hadithSub'), act: 'tl.story', arg: 'hadith', chevron: true })] : [])) });
  });
  RS.act('tl.shareLink', function () { RS.sheet.close(); setTimeout(function () { RS.runAct('share.progress'); }, 60); });

  /* ------------------------------------------------------------------ first-launch setup questions */
  var GOALS = ['track', 'prep', 'learn', 'organise'];
  var setupState = { level: 'adult', goal: 'track' };
  function setupBody() {
    var langs = (RS.LANGS || []).map(function (l) { return { value: l.code, text: l.name, lang: l.code, dir: l.dir }; });
    var radios = function (name, items, cur) {
      return '<div class="tl-choices" role="radiogroup" aria-labelledby="tl-q-' + name + '">' + items.map(function (it) {
        var on = it.value === cur;
        return '<button type="button" class="tl-choice' + (on ? ' is-on' : '') + '" role="radio" aria-checked="' + on + '" data-act="tl.pick" data-arg="' + name + ':' + it.value + '">' +
          (it.icon ? RS.icon(it.icon, { size: 20 }) : '') + '<span><span class="tl-choice-t">' + esc(it.title) + '</span>' + (it.sub ? '<span class="tl-choice-s">' + esc(it.sub) + '</span>' : '') + '</span></button>';
      }).join('') + '</div>';
    };
    return '<p>' + esc(t('tl.setup.body')) + '</p>' +
      '<div class="mt-3">' + ui.select({ id: 'tl-setup-lang', label: t('tl.setup.lang'), value: RS.lang(), act: 'tl.setupLang', options: langs }) + '</div>' +
      '<h3 class="tl-q" id="tl-q-level">' + esc(t('tl.setup.qLevel')) + '</h3>' +
      radios('level', [{ value: 'adult', icon: 'user', title: t('tl.setup.adult'), sub: t('tl.setup.adultSub') },
        { value: 'new', icon: 'sprout', title: t('tl.setup.new'), sub: t('tl.setup.newSub') },
        { value: 'kids', icon: 'star', title: t('tl.setup.kids'), sub: t('tl.setup.kidsSub') }], setupState.level) +
      '<h3 class="tl-q" id="tl-q-goal">' + esc(t('tl.setup.qGoal')) + '</h3>' +
      radios('goal', GOALS.map(function (g) { return { value: g, icon: { track: 'circle-check', prep: 'sprout', learn: 'graduation-cap', organise: 'trophy' }[g], title: t('tl.setup.goal.' + g), sub: t('tl.setup.goal.' + g + 'Sub') }; }), setupState.goal) +
      '<h3 class="tl-q">' + esc(t('tl.setup.qPrayer')) + '</h3><p class="caption">' + esc(t('tl.setup.prayerSub')) + '</p>';
  }
  function openSetup() {
    RS.sheet.open({ title: t('tl.setup.title'), body: setupBody(), cls: 'tl-setup-sheet',
      actions: [{ text: t('tl.setup.skip'), act: 'tl.setupSkip' }, { text: t('tl.setup.go'), act: 'tl.setupGo', variant: 'primary', icon: 'arrow-right' }] });
  }
  function doneSetup() { try { localStorage.setItem('rs-setup', '1'); } catch (e) { /* private mode */ } firstRun = false; }
  RS.act('tl.pick', function (arg) {
    var p = String(arg || '').split(':');
    if (p[0] === 'level' && /^(adult|new|kids)$/.test(p[1])) setupState.level = p[1];
    else if (p[0] === 'goal' && GOALS.indexOf(p[1]) >= 0) setupState.goal = p[1];
    else return;
    RS.$$('.tl-choice[data-arg^="' + p[0] + ':"]').forEach(function (b) {
      var on = b.getAttribute('data-arg') === arg; b.classList.toggle('is-on', on); b.setAttribute('aria-checked', String(on));
    });
  });
  RS.act('tl.setupLang', function (v) { RS.setLang(v).then(function () { openSetup(); }); });
  RS.act('tl.setupSkip', function () { doneSetup(); RS.sheet.close(); });
  RS.act('tl.setupGo', function () {
    doneSetup();
    RS.settings.level = setupState.level;
    RS.saveSettings();
    document.body.classList.toggle('lvl-kids', setupState.level === 'kids');
    RS.emit('data', { source: 'tools' });
    RS.sheet.close();
    var dest = { track: 'today', prep: 'prep', learn: 'learn', organise: 'compete' }[setupState.goal] || 'today';
    if (dest === 'prep' && !RS.router.has('prep')) dest = 'today';
    RS.router.go(dest);
    // Prayer times next (the sheet opens on top of the chosen screen)
    setTimeout(function () { var p = P(); if (p && !p.configured() && typeof p.setup === 'function') p.setup(); }, 350);
  });
  RS.act('tl.setup', openSetup);
  RS.on('boot', function () {
    if (!firstRun) return;
    setTimeout(function () {
      var params = RS.bootParams || {};
      if (params.join || params.magic || params.buddy) { doneSetup(); return; }     // arriving to do something specific
      if (firstRun && !/^display/.test((RS.router.current() || {}).route || '')) openSetup();
    }, 600);
  });

  RS.tools = { ramadanStart: ramadanStart, daysToRamadan: daysToRamadan, eidDate: eidDate, countdownHtml: countdownHtml, dateNoteHtml: dateNoteHtml,
    disclaimer: disclaimer, prepTabOn: prepTabOn, qibla: qiblaOf, firstRun: function () { return firstRun; } };
})();
