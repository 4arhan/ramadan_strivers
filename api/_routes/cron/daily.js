// Daily job (Vercel Cron): push reminders (Ramadan day/odd-night/pre-Ramadan/year-round) and Friday organiser digests.
const { handler, send, err, esc } = require('../../_lib/util'); const { q } = require('../../_lib/db'); const { hijri, MONTHS } = require('../../_lib/hijri'); const mail = require('../../_lib/email'); const { HADITHS } = require('../../_lib/content');
// The daily hadith is the same fact-checked text the app shows on Today for that day: api/_lib/content.js is generated
// from content/hadith.json by scripts/build-content.js ({t: text, s: ref, l: url}, ordered by day 1-30).
function hadithFor(day){ const o = HADITHS[(Math.max(1, day) - 1) % HADITHS.length]; return { t: o.t, s: o.s }; }
function clip(s, n){ s = String(s); return s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : s; }
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
        const cell = 'padding:8px 10px;border-top:1px solid #E3E9E6';
        const top = rows.slice(0, 10).map((r, i) => `<tr><td style="${cell};color:#047857;font-weight:700;width:28px">${i + 1}</td><td style="${cell};color:#101915">${esc(r.name)}${r.grp ? ' <span style="color:#5F6C66">(' + esc(r.grp) + ')</span>' : ''}</td><td style="${cell};text-align:right;color:#101915"><b>${r.total_pts}</b></td></tr>`).join('');
        await mail.sendEmail({ to: c.email, subject: `Weekly summary — ${c.name} (${rows.length} participants)`, html: mail.layout(`${c.name} — weekly summary`, `<p><b style="color:#101915">${rows.length}</b> participants · <b style="color:#101915">${inactive}</b> inactive for 3+ days · Hijri date: ${hj.day} ${MONTHS[hj.month - 1]} ${hj.year}</p><table style="border-collapse:collapse;width:100%;font-size:14px">${top}</table><p style="margin-top:18px"><a href="${esc(process.env.APP_URL || 'https://www.ramadanstrivers.com')}/" style="color:#047857;font-weight:600">Open the organiser dashboard</a></p>`) }); out.emails++; } }
  } else out.skipped.push('email (RESEND_API_KEY not set)');
  send(res, 200, Object.assign({ hijri: hj }, out));
}, ['GET', 'POST']);
// Push texts: plain words, no emoji. The cron runs in the afternoon (UTC), so "tonight" is the night that begins
// at this evening's sunset: the night before Ramadan day d + 1 (night 21 follows day 20).
// now (optional, for tests): the date whose weekday picks the Monday/Thursday fasting reminder.
function pushMessage(hj, now){
  if(hj.month === 9){ const d = hj.day; const night = d + 1; const odd = night >= 21 && night <= 29 && night % 2 === 1;
    if(odd) return { odd: true, title: 'Tonight could be Laylatul Qadr', body: 'Night ' + night + ' of Ramadan: pray, seek forgiveness and make dua with all your heart. Log your deeds in Ramadan Strivers.' };
    const h = hadithFor(d); return { title: 'Ramadan day ' + d, body: clip(h.t, 110) + (h.s ? ' (' + h.s + ')' : '') + ' Log today\'s deeds.' }; }
  if(hj.month === 8){ const left = 30 - hj.day; return { title: left > 1 ? left + ' days to Ramadan' : 'Ramadan is almost here', body: 'Set your goals, plan your qada fasts and prepare your dua list in Ramadan Strivers.' }; }
  if(hj.month === 10 && hj.day <= 28) return { title: 'Six days of Shawwal', body: 'Whoever fasts Ramadan and follows it with six days of Shawwal, it is as if they fasted forever (Muslim 1164). Track them in the app.' };
  if(hj.month === 12 && hj.day <= 10) return { title: 'The best days of the year', body: 'Day ' + hj.day + ' of Dhul Hijjah: there are no days in which righteous deeds are more beloved to Allah than these ten days (Tirmidhi 757).' };
  const dow = (now instanceof Date ? now : new Date()).getUTCDay(); if(dow === 0 || dow === 3) return { title: 'Fasting tomorrow?', body: (dow === 0 ? 'Monday' : 'Thursday') + ' is a Sunnah fasting day. Set your intention tonight.' };
  const h = hadithFor(((hj.day - 1) % 30) + 1); return { title: 'Ramadan Strivers', body: clip(h.t, 120) + (h.s ? ' (' + h.s + ')' : '') };
}
module.exports.pushMessage = pushMessage;
