// Dynamic Open Graph share image (1200x630). Edge runtime; stateless (data in query string).
import { ImageResponse } from '@vercel/og';
export const config = { runtime: 'edge' };
const n = (v, lo, hi, d) => { v = parseInt(v, 10); return isNaN(v) ? d : Math.max(lo, Math.min(hi, v)); };
const h = (type, style, children) => ({ type, props: { style, children } });
export default function handler(req){
  const u = new URL(req.url); const d = n(u.searchParams.get('d'), 1, 30, 1), p = n(u.searchParams.get('p'), 0, 100, 0), s = n(u.searchParams.get('s'), 0, 30, 0), q = n(u.searchParams.get('q'), 0, 604, 0), b = n(u.searchParams.get('b'), 0, 12, 0);
  const name = (u.searchParams.get('n') || '').slice(0, 24);
  const stat = (v, l) => h('div', { display: 'flex', flexDirection: 'column', alignItems: 'center', background: 'rgba(255,255,255,0.08)', borderRadius: 24, padding: '22px 34px', minWidth: 210 }, [h('div', { fontSize: 64, fontWeight: 800, color: '#fde68a' }, v), h('div', { fontSize: 22, color: 'rgba(255,255,255,0.7)', letterSpacing: 2, textTransform: 'uppercase' }, l)]);
  const tree = h('div', { width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 56, background: 'linear-gradient(135deg,#0c1a12 0%,#122a1c 45%,#0f3d2a 100%)', color: '#fff', fontFamily: 'sans-serif' }, [
    h('div', { display: 'flex', justifyContent: 'space-between', alignItems: 'center' }, [h('div', { fontSize: 36, fontWeight: 700, letterSpacing: 4 }, '🌙 RAMADAN STRIVERS'), h('div', { fontSize: 26, color: '#fbbf24', fontStyle: 'italic' }, "From Muslim to Mu'min")]),
    h('div', { display: 'flex', flexDirection: 'column' }, [name ? h('div', { fontSize: 34, color: 'rgba(255,255,255,0.75)' }, name) : h('div', {}, ''), h('div', { fontSize: 92, fontWeight: 800, lineHeight: 1 }, 'Day ' + d + ' of Ramadan')]),
    h('div', { display: 'flex', gap: 22 }, [stat(p + '%', 'completed'), stat('🔥 ' + s, 'day streak'), stat(q, 'Quran pages'), stat('🏅 ' + b, 'badges')]),
    h('div', { fontSize: 24, color: 'rgba(255,255,255,0.55)' }, 'Free · Private · Works offline · ramadanstrivers.com')
  ]);
  return new ImageResponse(tree, { width: 1200, height: 630, headers: { 'Cache-Control': 'public, max-age=86400, immutable' } });
}
