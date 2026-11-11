// Organiser insights: activity per day, retention, completion spread, teams, momentum and who has gone quiet.
// Built from the per-day summaries participants already send; nothing new is collected.
const { handler, send, query } = require('../../../_lib/util'); const { q } = require('../../../_lib/db'); const C = require('../../../_lib/comp');
module.exports = handler(async (req, res) => {
  const { c } = await C.requireOwner(req, query(req).code);
  const rows = (await q('SELECT id,name,grp,total_pts,days_logged,avg_pct,quran_pages,last_day,days,claimed,hidden,flagged FROM participants WHERE comp_code=$1', [c.code])).rows;
  const joined = rows.filter(r => r.claimed), invited = rows.length - joined.length;
  const today = joined.reduce((m, r) => Math.max(m, r.last_day || 0), 0);
  const perDay = []; for(let d = 1; d <= 30; d++) perDay.push({ day: d, active: 0, pctSum: 0, pts: 0, pages: 0 });
  const recent = r => { let t = 0; for(let d = Math.max(1, today - 2); d <= today; d++){ const x = (r.days || {})[d]; if(x) t += x.t || 0; } return t; };
  joined.forEach(r => { const days = r.days || {}; Object.keys(days).forEach(k => { const n = parseInt(k, 10), x = days[k] || {}; if(!(n >= 1 && n <= 30)) return;
    if((x.p || 0) > 0 || (x.t || 0) > 0 || (x.q || 0) > 0){ const o = perDay[n - 1]; o.active++; o.pctSum += x.p || 0; o.pts += x.t || 0; o.pages += x.q || 0; } }); });
  const daily = perDay.map(o => ({ day: o.day, active: o.active, avgPct: o.active ? Math.round(o.pctSum / o.active) : 0, pts: o.pts, pages: o.pages }));
  const started = joined.filter(r => r.days_logged > 0);
  const activeNow = today ? joined.filter(r => r.last_day >= today - 2 && r.days_logged > 0).length : 0;
  const reach = n => joined.filter(r => r.days_logged >= n).length;
  const spread = [0, 0, 0, 0]; started.forEach(r => { spread[Math.min(3, Math.floor(r.avg_pct / 25))]++; });
  const g = {}; joined.forEach(r => { if(!r.grp) return; const x = g[r.grp] = g[r.grp] || { grp: r.grp, members: 0, active: 0, pts: 0, pct: 0, started: 0, pages: 0 };
    x.members++; x.pts += r.total_pts; x.pages += r.quran_pages; if(r.days_logged > 0){ x.started++; x.pct += r.avg_pct; } if(today && r.last_day >= today - 2 && r.days_logged > 0) x.active++; });
  const teams = Object.values(g).map(x => ({ grp: x.grp, members: x.members, active: x.active, avgPts: Math.round(x.pts / x.members), avgPct: x.started ? Math.round(x.pct / x.started) : 0, pages: x.pages }))
    .sort((a, b) => b.avgPts - a.avgPts).slice(0, 50);
  const momentum = today ? joined.map(r => ({ name: r.name, grp: r.grp, pts: recent(r) })).filter(x => x.pts > 0).sort((a, b) => b.pts - a.pts).slice(0, 5) : [];
  const quiet = today ? started.filter(r => r.last_day < today - 2).sort((a, b) => b.last_day - a.last_day).slice(0, 15).map(r => ({ name: r.name, grp: r.grp, lastDay: r.last_day, daysLogged: r.days_logged })) : [];
  const sum = k => joined.reduce((a, r) => a + (r[k] || 0), 0);
  send(res, 200, { today, totals: { joined: joined.length, invited, started: started.length, activeNow, neverStarted: joined.length - started.length,
      hidden: joined.filter(r => r.hidden).length, flagged: joined.filter(r => r.flagged).length, totalPts: sum('total_pts'), quranPages: sum('quran_pages'),
      avgDays: started.length ? Math.round(started.reduce((a, r) => a + r.days_logged, 0) / started.length * 10) / 10 : 0,
      avgPct: started.length ? Math.round(started.reduce((a, r) => a + r.avg_pct, 0) / started.length) : 0 },
    daily, retention: [1, 7, 15, 25].map(n => ({ days: n, count: reach(n) })), spread, teams, momentum, quiet });
}, ['GET']);
