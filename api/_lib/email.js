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
function layout(title, bodyHtml){
  return `<!doctype html><html><body style="margin:0;background:#f5f2ec;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#1c1917"><div style="max-width:560px;margin:0 auto;padding:24px"><div style="background:#070b14;color:#fff;padding:18px 22px;border-radius:16px 16px 0 0"><div style="font-size:20px;font-weight:700;letter-spacing:1px">🌙 RAMADAN STRIVERS</div><div style="font-size:12px;color:#fbbf24;font-style:italic">From Muslim to Mu'min</div></div><div style="background:#fff;padding:22px;border-radius:0 0 16px 16px;line-height:1.6"><h2 style="margin:0 0 12px;color:#15803d">${title}</h2>${bodyHtml}</div><p style="text-align:center;color:#a8a29e;font-size:12px;margin-top:14px">May Allah accept our fasting and deeds.</p></div></body></html>`;
}
module.exports = { configured, sendEmail, layout };
