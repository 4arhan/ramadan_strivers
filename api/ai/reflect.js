// Personalised daily reflection prompt from yesterday's summary.
const { handler, send, body, str, err } = require('../_lib/util'); const ai = require('../_lib/ai');
const LANGS = { en: 'English', zh: 'Simplified Chinese', hi: 'Hindi', es: 'Spanish', fr: 'French', ar: 'Arabic', bn: 'Bengali', pt: 'Portuguese', ru: 'Russian', ur: 'Urdu' };
module.exports = handler(async (req, res) => {
  if(!ai.configured()) throw err(503, 'AI features are not enabled on this server', 'ai_not_configured');
  const b = await body(req); const lang = LANGS[b.lang] ? b.lang : 'en'; const s = b.summary || {};
  const summary = { day: parseInt(s.day, 10) || 1, pct: parseInt(s.pct, 10) || 0, streaks: s.streaks || {}, done: Array.isArray(s.done) ? s.done.slice(0, 20).map(x => str(x, 60)) : [], missed: Array.isArray(s.missed) ? s.missed.slice(0, 10).map(x => str(x, 60)) : [], quran: parseInt(s.quran, 10) || 0 };
  const value = await ai.cached('reflect|' + lang + '|' + JSON.stringify(summary), async () => {
    const text = await ai.complete(ai.GUARDRAILS + '\nYou write a single reflective journaling prompt. Never shame the reader; be encouraging and specific to what they did.', `Language: ${LANGS[lang]}. It is Ramadan day ${summary.day}. Yesterday: ${summary.pct}% of deeds, Quran pages ${summary.quran}, streaks ${JSON.stringify(summary.streaks)}, completed: ${summary.done.join(', ') || 'none'}; not done: ${summary.missed.join(', ') || 'none'}.
Write ONE gentle reflection question (max 35 words) the reader can answer in their journal tonight, grounded in one specific thing they did or skipped. Plain text only.`, 150);
    return { prompt: text }; });
  send(res, 200, value);
}, ['POST']);
