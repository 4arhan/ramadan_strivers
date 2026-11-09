// "Explain this deed / hadith": short, cited, non-ruling explanation at the reader's level, in their language. Cached.
const { handler, send, body, str, err } = require('../../_lib/util'); const ai = require('../../_lib/ai');
const LANGS = { en: 'English', zh: 'Simplified Chinese', hi: 'Hindi', es: 'Spanish', fr: 'French', ar: 'Arabic', bn: 'Bengali', pt: 'Portuguese', ru: 'Russian', ur: 'Urdu' };
module.exports = handler(async (req, res) => {
  if(!ai.configured()) throw err(503, 'AI features are not enabled on this server', 'ai_not_configured');
  const b = await body(req); const label = str(b.label, 120), ref = str(b.ref, 60), exp = str(b.exp, 300), lang = LANGS[b.lang] ? b.lang : 'en', level = ['kids', 'new', 'adult'].includes(b.level) ? b.level : 'adult';
  if(!label) throw err(400, 'label required');
  const value = await ai.cached('explain|' + [label, ref, exp, lang, level].join('|'), async () => {
    const text = await ai.complete(ai.GUARDRAILS, `Deed in the app: "${label}". Cited source: ${ref || 'none given'}. App's one-line note: "${exp || ''}".
Reader level: ${level === 'kids' ? 'child aged 8-12, very simple words' : level === 'new' ? 'new Muslim or beginner, define terms' : 'adult, concise'}. Language: ${LANGS[lang]}.
Write 3 short paragraphs max (under 130 words total): (1) what the cited text says and means, (2) why this deed matters in Ramadan, (3) one practical tip to do it today. End with the source reference exactly as given. No headings, no bullet points.`, 500);
    return { text, model: ai.MODEL }; });
  send(res, 200, value, { 'Cache-Control': 'public, max-age=86400' });
}, ['POST']);
