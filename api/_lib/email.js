// Transactional email via Resend (https://resend.com). Optional: without RESEND_API_KEY, emails are skipped.
function configured(){ return !!process.env.RESEND_API_KEY; }
async function sendEmail({ to, subject, html, text }){
  if(!configured()) return { skipped: true, reason: 'RESEND_API_KEY not set' };
  const from = process.env.EMAIL_FROM || 'Ramadan Strivers <onboarding@resend.dev>';
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { 'Authorization': 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: Array.isArray(to) ? to : [to], subject, html, text })
  });
  if(!r.ok){ const t = await r.text(); throw new Error('Email send failed: ' + r.status + ' ' + t.slice(0, 200)); }
  return r.json();
}
// Pine palette (DESIGN.md). Email clients ignore most CSS, so everything is inline; Manrope loads where supported.
const FONT = "Manrope,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
// Older callers style their call-to-action link inline (bright green, square-ish): give it the pine pill instead.
function pine(bodyHtml){
  return String(bodyHtml)
    .replace(/background:#15803d;color:#fff;padding:12px 24px;border-radius:12px/g, 'background:#0B2219;color:#ffffff;padding:13px 28px;border-radius:999px;display:inline-block')
    .replace(/color:#78716c/g, 'color:#5F6C66').replace(/color:#a8a29e/g, 'color:#5F6C66');
}
function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
// title: plain text (escaped here) · bodyHtml: HTML built by the caller (escape user text there)
function layout(title, bodyHtml){
  title = esc(title);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light">` +
    `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;700&display=swap"><title>${title}</title></head>` +
    `<body style="margin:0;padding:0;background:#F2F5F3;font-family:${FONT};color:#101915">` +
    `<div style="max-width:560px;margin:0 auto;padding:24px 16px">` +
    `<div style="background:#0B2219;background-image:linear-gradient(200deg,#143A2D 0%,#0B2219 46%,#06130F 100%);border:1px solid #2F5A49;border-radius:22px 22px 0 0;padding:20px 24px">` +
    `<div style="font-size:13px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#EEF8F2">Ramadan Strivers</div>` +
    `<div style="margin-top:2px;font-size:13px;color:#A7F3D0">From Muslim to Mu'min</div></div>` +
    `<div style="background:#ffffff;border-radius:0 0 22px 22px;padding:24px;line-height:1.6;font-size:15px;color:#45524C">` +
    `<h2 style="margin:0 0 12px;font-size:20px;font-weight:700;letter-spacing:-0.2px;color:#101915">${title}</h2>${pine(bodyHtml)}</div>` +
    `<p style="text-align:center;color:#5F6C66;font-size:12px;margin-top:14px">May Allah accept our fasting and deeds.</p></div></body></html>`;
}
module.exports = { configured, sendEmail, layout };
