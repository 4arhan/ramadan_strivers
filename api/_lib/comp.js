const { one, q } = require('./db'); const { err, rand } = require('./util'); const A = require('./auth');
const TYPES = ['School', 'University', 'Mosque', 'Community', 'Company', 'Family', 'Other'];
const HARD_MAX_DAY = 800; // theoretical max points in one day incl. last-10 bonus is ~720
async function getComp(code){ const c = await one('SELECT * FROM competitions WHERE code=$1', [String(code || '').toUpperCase()]); if(!c) throw err(404, 'Competition not found. Check the code.', 'not_found'); return c; }
async function requireOwner(req, code){ const u = await A.requireUser(req); const c = await getComp(code); if(c.owner_id !== u.id) throw err(403, 'Only the organiser can do this', 'forbidden'); return { u, c }; }
async function newCode(){ for(let i = 0; i < 20; i++){ const c = rand(6); if(!(await one('SELECT 1 FROM competitions WHERE code=$1', [c]))) return c; } throw err(500, 'Could not allocate code'); }
function publicComp(c){ const s = c.settings || {}; return { code: c.code, name: c.name, type: c.type, prizes: c.prizes || [], open: c.open, created_at: c.created_at,
  settings: { dailyCap: s.dailyCap || null, teams: s.teams !== false, donateUrl: s.donateUrl || '', sponsor: s.sponsor || '', message: s.message || '', endDay: s.endDay || 30 } }; }
// Recompute totals from per-day data with the organiser's cap applied; flag anomalies for review.
function applyScore(days, settings){
  const cap = Math.min(HARD_MAX_DAY, (settings && settings.dailyCap) || HARD_MAX_DAY);
  let total = 0, logged = 0, pctSum = 0, pages = 0, last = 0, perfect = 0, over = false;
  const clean = {};
  Object.keys(days || {}).forEach(k => { const n = parseInt(k, 10); if(!(n >= 1 && n <= 30)) return; const d = days[k] || {};
    const p = Math.max(0, Math.min(100, parseInt(d.p, 10) || 0)), t = Math.max(0, parseInt(d.t, 10) || 0), qp = Math.max(0, Math.min(700, parseInt(d.q, 10) || 0));
    if(t > cap) over = true; const tt = Math.min(t, cap); clean[n] = { p, t: tt, q: qp };
    if(p > 0 || t > 0 || qp > 0){ logged++; pctSum += p; total += tt; pages += qp; if(n > last) last = n; if(p === 100) perfect++; } });
  const flagged = over || (perfect >= 10 && perfect === logged) || pages > 650;
  return { days: clean, total_pts: total, days_logged: logged, avg_pct: logged ? Math.round(pctSum / logged) : 0, quran_pages: pages, last_day: last, flagged };
}
function rowPublic(r, i){ return { rank: i + 1, id: r.id, name: r.name, grp: r.grp, totalPts: r.total_pts, daysLogged: r.days_logged, avgPct: r.avg_pct, quranPages: r.quran_pages, flagged: r.flagged }; }
async function board(code, meToken){
  const rows = (await q('SELECT id,token,name,grp,total_pts,days_logged,avg_pct,quran_pages,flagged FROM participants WHERE comp_code=$1 AND hidden=false AND claimed=true ORDER BY total_pts DESC, quran_pages DESC, name ASC LIMIT 1000', [code])).rows;
  const individuals = rows.map((r, i) => rowPublic(r, i));
  const g = {}; rows.forEach(r => { if(!r.grp) return; const k = r.grp; g[k] = g[k] || { grp: k, members: 0, totalPts: 0, quranPages: 0, pctSum: 0 }; g[k].members++; g[k].totalPts += r.total_pts; g[k].quranPages += r.quran_pages; g[k].pctSum += r.avg_pct; });
  const groups = Object.values(g).map(x => ({ grp: x.grp, members: x.members, totalPts: x.totalPts, avgPts: Math.round(x.totalPts / x.members), quranPages: x.quranPages, avgPct: Math.round(x.pctSum / x.members) })).sort((a, b) => b.avgPts - a.avgPts).map((x, i) => Object.assign({ rank: i + 1 }, x));
  let me = null; if(meToken){ const idx = rows.findIndex(r => r.token === meToken); if(idx >= 0) me = rowPublic(rows[idx], idx); }
  return { individuals, groups, me, participants: rows.length };
}
module.exports = { TYPES, HARD_MAX_DAY, getComp, requireOwner, newCode, publicComp, applyScore, board };
