// The public league table (/l/slug) for a big screen or a website: refreshes itself every two minutes.
const { handler, html, query, esc, err } = require('../../_lib/util'); const L = require('../../_lib/league'); const { page } = require('../../_lib/page');
const nf = n => Number(n || 0).toLocaleString('en-US');
module.exports = handler(async (req, res) => {
  const l = await L.bySlug(query(req).slug); if(!l) throw err(404, 'League not found', 'not_found'); const t = await L.table(l);
  const div = d => `<div class="card"><h2>${esc(d.name)}</h2><table><thead><tr><th></th><th>Organisation</th><th class="n">Avg points</th><th class="n">Active</th><th class="n">Quran pages</th></tr></thead><tbody>` +
    d.rows.map(r => `<tr class="${r.rank && r.rank <= 3 ? 'top' : ''}"><td>${r.rank ? '<span class="rk">' + r.rank + '</span>' : ''}</td><td><a href="/o/${esc(r.code)}" style="color:inherit;text-decoration:none;font-weight:700">${esc(r.name)}</a>${r.verified ? ' <span class="badge">Verified</span>' : ''}${r.rank ? '' : ' <span class="muted">(needs ' + t.minActive + ' active to be ranked)</span>'}</td><td class="n"><b>${nf(r.avgPts)}</b></td><td class="n">${nf(r.active)}</td><td class="n">${nf(r.quranPages)}</td></tr>`).join('') + '</tbody></table></div>';
  const charity = t.charity.length ? `<div class="card"><h2>Charity raised</h2><table><tbody>${t.charity.map(r => `<tr><td><span class="rk">${r.rank}</span></td><td><b>${esc(r.name)}</b></td><td class="n">${esc(r.currency)} ${nf(r.raised)} <span class="muted">of ${nf(r.target)} (${r.pct}%)</span></td></tr>`).join('')}</tbody></table><p class="muted" style="margin:8px 0 0;font-size:13px">Amounts are reported by each organiser.</p></div>` : '';
  html(res, 200, page({ title: esc(l.name) + ' · Ramadan Strivers', refresh: 120,
    body: `<div class="hero"><div class="kick">League${l.country ? ' · ' + esc(l.country) : ''}</div><h1>${esc(l.name)}</h1><p class="sub">${nf(t.organisations)} organisations · ${nf(t.participants)} participants · ranked by average points per active participant</p>${l.about ? '<p class="sub">' + esc(l.about) + '</p>' : ''}</div>` +
      (t.divisions.map(div).join('') || '<div class="card muted">No organisations have been approved in this league yet.</div>') + charity }), 'public, max-age=60');
}, ['GET']);
