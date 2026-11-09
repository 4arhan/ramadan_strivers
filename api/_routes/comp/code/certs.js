// Printable certificates (one page each) for every claimed participant, or ?p=ID for one. Organiser auth via header or ?auth=.
// Pine design (DESIGN.md): Manrope, pine frame with mint hairline, label-above-value metrics, no emoji, no gold.
const { handler, html, query, esc } = require('../../../_lib/util'); const { q } = require('../../../_lib/db'); const C = require('../../../_lib/comp');
// Line icons (Lucide, ISC licence)
const MOON = '<svg class="ic" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401"/></svg>';
const PRINTER = '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6"/><rect x="6" y="14" width="12" height="8" rx="1"/></svg>';
module.exports = handler(async (req, res) => {
  const qs = query(req); const { c } = await C.requireOwner(req, qs.code);
  let rows = (await q('SELECT id,name,grp,total_pts,days_logged,avg_pct,quran_pages FROM participants WHERE comp_code=$1 AND claimed AND hidden=false ORDER BY total_pts DESC', [c.code])).rows;
  rows = rows.map((r, i) => Object.assign({ rank: i + 1, total: rows.length }, r)); if(qs.p) rows = rows.filter(r => String(r.id) === String(qs.p));
  const year = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura-nu-latn', { year: 'numeric' }).format(new Date()).replace(/\D/g, '');
  const sponsor = (c.settings && c.settings.sponsor) ? ' · Sponsored by ' + esc(c.settings.sponsor) : '';
  const page = r => `<section class="c"><div class="b"><div class="in">
<div class="h">${MOON}<span>Ramadan Strivers</span></div>
<h1 class="t">Certificate of Achievement</h1>
<div class="n">${esc(r.name)}</div>${r.grp ? '<div class="g">' + esc(r.grp) + '</div>' : ''}
<p class="d">completed the Ramadan ${year} Strivers Challenge with <b>${esc(c.name)}</b>${r.rank <= 10 && (c.prizes || [])[r.rank - 1] ? ', finishing <b>#' + r.rank + '</b> and earning <b>' + esc(c.prizes[r.rank - 1]) + '</b>' : ', finishing <b>#' + r.rank + '</b> of ' + r.total}.</p>
<dl class="s"><div><dt>Points</dt><dd>${r.total_pts}</dd></div><div><dt>Days</dt><dd>${r.days_logged}</dd></div><div><dt>Average</dt><dd>${r.avg_pct}%</dd></div><div><dt>Quran pages</dt><dd>${r.quran_pages}</dd></div></dl>
<div class="f"><div>${esc(c.type)} · ${esc(c.name)}${sponsor}</div>
<p class="q">“Whoever fasts Ramadan out of faith and seeking reward, his previous sins will be forgiven.” <span>Bukhari 38</span></p>
<div class="sig"><span>Organiser</span><span>Date</span></div></div></div></div></section>`;
  html(res, 200, `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Certificates — ${esc(c.name)}</title>
<link rel="icon" type="image/svg+xml" href="/icons/icon.svg"><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@300;400;500;600;700&display=swap">
<style>
@page{size:A4 landscape;margin:10mm}
*{box-sizing:border-box}
html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{margin:0;background:#F2F5F3;color:#101915;font-family:Manrope,ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-variant-numeric:tabular-nums;-webkit-font-smoothing:antialiased}
.c{page-break-after:always;break-after:page;padding:16px}
.b{max-width:1000px;margin:0 auto;padding:12px;border-radius:22px;
  background:radial-gradient(circle at 88% 0%,rgba(52,211,153,.24),transparent 55%),linear-gradient(200deg,#143A2D 0%,#0B2219 46%,#06130F 100%)}
.in{min-height:548px;padding:36px 48px 30px;border-radius:14px;background:#fff;border:1px solid rgba(110,231,183,.55);text-align:center}
.h{display:inline-flex;align-items:center;gap:8px;font-size:13px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:#047857}
.t{margin:14px 0 24px;font-size:38px;font-weight:700;letter-spacing:-.02em;line-height:1.15;color:#101915}
.n{display:inline-block;padding:0 28px 10px;font-size:46px;font-weight:300;letter-spacing:-.02em;line-height:1.1;color:#0B2219;border-bottom:2px solid #6EE7B7}
.g{margin-top:8px;font-size:15px;font-weight:500;color:#5F6C66}
.d{max-width:760px;margin:22px auto 8px;font-size:17px;line-height:1.65;color:#45524C}
.d b{color:#101915;font-weight:650}
.s{display:flex;justify-content:center;margin:24px auto 18px;padding:0}
.s div{min-width:120px;padding:0 22px;border-left:1px solid rgba(16,25,21,.09);text-align:center}
.s div:first-child{border-left:0}
.s dt{font-size:12px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#5F6C66}
.s dd{margin:4px 0 0;font-size:30px;font-weight:300;letter-spacing:-.02em;color:#047857}
.f{margin-top:8px;font-size:13px;font-weight:500;color:#5F6C66}
.q{max-width:640px;margin:12px auto 26px;font-size:14px;font-style:italic;line-height:1.55;color:#45524C}
.q span{font-style:normal;font-weight:600;color:#047857;white-space:nowrap}
.sig{display:flex;justify-content:space-around;max-width:600px;margin:0 auto}
.sig span{display:inline-block;width:200px;padding-top:6px;border-top:1px solid rgba(16,25,21,.25)}
.np{display:flex;align-items:center;justify-content:center;gap:14px;padding:16px;font-size:15px;color:#45524C}
.np b{color:#101915}
.np button{display:inline-flex;align-items:center;gap:8px;min-height:44px;padding:8px 20px;border:0;border-radius:999px;background:linear-gradient(180deg,#16422F,#0B2219);color:#fff;font:inherit;font-weight:650;cursor:pointer}
.np button:focus-visible{outline:2px solid #047857;outline-offset:3px}
@media print{.np{display:none}body{background:#fff}.c{padding:0}}
</style></head><body><div class="np"><span><b>${rows.length}</b> certificate${rows.length === 1 ? '' : 's'}</span><button type="button" onclick="print()">${PRINTER}Print / Save as PDF</button></div>${rows.map(page).join('')}</body></html>`);
}, ['GET']);
