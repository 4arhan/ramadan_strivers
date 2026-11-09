// Daily job (Vercel Cron): push reminders (Ramadan day/odd-night/pre-Ramadan/year-round) and Friday organiser digests.
const { handler, send, err } = require('../../_lib/util'); const { q } = require('../../_lib/db'); const { hijri, MONTHS } = require('../../_lib/hijri'); const mail = require('../../_lib/email'); const { HADITHS } = require('../../_lib/content');
module.exports = handler(async (req, res) => {
  if(process.env.CRON_SECRET && (req.headers.authorization || '') !== 'Bearer ' + process.env.CRON_SECRET) throw err(401, 'unauthorized');
  const out = { pushSent: 0, pushRemoved: 0, emails: 0, skipped: [] };
  const hj = hijri(new Date(), parseInt(process.env.HIJRI_OFFSET || '0', 10));
  // ---- Web push
  if(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY){
    const webpush = require('web-push'); webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:m.farhan.bava@gmail.com', process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
    const subs = (await q('SELECT id,sub,prefs,lang FROM push_subs')).rows;
    const msg = pushMessage(hj);
    for(const s of subs){ const p = s.prefs || {}; if(p.daily === false && !(msg.odd && p.oddNights !== false)) continue;
      try { await webpush.sendNotification(s.sub, JSON.stringify({ title: msg.title, body: msg.body, url: '/' })); out.pushSent++; await q('UPDATE push_subs SET last_sent=now() WHERE id=$1', [s.id]); }
      catch(e){ if(e.statusCode === 404 || e.statusCode === 410){ await q('DELETE FROM push_subs WHERE id=$1', [s.id]); out.pushRemoved++; } } }
  } else out.skipped.push('push (VAPID keys not set)');
  // ---- Friday organiser digest
  if(mail.configured()){
    if(new Date().getUTCDay() === 5){ const comps = (await q('SELECT c.code,c.name,u.email FROM competitions c JOIN users u ON u.id=c.owner_id WHERE c.open AND u.email IS NOT NULL')).rows;
      for(const c of comps){ const rows = (await q('SELECT name,grp,total_pts,days_logged,updated_at FROM participants WHERE comp_code=$1 AND claimed AND hidden=false ORDER BY total_pts DESC', [c.code])).rows; if(!rows.length) continue;
        const inactive = rows.filter(r => Date.now() - new Date(r.updated_at).getTime() > 3 * 86400000).length;
        const top = rows.slice(0, 10).map((r, i) => `<tr><td style="padding:4px 8px">${i + 1}</td><td style="padding:4px 8px">${r.name}${r.grp ? ' <span style="color:#a8a29e">(' + r.grp + ')</span>' : ''}</td><td style="padding:4px 8px;text-align:right"><b>${r.total_pts}</b></td></tr>`).join('');
        await mail.sendEmail({ to: c.email, subject: `Weekly summary — ${c.name} (${rows.length} participants)`, html: mail.layout(`${c.name} — weekly summary`, `<p><b>${rows.length}</b> participants · <b>${inactive}</b> inactive for 3+ days · Hijri date: ${hj.day} ${MONTHS[hj.month - 1]} ${hj.year}</p><table style="border-collapse:collapse;width:100%">${top}</table><p style="margin-top:14px"><a href="${(process.env.APP_URL || 'https://www.ramadanstrivers.com')}/">Open the organiser dashboard</a></p>`) }); out.emails++; } }
  } else out.skipped.push('email (RESEND_API_KEY not set)');
  send(res, 200, Object.assign({ hijri: hj }, out));
}, ['GET', 'POST']);
function pushMessage(hj){
  if(hj.month === 9){ const d = hj.day; const odd = d >= 21 && d % 2 === 1; const had = HADITHS[(d - 1) % HADITHS.length];
    if(odd) return { odd: true, title: '🌙 Tonight could be Laylatul Qadr', body: 'Night ' + d + ' — pray, seek forgiveness, make dua with all your heart. Log your deeds in Ramadan Strivers.' };
    return { title: '🌙 Ramadan Day ' + d, body: had.t.slice(0, 110) + (had.t.length > 110 ? '…' : '') + ' — log today\'s deeds.' }; }
  if(hj.month === 8) return { title: '🌙 ' + (30 - hj.day) + ' days to Ramadan', body: 'Set your goals, plan your qada fasts and prepare your dua list in Ramadan Strivers.' };
  if(hj.month === 10 && hj.day <= 28) return { title: '🌙 Six days of Shawwal', body: 'Fast six days of Shawwal and it is as if you fasted the whole year (Muslim 1164). Track them in the app.' };
  if(hj.month === 12 && hj.day <= 10) return { title: '🕋 Best days of the year', body: 'Day ' + hj.day + ' of Dhul Hijjah — no deeds are more beloved to Allah than in these ten days.' };
  const dow = new Date().getUTCDay(); if(dow === 0 || dow === 3) return { title: '🌙 Fasting tomorrow?', body: (dow === 0 ? 'Monday' : 'Thursday') + ' is a Sunnah fasting day. Set your intention tonight.' };
  return { title: '🌙 Ramadan Strivers', body: HADITHS[hj.day % HADITHS.length].t.slice(0, 120) };
}
