// Rewrites a batch of true/false cards for an age level and language, keeping each answer unchanged. Cached per batch.
const { handler, send, body, err } = require('../_lib/util'); const ai = require('../_lib/ai');
const LANGS = { en: 'English', zh: 'Simplified Chinese', hi: 'Hindi', es: 'Spanish', fr: 'French', ar: 'Arabic', bn: 'Bengali', pt: 'Portuguese', ru: 'Russian', ur: 'Urdu' };
module.exports = handler(async (req, res) => {
  if(!ai.configured()) throw err(503, 'AI features are not enabled on this server', 'ai_not_configured');
  const b = await body(req); const lang = LANGS[b.lang] ? b.lang : 'en'; const level = b.level === 'kids' ? 'kids' : 'advanced';
  const cards = (Array.isArray(b.cards) ? b.cards : []).slice(0, 12).map(c => ({ q: String(c.q || '').slice(0, 300), a: !!c.a, x: String(c.x || '').slice(0, 300), r: String(c.r || '').slice(0, 40) })); if(!cards.length) throw err(400, 'cards required');
  const value = await ai.cached('quiz|' + level + '|' + lang + '|' + JSON.stringify(cards), async () => {
    const text = await ai.complete(ai.GUARDRAILS + '\nYou rewrite quiz cards. You must keep every "a" (true/false answer) and every "r" (source) exactly as given — only reword "q" and "x".', `Language: ${LANGS[lang]}. Level: ${level === 'kids' ? 'children aged 8-12: short sentences, simple words, friendly tone' : 'advanced learners: precise wording, add the Arabic term where natural'}.
Rewrite these cards. Return ONLY a JSON array of objects with keys q, a, x, r in the same order, nothing else:\n${JSON.stringify(cards)}`, 2500);
    const m = text.match(/\[[\s\S]*\]/); let arr; try { arr = JSON.parse(m ? m[0] : text); } catch(e){ throw Object.assign(new Error('AI returned unparseable output'), { status: 502 }); }
    if(!Array.isArray(arr) || arr.length !== cards.length) throw Object.assign(new Error('AI returned wrong card count'), { status: 502 });
    return { cards: arr.map((c, i) => ({ q: String(c.q || cards[i].q).slice(0, 400), a: cards[i].a, x: String(c.x || cards[i].x).slice(0, 400), r: cards[i].r })) }; });
  send(res, 200, value);
}, ['POST']);
