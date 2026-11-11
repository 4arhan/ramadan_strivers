const { one } = require('./db'); const { err, clampInt } = require('./util');
const KINDS = ['dua', 'keepGoing', 'proud', 'salam'];
const MODES = ['ramadan', 'prep', 'year'];
// Only a small summary is ever stored: no individual deeds, no journal, nothing from sisters' mode.
function cleanSummary(s){ s = s && typeof s === 'object' ? s : {};
  const out = { d: clampInt(s.d, 1, 30, 1), p: clampInt(s.p, 0, 100, 0), s: clampInt(s.s, 0, 400, 0), dl: clampInt(s.dl, 0, 30, 0),
    q: clampInt(s.q, 0, 21000, 0), m: MODES.indexOf(s.m) >= 0 ? s.m : 'ramadan' };
  if(/^\d{4}-\d{2}-\d{2}$/.test(String(s.last || ''))) out.last = String(s.last);
  return out; }
async function get(code){ const c = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
  const row = c ? await one('SELECT * FROM buddies WHERE code=$1', [c]) : null;
  if(!row) throw err(404, 'This buddy link is no longer active.', 'not_found'); return row; }
function pub(r){ return { code: r.code, name: r.name, summary: r.summary || {}, updatedAt: r.updated_at }; }
module.exports = { KINDS, cleanSummary, get, pub, err };
