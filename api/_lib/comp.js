const { one, q } = require('./db'); const { err, rand } = require('./util'); const A = require('./auth');
const TYPES = ['School', 'University', 'Mosque', 'Community', 'Company', 'Family', 'Other'];
const HARD_MAX_DAY = 800; // theoretical max points in one day incl. last-10 bonus is ~720
async function getComp(code, evenSuspended){ const c = await one('SELECT * FROM competitions WHERE code=$1', [String(code || '').toUpperCase()]); if(!c) throw err(404, 'Competition not found. Check the code.', 'not_found');
  if(!evenSuspended && (c.settings || {}).suspended) throw err(403, 'This competition has been suspended.', 'suspended'); return c; }
// Who may manage a competition. owner: the account that created it. admin: everything except deleting it and managing
// admins. teacher: the roster and enrolment of one class or team (grp). viewer: reports only. A super admin (the
// SUPER_ADMIN_EMAILS environment variable, comma separated) counts as owner of every competition.
const RANK = { viewer: 1, teacher: 2, admin: 3, owner: 4 };
function isSuper(u){ const list = String(process.env.SUPER_ADMIN_EMAILS || '').toLowerCase().split(/[\s,;]+/).filter(Boolean); return !!(u && u.email && list.includes(String(u.email).toLowerCase())); }
async function access(req, code, min){
  const u = await A.requireUser(req); const c = await getComp(code, true);
  let role = null, grp = '';
  if(c.owner_id === u.id || isSuper(u)) role = 'owner';
  else if(u.email){ const r = await one('SELECT role,grp FROM comp_admins WHERE comp_code=$1 AND lower(email)=lower($2)', [c.code, u.email]); if(r && RANK[r.role]){ role = r.role; grp = r.grp || ''; } }
  if(!role || RANK[role] < RANK[min || 'viewer']) throw err(403, 'You do not have permission to do this', 'forbidden');
  if((c.settings || {}).suspended && !isSuper(u)) throw err(403, 'This competition has been suspended. Contact Ramadan Strivers.', 'suspended');
  return { u, c, role, grp, super: isSuper(u) };
}
async function requireOwner(req, code){ return access(req, code, 'owner'); }
async function log(email, code, action, detail){ try { await q('INSERT INTO audit(email,comp_code,action,detail) VALUES($1,$2,$3,$4)', [email || null, code || null, String(action).slice(0, 60), JSON.stringify(detail || {})]); } catch(e){ /* the log never blocks an action */ } }
async function newCode(){ for(let i = 0; i < 20; i++){ const c = rand(6); if(!(await one('SELECT 1 FROM competitions WHERE code=$1', [c]))) return c; } throw err(500, 'Could not allocate code'); }
function publicComp(c){ const s = c.settings || {}; return { code: c.code, name: c.name, type: c.type, prizes: c.prizes || [], open: c.open, created_at: c.created_at,
  settings: { dailyCap: s.dailyCap || null, teams: s.teams !== false, donateUrl: s.donateUrl || '', sponsor: s.sponsor || '', message: s.message || '', messageAt: s.messageAt || null, endDay: s.endDay || 30,
    goal: s.goal || null, custom: Array.isArray(s.custom) ? s.custom : [], bonus: Array.isArray(s.bonus) ? s.bonus : [], charity: s.charity || null, country: s.country || '', verified: !!s.verified, under13: !!s.under13 } }; }
