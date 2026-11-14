// Attendance check-in (Tarawih, Jumu'ah, a class): an admin shows the day's QR code at the door; a participant who
// scans it with the app is marked present for that date. The code changes every day and cannot be reused later.
const crypto = require('crypto'); const { handler, send, html, body, query, esc, err, origin } = require('../../../_lib/util'); const { one } = require('../../../_lib/db'); const C = require('../../../_lib/comp'); const QR = require('qrcode'); const { page } = require('../../../_lib/page');
const day = () => new Date().toISOString().slice(0, 10);
function key(code, date){ const s = process.env.AUTH_SECRET || process.env.DATABASE_URL || process.env.POSTGRES_URL || 'rs'; return crypto.createHmac('sha256', 'rs-checkin:' + s).update(code + '|' + date).digest('base64url').slice(0, 10); }
module.exports = handler(async (req, res) => {
  const qs = query(req);
  if(req.method === 'GET'){ const { c } = await C.access(req, qs.code, 'teacher'); const d = day();
    // yesterday's code still works until this page is opened on the new day, so an evening event across midnight (UTC) is fine
    const link = origin(req) + '/?checkin=' + c.code + '.' + key(c.code, d); const svg = await QR.toString(link, { type: 'svg', margin: 1, width: 360, color: { dark: '#0B2219', light: '#ffffff' } });
    return html(res, 200, page({ title: 'Check-in · ' + esc(c.name), noindex: true, refresh: 3600, css: '.qr{background:#fff;border-radius:24px;padding:18px;display:inline-block;margin-top:16px}.c{text-align:center}',
      body: `<div class="hero c"><div class="kick">Check in</div><h1>${esc(c.name)}</h1><p class="sub">Open Ramadan Strivers, then scan this code with your phone's camera.</p><div class="qr" data-link="${esc(link)}">${svg}</div><p class="sub">Valid today, ${esc(d)}. A new code appears each day.</p></div><div class="c noprint"><button onclick="print()" class="btn" style="border:0;cursor:pointer">Print</button></div>` })); }
  const c = await C.getComp(qs.code); const b = await body(req); const k = String(b.k || ''), d = day(), y = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const date = k === key(c.code, d) ? d : (k === key(c.code, y) ? y : null); if(!date) throw err(400, 'This check-in code has expired. Scan today\'s code.', 'expired');
  const p = await one('SELECT id,attendance FROM participants WHERE comp_code=$1 AND token=$2', [c.code, String(b.token || '')]); if(!p) throw err(404, 'Join the competition first', 'not_found');
  const att = Object.assign({}, p.attendance || {}); const already = !!att[date]; att[date] = 1;
  await one('UPDATE participants SET attendance=$2 WHERE id=$1 RETURNING id', [p.id, JSON.stringify(att)]);
  send(res, 200, { ok: true, date, already, count: Object.keys(att).length });
}, ['GET', 'POST']);
