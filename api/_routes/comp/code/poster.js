// Printable A4 poster with QR code for the join link (public — the code is meant to be shared).
// Pine design (DESIGN.md): Manrope, pine hero block with mint accents, no emoji, no gold.
const { handler, html, query, esc, origin } = require('../../../_lib/util'); const C = require('../../../_lib/comp'); const QR = require('qrcode');
// Line icons (Lucide, ISC licence): moon, gift, printer.
const ICON = {
  moon: '<path d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401"/>',
  gift: '<path d="M12 7v14"/><path d="M20 11v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8"/><path d="M7.5 7a1 1 0 0 1 0-5A4.8 8 0 0 1 12 7a4.8 8 0 0 1 4.5-5 1 1 0 0 1 0 5"/><rect x="3" y="7" width="18" height="4" rx="1"/>',
  printer: '<path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6"/><rect x="6" y="14" width="12" height="8" rx="1"/>'
};
function icon(name, size){ return `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${ICON[name]}</svg>`; }
module.exports = handler(async (req, res) => {
  const c = await C.getComp(query(req).code); const link = origin(req) + '/?join=' + c.code;
  const svg = await QR.toString(link, { type: 'svg', margin: 1, color: { dark: '#0B2219', light: '#ffffff' } });
  const sponsor = (c.settings && c.settings.sponsor) ? ' · Sponsored by ' + esc(c.settings.sponsor) : '';
  const prizes = (c.prizes || []).map((p, i) => p ? '<li><b>#' + (i + 1) + '</b> ' + esc(p) + '</li>' : '').filter(Boolean);
  html(res, 200, `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Join ${esc(c.name)} — Ramadan Strivers</title>
<link rel="icon" type="image/svg+xml" href="/icons/icon.svg"><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@300;400;500;600;700;800&display=swap">
<style>
@page{size:A4;margin:12mm}
*{box-sizing:border-box}
html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{margin:0;background:#F2F5F3;color:#101915;font-family:Manrope,ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-variant-numeric:tabular-nums;-webkit-font-smoothing:antialiased}
.p{max-width:740px;margin:0 auto;padding:28px 24px 36px;text-align:center}
.top{position:relative;padding:30px 28px 28px;border-radius:28px;color:#EEF8F2;border:1px solid rgba(167,243,208,.28);
  background:radial-gradient(circle at 88% 0%,rgba(52,211,153,.24),transparent 55%),linear-gradient(200deg,#143A2D 0%,#0B2219 46%,#06130F 100%);
  box-shadow:inset 0 1px 0 rgba(236,253,245,.14),0 24px 48px -24px rgba(6,95,70,.55)}
.brand{display:inline-flex;align-items:center;gap:10px;font-size:15px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#B6CEC3}
.brand .ic{color:#6EE7B7}
.org{margin:18px 0 6px;font-size:40px;line-height:1.15;font-weight:700;letter-spacing:-.02em;color:#EEF8F2}
.sub{font-size:15px;font-weight:500;color:#B6CEC3}
.card{margin:22px auto 0;padding:26px 24px 24px;border-radius:22px;background:#fff}
.qr{width:min(270px,100%);margin:0 auto;padding:12px;border-radius:16px;border:1px solid rgba(16,25,21,.09)}
.qr svg{display:block;width:100%;height:auto}
.hint{margin-top:16px;font-size:15px;color:#45524C}
.hint b{color:#101915;font-weight:650}
.lbl{margin-top:18px;font-size:12px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#5F6C66}
.code{margin-top:4px;font-size:clamp(36px,13vw,64px);font-weight:300;letter-spacing:.18em;line-height:1.05;color:#0B2219;padding-left:.18em}
.steps{display:inline-block;margin:18px 0 0;padding:0;list-style:none;text-align:left;font-size:15px;line-height:1.5;color:#45524C;counter-reset:s}
.steps li{position:relative;padding:5px 0 5px 36px;counter-increment:s}
.steps li::before{content:counter(s);position:absolute;left:0;top:4px;width:26px;height:26px;border-radius:50%;background:rgba(4,120,87,.10);color:#047857;font-size:13px;font-weight:700;line-height:26px;text-align:center}
.steps b{color:#101915;font-weight:650}
.prizes{margin-top:20px;padding-top:16px;border-top:1px solid rgba(16,25,21,.09);font-size:14px;color:#45524C}
.prizes .ttl{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#5F6C66}
.prizes .ttl .ic{color:#047857}
.prizes ul{display:flex;flex-wrap:wrap;justify-content:center;gap:6px 18px;margin:8px 0 0;padding:0;list-style:none}
.prizes b{color:#047857;font-weight:700}
.foot{margin-top:22px;font-size:12.5px;font-weight:500;color:#5F6C66}
.np{margin-top:22px}
.np button{display:inline-flex;align-items:center;gap:8px;min-height:48px;padding:10px 24px;border:0;border-radius:999px;background:linear-gradient(180deg,#16422F,#0B2219);color:#fff;font:inherit;font-size:15px;font-weight:650;cursor:pointer}
.np button:focus-visible{outline:2px solid #047857;outline-offset:3px}
/* Phones: the QR code and the join code shrink with the screen; print keeps the A4 layout. */
@media screen and (max-width:480px){
.p{padding:16px 12px 28px}
.top{padding:22px 18px 20px;border-radius:24px}
.org{margin-top:14px;font-size:clamp(26px,8.5vw,40px)}
.card{padding:20px 14px 20px}
.hint{overflow-wrap:anywhere}
.steps{font-size:14.5px}
}
@media print{body{background:#fff}.np{display:none}.p{padding:0}.card{padding:18px 0 0}}
</style></head><body><main class="p">
<section class="top"><div class="brand">${icon('moon', 20)}<span>Ramadan Strivers</span></div>
<h1 class="org">${esc(c.name)}</h1><div class="sub">${esc(c.type)} Ramadan Competition${sponsor}</div></section>
<section class="card"><div class="qr">${svg}</div>
<p class="hint">Scan to join, or enter the code at <b>${esc(origin(req).replace(/^https?:\/\//, ''))}</b></p>
<p class="lbl">Join code</p><div class="code">${esc(c.code)}</div>
<ol class="steps"><li>Open the app and tap <b>Compete</b></li><li>Enter the code and your name</li><li>Tick your daily deeds: your points count on the live leaderboard</li></ol>
${prizes.length ? '<div class="prizes"><span class="ttl">' + icon('gift', 15) + 'Prizes</span><ul>' + prizes.join('') + '</ul></div>' : ''}
</section>
<p class="foot">Free · Private · Works offline · 10 languages · From Muslim to Mu'min</p>
<p class="np"><button type="button" onclick="print()">${icon('printer', 18)}Print poster</button></p></main></body></html>`, 'public, max-age=300');
}, ['GET']);
