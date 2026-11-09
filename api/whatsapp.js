// Twilio WhatsApp webhook. Commands: JOIN <code> <name> · PAGES <n> · STATUS · HADITH · HELP. Replies with TwiML.
const { handler, body, esc } = require('./_lib/util'); const { one, q } = require('./_lib/db'); const C = require('./_lib/comp'); const { HADITHS } = require('./_lib/content'); const { hijri } = require('./_lib/hijri');
module.exports = handler(async (req, res) => {
  const b = await body(req); const from = String(b.From || b.from || '').trim(); const text = String(b.Body || b.body || '').trim(); const parts = text.split(/\s+/); const cmd = (parts[0] || '').toUpperCase();
  let reply;
  try {
    if(cmd === 'JOIN' && parts[1]){ const c = await C.getComp(parts[1]); const name = parts.slice(2).join(' ').slice(0, 40) || 'WhatsApp user'; if(!c.open) reply = 'That competition is closed.'; else {
      const ex = await one('SELECT id FROM participants WHERE comp_code=$1 AND phone=$2', [c.code, from]);
      if(ex) reply = `You are already in ${c.name}. Send PAGES <number> to log Quran pages, or STATUS.`; else { const { token } = require('./_lib/util'); await q('INSERT INTO participants(comp_code,token,name,phone) VALUES($1,$2,$3,$4)', [c.code, token(18), name, from]); reply = `🌙 Welcome to ${c.name}, ${name}! Each day send:\nPAGES <n> — Quran pages read today\nSTATUS — your rank\nHADITH — today's hadith`; } } }
    else if(cmd === 'PAGES' && parts[1]){ const n = Math.max(0, Math.min(200, parseInt(parts[1], 10) || 0)); const p = await one('SELECT p.*, c.settings FROM participants p JOIN competitions c ON c.code=p.comp_code WHERE p.phone=$1 ORDER BY p.created_at DESC LIMIT 1', [from]);
      if(!p) reply = 'Send JOIN <code> <your name> first.'; else { const hj = hijri(); const day = hj.month === 9 ? hj.day : (p.last_day || 1); const days = p.days || {}; const d = days[day] || { p: 0, t: 0, q: 0 }; d.q = (d.q || 0) + n; d.t = (d.t || 0) + Math.round(n > 0 ? 10 : 0); d.p = Math.max(d.p || 0, n > 0 ? 10 : 0); days[day] = d;
        const s = C.applyScore(days, p.settings || {}); await q('UPDATE participants SET days=$2,total_pts=$3,days_logged=$4,avg_pct=$5,quran_pages=$6,last_day=$7,updated_at=now() WHERE id=$1', [p.id, JSON.stringify(s.days), s.total_pts, s.days_logged, s.avg_pct, s.quran_pages, s.last_day]); reply = `📖 Logged ${n} pages for Day ${day}. Total: ${s.quran_pages} pages, ${s.total_pts} points. Ma sha Allah, keep going!`; } }
    else if(cmd === 'STATUS'){ const p = await one('SELECT * FROM participants WHERE phone=$1 ORDER BY created_at DESC LIMIT 1', [from]); if(!p) reply = 'Send JOIN <code> <your name> first.'; else { const bd = await C.board(p.comp_code, p.token); reply = bd.me ? `🏆 You are #${bd.me.rank} of ${bd.participants} with ${bd.me.totalPts} points and ${bd.me.quranPages} Quran pages.` : 'No score yet — send PAGES <n> to start.'; } }
    else if(cmd === 'HADITH'){ const hj = hijri(); const h = HADITHS[((hj.month === 9 ? hj.day : new Date().getUTCDate()) - 1 + HADITHS.length) % HADITHS.length]; reply = `"${h.t}" — ${h.s}`; }
    else reply = '🌙 Ramadan Strivers\nJOIN <code> <name> — join a competition\nPAGES <n> — log Quran pages\nSTATUS — your rank\nHADITH — today\'s hadith\nFull app: ' + (process.env.APP_URL || 'https://www.ramadanstrivers.com');
  } catch(e){ reply = e.status && e.status < 500 ? e.message : 'Sorry, something went wrong. Try again later.'; }
  res.statusCode = 200; res.setHeader('Content-Type', 'text/xml'); res.end(`<?xml version="1.0" encoding="UTF-8"?><Response><Message>${esc(reply)}</Message></Response>`);
}, ['POST', 'GET']);
