// Printable parent consent slips with each child's personal join code (admins and teachers). One slip per enrolled
// name: what the app stores, a signature line, and a QR code that joins as that child with nothing to type.
const { handler, html, query, esc, origin } = require('../../../_lib/util'); const { q } = require('../../../_lib/db'); const C = require('../../../_lib/comp'); const QR = require('qrcode'); const { page } = require('../../../_lib/page');
module.exports = handler(async (req, res) => {
  const qs = query(req); const { c, role, grp } = await C.access(req, qs.code, 'teacher');
  let rows = (await q('SELECT name,grp,token,claimed FROM participants WHERE comp_code=$1 ORDER BY grp,name LIMIT 1000', [c.code])).rows;
  if(role === 'teacher') rows = rows.filter(r => r.grp === grp); else if(qs.grp) rows = rows.filter(r => r.grp === qs.grp);
  if(qs.only === 'new') rows = rows.filter(r => !r.claimed);
  const base = origin(req); const slips = [];
  for(const r of rows){ const link = base + '/?join=' + c.code + '&t=' + r.token; const svg = await QR.toString(link, { type: 'svg', margin: 0, width: 120, color: { dark: '#0B2219', light: '#ffffff' } });
    slips.push(`<section class="slip"><div class="l"><div class="kick" style="color:#047857">${esc(c.name)}</div><h2>${esc(r.name)}${r.grp ? ' <span class="muted">· ' + esc(r.grp) + '</span>' : ''}</h2>
<p>Dear parent or guardian, our ${esc(String(c.type || '').toLowerCase() || 'group')} is taking part in a Ramadan challenge with the free Ramadan Strivers app. Your child ticks their good deeds each day and their points appear on our leaderboard.</p>
<p class="muted">The app stores only the display name above, the class or team, and daily totals (points, percentage, Quran pages). No email, phone number or photo is needed from your child. You can ask us to remove your child at any time.</p>
<p class="sign">I agree to my child taking part. Signature: <span></span> Date: <span class="d"></span></p></div>
<div class="r">${svg}<p class="muted">Scan to join as<br><b>${esc(r.name)}</b></p></div></section>`); }
  html(res, 200, page({ title: 'Consent slips · ' + esc(c.name), noindex: true, css: `.w{max-width:800px}.slip{display:flex;gap:18px;background:#fff;border:1.5px dashed #9DB3A8;border-radius:16px;padding:16px;margin-top:12px;page-break-inside:avoid}.slip .l{flex:1}.slip .r{flex:none;width:130px;text-align:center}.slip h2{font-size:20px;margin:2px 0 6px}.slip p{margin:6px 0;font-size:13px}.sign span{display:inline-block;min-width:150px;border-bottom:1.5px solid #101915}.sign span.d{min-width:80px}@page{size:A4;margin:10mm}`,
    body: `<div class="noprint card"><b>${rows.length}</b> slips. Print this page and cut along the dashed lines. <button onclick="print()" class="btn" style="border:0;cursor:pointer">Print</button></div>` + (slips.join('') || '<div class="card">No enrolled names yet. Add names under Enrol first.</div>') }));
}, ['GET']);
