// Participant pushes their per-day summary; the server recomputes totals with the organiser's cap and anomaly flags.
const { handler, send, body, query, err } = require('../../_lib/util');
const { one } = require('../../_lib/db'); const C = require('../../_lib/comp');
module.exports = handler(async (req, res) => {
  const c = await C.getComp(query(req).code); const b = await body(req);
  if(!b.token) throw err(400, 'token required'); if(!c.open) throw err(403, 'This competition has been closed by the organiser.', 'closed');
  const p = await one('SELECT id FROM participants WHERE comp_code=$1 AND token=$2', [c.code, String(b.token)]); if(!p) throw err(404, 'Participant not found — rejoin the competition', 'not_found');
  const s = C.applyScore(b.days || {}, c.settings || {});
  await one('UPDATE participants SET days=$2,total_pts=$3,days_logged=$4,avg_pct=$5,quran_pages=$6,last_day=$7,flagged=$8,claimed=true,updated_at=now() WHERE id=$1 RETURNING id', [p.id, JSON.stringify(s.days), s.total_pts, s.days_logged, s.avg_pct, s.quran_pages, s.last_day, s.flagged]);
  send(res, 200, { ok: true, totals: { totalPts: s.total_pts, daysLogged: s.days_logged, avgPct: s.avg_pct, quranPages: s.quran_pages }, flagged: s.flagged });
}, ['PUT', 'POST']);
