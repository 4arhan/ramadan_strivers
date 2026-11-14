// Public page of a school, mosque or group (/o/CODE): its message, community goal, top ten, prizes and how to join.
const { handler, html, query, esc } = require('../_lib/util'); const { q } = require('../_lib/db'); const C = require('../_lib/comp'); const { page } = require('../_lib/page');
const nf = n => Number(n || 0).toLocaleString('en-US');
module.exports = handler(async (req, res) => {
  const c = await C.getComp(query(req).code); const s = c.settings || {}; const b = await C.board(c.code, null); const st = await C.standing(c.code);
  const leagues = (await q('SELECT l.slug,l.name,m.division FROM league_members m JOIN leagues l ON l.id=m.league_id WHERE m.comp_code=$1 AND m.status=\'approved\'', [c.code])).rows;
  let goal = '';
  if(s.goal && s.goal.n){ const done = s.goal.k === 'q' ? st.quranPages : s.goal.k === 'dl' ? b.individuals.reduce((a, r) => a + r.daysLogged, 0) : st.totalPts; const pct = Math.max(0, Math.min(100, Math.round(done / s.goal.n * 100)));
    goal = `<div class="card"><h2>Our goal together</h2><p><b>${nf(done)}</b> of ${nf(s.goal.n)} ${s.goal.k === 'q' ? 'pages of Quran' : s.goal.k === 'dl' ? 'days logged' : 'points'}</p><div class="bar"><i style="width:${pct}%"></i></div></div>`; }
  const charity = s.charity && s.charity.target ? `<div class="card"><h2>Charity${s.charity.cause ? ': ' + esc(s.charity.cause) : ''}</h2><p><b>${esc(s.charity.currency)} ${nf(s.charity.raised)}</b> raised of ${esc(s.charity.currency)} ${nf(s.charity.target)} <span class="muted">(reported by the organiser)</span></p><div class="bar"><i style="width:${Math.min(100, Math.round(s.charity.raised / s.charity.target * 100))}%"></i></div>${s.donateUrl && /^https:\/\//.test(s.donateUrl) ? `<a class="btn" href="${esc(s.donateUrl)}" rel="noopener nofollow">Give</a>` : ''}</div>` : '';
  const rows = b.individuals.slice(0, 10).map(r => `<tr class="${r.rank <= 3 ? 'top' : ''}"><td><span class="rk">${r.rank}</span></td><td>${esc(r.name)}${r.grp ? ' <span class="muted">· ' + esc(r.grp) + '</span>' : ''}</td><td class="n"><b>${nf(r.totalPts)}</b></td></tr>`).join('');
  const prizes = (c.prizes || []).filter(Boolean).map((p, i) => `<li><b>#${i + 1}</b> ${esc(p)}</li>`).join('');
  html(res, 200, page({ title: esc(c.name) + ' · Ramadan Strivers', refresh: 300,
    body: `<div class="hero"><div class="kick">${esc(c.type)}${s.verified ? ' · Verified' : ''}</div><h1>${esc(c.name)}</h1><p class="sub">${nf(b.participants)} taking part · ${nf(st.totalPts)} points · ${nf(st.quranPages)} pages of Quran</p>` +
      (c.open ? `<a class="btn" href="/?join=${esc(c.code)}">Join with code ${esc(c.code)}</a>` : '<p class="sub">This competition is closed. The leaderboard is final.</p>') + '</div>' +
      (s.message ? `<div class="card"><h2>From the organiser</h2><p>${esc(s.message)}</p></div>` : '') + goal + charity +
      `<div class="card"><h2>Leaderboard</h2>${rows ? '<table><tbody>' + rows + '</tbody></table>' : '<p class="muted">No one has joined yet.</p>'}</div>` +
      (prizes ? `<div class="card"><h2>Prizes</h2><ul style="margin:0;padding-inline-start:18px">${prizes}</ul></div>` : '') +
      (leagues.length ? `<div class="card"><h2>Leagues</h2>${leagues.map(l => `<p><a href="/l/${esc(l.slug)}" style="color:#03684C;font-weight:700">${esc(l.name)}</a>${l.division ? ' <span class="badge">' + esc(l.division) + '</span>' : ''}</p>`).join('')}</div>` : '') }), 'public, max-age=120');
}, ['GET']);
