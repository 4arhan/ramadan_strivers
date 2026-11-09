// Organiser roster: everyone (incl. hidden/unclaimed), last activity, flags. PATCH to hide/unflag/rename, DELETE to remove.
const { handler, send, body, query, str, err } = require('../../../_lib/util');
const { q, one } = require('../../../_lib/db'); const C = require('../../../_lib/comp');
module.exports = handler(async (req, res) => {
  const qs = query(req); const { c } = await C.requireOwner(req, qs.code);
  if(req.method === 'GET'){ const rows = (await q('SELECT id,token,name,grp,total_pts,days_logged,avg_pct,quran_pages,last_day,flagged,hidden,claimed,phone,created_at,updated_at,days FROM participants WHERE comp_code=$1 ORDER BY total_pts DESC, name', [c.code])).rows;
    const now = Date.now(); return send(res, 200, { participants: rows.map(r => ({ id: r.id, token: r.token, name: r.name, grp: r.grp, totalPts: r.total_pts, daysLogged: r.days_logged, avgPct: r.avg_pct, quranPages: r.quran_pages, lastDay: r.last_day, flagged: r.flagged, hidden: r.hidden, claimed: r.claimed, phone: !!r.phone, inactiveDays: r.claimed ? Math.floor((now - new Date(r.updated_at).getTime()) / 86400000) : null, days: r.days })) }); }
  if(req.method === 'DELETE'){ const id = parseInt(qs.id, 10); if(!id) throw err(400, 'id required'); await q('DELETE FROM participants WHERE id=$1 AND comp_code=$2', [id, c.code]); return send(res, 200, { deleted: true }); }
  const b = await body(req); const id = parseInt(b.id, 10); if(!id) throw err(400, 'id required');
  const p = await one('SELECT * FROM participants WHERE id=$1 AND comp_code=$2', [id, c.code]); if(!p) throw err(404, 'Participant not found');
  const np = await one('UPDATE participants SET hidden=$3, flagged=$4, name=$5, grp=$6 WHERE id=$1 AND comp_code=$2 RETURNING id,name,grp,hidden,flagged', [id, c.code, typeof b.hidden === 'boolean' ? b.hidden : p.hidden, typeof b.flagged === 'boolean' ? b.flagged : p.flagged, b.name !== undefined ? (str(b.name, 40) || p.name) : p.name, b.grp !== undefined ? str(b.grp, 40) : p.grp]);
  send(res, 200, { participant: np });
}, ['GET', 'PATCH', 'DELETE']);