// Recompute totals from per-day data with the organiser's cap applied; flag anomalies for review.
function applyScore(days, settings){
  const cap = Math.min(HARD_MAX_DAY, (settings && settings.dailyCap) || HARD_MAX_DAY);
  let total = 0, logged = 0, pctSum = 0, pages = 0, last = 0, perfect = 0, over = false;
  const clean = {};
  Object.keys(days || {}).forEach(k => { const n = parseInt(k, 10); if(!(n >= 1 && n <= 30)) return; const d = days[k] || {};
    const p = Math.max(0, Math.min(100, parseInt(d.p, 10) || 0)), t = Math.max(0, parseInt(d.t, 10) || 0), qp = Math.max(0, Math.min(700, parseInt(d.q, 10) || 0));
    if(t > cap) over = true; const bonus = Array.isArray(settings && settings.bonus) && settings.bonus.includes(n); const tt = Math.min(t, cap) * (bonus ? 2 : 1); clean[n] = { p, t: tt, q: qp };
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
// Weekly rounds (days 1-7, 8-14, 15-21, 22-30) and awards from the per-day summaries: the week's top three, the most
// improved on the week before, the most consistent, and the most Quran pages. Hidden participants are left out.
const WEEKS = [[1, 7], [8, 14], [15, 21], [22, 30]];
function weekOf(day){ for(let i = 0; i < WEEKS.length; i++) if(day <= WEEKS[i][1]) return i + 1; return WEEKS.length; }
function weekSum(days, w){ const r = WEEKS[w - 1]; let t = 0, n = 0, pct = 0, pages = 0; if(!r) return { t, n, pct, pages };
  for(let d = r[0]; d <= r[1]; d++){ const x = (days || {})[d]; if(x && ((x.t || 0) > 0 || (x.p || 0) > 0 || (x.q || 0) > 0)){ t += x.t || 0; n++; pct += x.p || 0; pages += x.q || 0; } } return { t, n, pct: n ? Math.round(pct / n) : 0, pages }; }
async function awards(code, week){
  const rows = (await q('SELECT name,grp,last_day,days FROM participants WHERE comp_code=$1 AND hidden=false AND claimed=true LIMIT 5000', [code])).rows;
  const today = rows.reduce((m, r) => Math.max(m, r.last_day || 0), 0); const w = week >= 1 && week <= WEEKS.length ? week : weekOf(today || 1);
  const list = rows.map(r => { const cur = weekSum(r.days, w), prev = w > 1 ? weekSum(r.days, w - 1) : null; return { name: r.name, grp: r.grp, pts: cur.t, days: cur.n, pct: cur.pct, pages: cur.pages, gain: prev ? cur.t - prev.t : 0 }; }).filter(x => x.days > 0);
  const pub = x => x ? { name: x.name, grp: x.grp, pts: x.pts, days: x.days, pct: x.pct, pages: x.pages, gain: x.gain } : null;
  const top = list.slice().sort((a, b) => b.pts - a.pts).slice(0, 3).map(pub);
  const improved = w > 1 ? pub(list.filter(x => x.gain > 0).sort((a, b) => b.gain - a.gain)[0]) : null;
  const consistent = pub(list.slice().sort((a, b) => b.days - a.days || b.pct - a.pct)[0]);
  const quran = pub(list.filter(x => x.pages > 0).sort((a, b) => b.pages - a.pages)[0]);
  const g = {}; list.forEach(x => { if(!x.grp) return; const o = g[x.grp] = g[x.grp] || { grp: x.grp, members: 0, pts: 0 }; o.members++; o.pts += x.pts; });
  const team = Object.values(g).map(o => ({ grp: o.grp, members: o.members, avgPts: Math.round(o.pts / o.members) })).sort((a, b) => b.avgPts - a.avgPts)[0] || null;
  return { week: w, weeks: WEEKS.length, days: WEEKS[w - 1], today, active: list.length, top, improved, consistent, quran, team };
}
// One competition's line in a league table: the average points of the participants who have started (at least one
// day logged), so a small school can beat a large one. Fewer than `min` active participants: listed but not ranked.
async function standing(code, fromDay, toDay){
  const rows = (await q('SELECT total_pts,days_logged,quran_pages,days FROM participants WHERE comp_code=$1 AND hidden=false AND claimed=true', [code])).rows;
  let active = 0, pts = 0, pages = 0;
  rows.forEach(r => { if(fromDay){ let t = 0, n = 0, pg = 0; for(let d = fromDay; d <= toDay; d++){ const x = (r.days || {})[d]; if(x && ((x.t || 0) > 0 || (x.q || 0) > 0)){ t += x.t || 0; pg += x.q || 0; n++; } } if(n){ active++; pts += t; pages += pg; } }
    else if(r.days_logged > 0){ active++; pts += r.total_pts; pages += r.quran_pages; } });
  return { participants: rows.length, active, totalPts: pts, avgPts: active ? Math.round(pts / active) : 0, quranPages: pages, avgPages: active ? Math.round(pages / active * 10) / 10 : 0 };
}
module.exports = { TYPES, HARD_MAX_DAY, RANK, WEEKS, getComp, requireOwner, access, isSuper, log, newCode, publicComp, applyScore, board, awards, standing };
