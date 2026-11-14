// A small printable / shareable HTML page in the Pine style, for the public organisation page, the league table,
// consent slips and the check-in poster. All text passed in must already be escaped by the caller.
function page({ title, body, css, refresh, lang, noindex }){
  return `<!doctype html><html lang="${lang || 'en'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
    (noindex ? '<meta name="robots" content="noindex">' : '') + (refresh ? `<meta http-equiv="refresh" content="${parseInt(refresh, 10)}">` : '') +
    `<title>${title}</title><link rel="icon" type="image/svg+xml" href="/icons/icon.svg">` +
    `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@300;400;500;600;700;800&display=swap"><style>
*{box-sizing:border-box}html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{margin:0;background:#F2F5F3;color:#101915;font:15px/1.5 Manrope,ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,'Noto Sans Arabic','Noto Sans Bengali',Arial,sans-serif;font-variant-numeric:tabular-nums;-webkit-font-smoothing:antialiased}
.w{max-width:860px;margin:0 auto;padding:20px 16px 40px}
.hero{padding:26px 24px;border-radius:26px;color:#EEF8F2;border:1px solid rgba(167,243,208,.28);background:radial-gradient(circle at 88% 0%,rgba(52,211,153,.24),transparent 55%),linear-gradient(200deg,#143A2D 0%,#0B2219 46%,#06130F 100%)}
.kick{font-size:13px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#A7F3D0}
h1{margin:6px 0 4px;font-size:34px;line-height:1.15;font-weight:700;letter-spacing:-.02em;overflow-wrap:anywhere}
h2{font-size:18px;margin:0 0 8px}
.sub{color:#B6CEC3}.card{background:#fff;border:1px solid rgba(16,25,21,.09);border-radius:20px;padding:18px;margin-top:14px}
table{width:100%;border-collapse:collapse}th,td{padding:9px 8px;text-align:start;border-top:1px solid rgba(16,25,21,.09)}th{font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#5F6C66;border-top:0}
td.n,th.n{text-align:end}.rk{display:inline-grid;place-items:center;width:28px;height:28px;border-radius:50%;background:rgba(4,120,87,.10);color:#03684C;font-weight:700;font-size:13px}
tr.top .rk{background:#047857;color:#fff}.muted{color:#5F6C66}.badge{display:inline-block;padding:2px 9px;border-radius:999px;background:rgba(4,120,87,.10);color:#03684C;font-size:12px;font-weight:700}
.btn{display:inline-block;margin-top:12px;padding:12px 22px;border-radius:999px;background:linear-gradient(135deg,#C4F9E0,#6EE7B7);color:#05241A;font-weight:800;text-decoration:none}
.bar{height:12px;border-radius:99px;background:rgba(4,120,87,.12);overflow:hidden;margin-top:8px}.bar i{display:block;height:100%;border-radius:99px;background:#047857}
.foot{margin-top:18px;text-align:center;font-size:13px;color:#5F6C66}.foot a{color:#03684C;font-weight:700;text-decoration:none}
@media print{body{background:#fff}.noprint{display:none}}
${css || ''}</style></head><body><div class="w">${body}<p class="foot">Ramadan Strivers · <a href="/">ramadanstrivers.com</a></p></div></body></html>`;
}
module.exports = { page };
