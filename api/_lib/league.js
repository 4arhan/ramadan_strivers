// League tables: organisations ranked against each other by the average points of their active participants.
const { q, one } = require('./db'); const C = require('./comp');
const DIVISIONS = ['Primary school', 'Secondary school', 'University', 'Mosque', 'Community', 'Family'];
const MIN_ACTIVE = 5;      // fewer active participants than this: listed, but not ranked
function slugify(s){ return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40); }
function defaultDivision(type){ return type === 'School' ? 'Secondary school' : type === 'University' ? 'University' : type === 'Mosque' ? 'Mosque' : type === 'Family' ? 'Family' : 'Community'; }
async function table(league){
  const rows = (await q('SELECT m.division,c.code,c.name,c.type,c.settings FROM league_members m JOIN competitions c ON c.code=m.comp_code WHERE m.league_id=$1 AND m.status=\'approved\'', [league.id])).rows
    .filter(r => !(r.settings || {}).suspended);
  const out = [];
  for(const r of rows){ const st = await C.standing(r.code); const ch = (r.settings || {}).charity;
    out.push({ code: r.code, name: r.name, type: r.type, division: r.division || defaultDivision(r.type), verified: !!(r.settings || {}).verified, participants: st.participants, active: st.active, avgPts: st.avgPts, totalPts: st.totalPts, quranPages: st.quranPages, avgPages: st.avgPages,
      charity: ch && ch.target ? { raised: ch.raised, target: ch.target, currency: ch.currency, pct: Math.round(ch.raised / ch.target * 100) } : null }); }
  const divisions = {};
  out.forEach(o => { (divisions[o.division] = divisions[o.division] || []).push(o); });
  Object.keys(divisions).forEach(d => { const ranked = divisions[d].filter(o => o.active >= MIN_ACTIVE).sort((a, b) => b.avgPts - a.avgPts || b.avgPages - a.avgPages), rest = divisions[d].filter(o => o.active < MIN_ACTIVE).sort((a, b) => b.avgPts - a.avgPts);
    divisions[d] = ranked.map((o, i) => Object.assign({ rank: i + 1 }, o)).concat(rest.map(o => Object.assign({ rank: null }, o))); });
  const order = DIVISIONS.filter(d => divisions[d]).concat(Object.keys(divisions).filter(d => !DIVISIONS.includes(d)).sort());
  const charity = out.filter(o => o.charity).sort((a, b) => b.charity.pct - a.charity.pct).map((o, i) => ({ rank: i + 1, code: o.code, name: o.name, raised: o.charity.raised, target: o.charity.target, currency: o.charity.currency, pct: o.charity.pct }));
  return { league: { slug: league.slug, name: league.name, country: league.country, about: league.about, open: league.open }, minActive: MIN_ACTIVE, organisations: out.length,
    participants: out.reduce((a, o) => a + o.participants, 0), divisions: order.map(d => ({ name: d, rows: divisions[d] })), charity };
}
async function bySlug(slug){ return one('SELECT * FROM leagues WHERE slug=$1', [slugify(slug)]); }
module.exports = { DIVISIONS, MIN_ACTIVE, slugify, defaultDivision, table, bySlug };
