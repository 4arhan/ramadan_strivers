// Cloud-sync merge: last-write-wins per day (by ts), max per Quran-pages day, union of badges, max of best streaks.
function mergeSnapshots(a, b){
  a = a || {}; b = b || {};
  const out = { settings: Object.assign({}, a.settings || {}, b.settings || {}), days: {}, qPages: {}, badges: {}, best: {}, quiz: {}, extras: {} };
  const dayKeys = new Set([...Object.keys(a.days || {}), ...Object.keys(b.days || {})]);
  dayKeys.forEach(k => { const x = (a.days || {})[k], y = (b.days || {})[k]; if(!x) out.days[k] = y; else if(!y) out.days[k] = x; else out.days[k] = ((y.ts || 0) >= (x.ts || 0)) ? y : x; });
  const qk = new Set([...Object.keys(a.qPages || {}), ...Object.keys(b.qPages || {})]);
  qk.forEach(k => { out.qPages[k] = Math.max((a.qPages || {})[k] || 0, (b.qPages || {})[k] || 0); });
  Object.assign(out.badges, a.badges || {}, b.badges || {});
  const bk = new Set([...Object.keys(a.best || {}), ...Object.keys(b.best || {})]);
  bk.forEach(k => { out.best[k] = Math.max((a.best || {})[k] || 0, (b.best || {})[k] || 0); });
  const qa = a.quiz || {}, qb = b.quiz || {};
  out.quiz = { stats: { ans: Math.max((qa.stats || {}).ans || 0, (qb.stats || {}).ans || 0), cor: Math.max((qa.stats || {}).cor || 0, (qb.stats || {}).cor || 0) }, best: {} };
  const qbk = new Set([...Object.keys(qa.best || {}), ...Object.keys(qb.best || {})]); qbk.forEach(k => { out.quiz.best[k] = Math.max((qa.best || {})[k] || 0, (qb.best || {})[k] || 0); });
  // extras: journal, goals, dua list, qada, year-round logs — keyed objects, newer ts wins per key
  const ea = a.extras || {}, eb = b.extras || {}; const ek = new Set([...Object.keys(ea), ...Object.keys(eb)]);
  ek.forEach(k => { const x = ea[k], y = eb[k]; if(x && y && typeof x === 'object' && typeof y === 'object' && !Array.isArray(x)){ const m = Object.assign({}, x); Object.keys(y).forEach(kk => { const xv = x[kk], yv = y[kk]; if(xv && yv && typeof xv === 'object' && typeof yv === 'object' && ('ts' in xv || 'ts' in yv)) m[kk] = ((yv.ts || 0) >= (xv.ts || 0)) ? yv : xv; else m[kk] = yv; }); out.extras[k] = m; } else out.extras[k] = y !== undefined ? y : x; });
  return out;
}
module.exports = { mergeSnapshots };
