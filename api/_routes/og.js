// Share-card image (1200x630 PNG) for /s/:id pages. Rendered with satori (layout -> SVG) and resvg (SVG -> PNG)
// inside the router function, so there is no edge bundle to exceed plan limits. Stateless: data in the query.
const { handler } = require('../_lib/util');
let fonts = null, satoriP = null;
function loadFonts(){
  if(fonts) return fonts;
  const F = require('../_lib/fonts');
  fonts = [300, 600, 700].map(w => ({ name: 'Manrope', weight: w, style: 'normal', data: F[w] }));
  return fonts;
}
function satori(){ if(!satoriP) satoriP = Promise.resolve(require('satori')).then(m => m.default || m); return satoriP; }
const n = (v, lo, hi, d) => { v = parseInt(v, 10); return isNaN(v) ? d : Math.max(lo, Math.min(hi, v)); };
const el = (type, style, children) => ({ type, props: { style, children } });
// Palette mirrors css tokens: pine hero object, mint accent, soft ink.
const C = { ink: '#EEF8F2', ink2: '#B6CEC3', mint: '#6EE7B7', edge: 'rgba(167,243,208,0.30)' };
function tree(d){
  const metric = (value, label) => el('div', { display: 'flex', flexDirection: 'column', paddingRight: 36, marginRight: 36, borderRight: '1px solid rgba(167,243,208,0.22)' }, [
    el('div', { fontSize: 18, fontWeight: 600, color: C.ink2, letterSpacing: 1.5, textTransform: 'uppercase' }, label),
    el('div', { fontSize: 46, fontWeight: 300, color: C.ink, marginTop: 2 }, String(value)) ]);
  const lastMetric = (value, label) => el('div', { display: 'flex', flexDirection: 'column' }, [
    el('div', { fontSize: 18, fontWeight: 600, color: C.ink2, letterSpacing: 1.5, textTransform: 'uppercase' }, label),
    el('div', { fontSize: 46, fontWeight: 300, color: C.ink, marginTop: 2 }, String(value)) ]);
  const pct = d.p, R = 120, CIRC = 2 * Math.PI * R;
  return el('div', { width: '100%', height: '100%', display: 'flex', padding: 64, fontFamily: 'Manrope', color: C.ink,
    backgroundColor: '#071510', backgroundImage: 'radial-gradient(circle at 88% 0%, rgba(52,211,153,0.28), rgba(52,211,153,0) 52%), linear-gradient(200deg, #143A2D 0%, #0B2219 46%, #06130F 100%)' }, [
    el('div', { display: 'flex', flexDirection: 'column', justifyContent: 'space-between', width: 740, height: 502 }, [
      el('div', { display: 'flex', alignItems: 'center', fontSize: 26, fontWeight: 600, letterSpacing: 3, color: C.ink2, textTransform: 'uppercase' }, d.n ? d.n + '  ·  Ramadan Strivers' : 'Ramadan Strivers'),
      el('div', { display: 'flex', flexDirection: 'column' }, [
        el('div', { fontSize: 30, fontWeight: 600, color: C.mint, letterSpacing: 1 }, 'Day ' + d.d + ' of Ramadan'),
        el('div', { display: 'flex', alignItems: 'flex-end' }, [
          el('div', { fontSize: 168, fontWeight: 300, lineHeight: 1, letterSpacing: -6 }, String(pct)),
          el('div', { fontSize: 56, fontWeight: 300, color: C.ink2, marginLeft: 8, marginBottom: 18 }, '%') ]),
        el('div', { fontSize: 28, fontWeight: 600, color: C.ink2 }, 'of today’s deeds complete') ]),
      el('div', { display: 'flex', paddingTop: 20, borderTop: '1px solid rgba(167,243,208,0.22)' }, [ metric(d.s, 'Day streak'), metric(d.q, 'Quran pages'), lastMetric(d.b, 'Badges') ]) ]),
    el('div', { display: 'flex', alignItems: 'center', justifyContent: 'center', width: 332, height: 502 }, [
      { type: 'svg', props: { width: 300, height: 300, viewBox: '0 0 300 300', children: [
        { type: 'circle', props: { cx: 150, cy: 150, r: R, fill: 'none', stroke: 'rgba(167,243,208,0.16)', strokeWidth: 16 } },
        { type: 'circle', props: { cx: 150, cy: 150, r: R, fill: 'none', stroke: C.mint, strokeWidth: 16, strokeLinecap: 'round', strokeDasharray: CIRC.toFixed(1), strokeDashoffset: (CIRC * (1 - pct / 100)).toFixed(1), transform: 'rotate(-90 150 150)' } } ] } } ]) ]);
}
module.exports = handler(async (req, res) => {
  const u = new URL(req.url, 'http://x'); const q = Object.assign({}, Object.fromEntries(u.searchParams), req.query || {});
  const d = { d: n(q.d, 1, 30, 1), p: n(q.p, 0, 100, 0), s: n(q.s, 0, 30, 0), q: n(q.q, 0, 604, 0), b: n(q.b, 0, 12, 0), n: String(q.n || '').replace(/[^\p{L}\p{N} .'-]/gu, '').slice(0, 24) };
  const svg = await (await satori())(tree(d), { width: 1200, height: 630, fonts: loadFonts() });
  const { Resvg } = require('@resvg/resvg-js');
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } }).render().asPng();
  res.statusCode = 200; res.setHeader('Content-Type', 'image/png'); res.setHeader('Cache-Control', 'public, max-age=86400, immutable'); res.end(png);
}, ['GET']);
