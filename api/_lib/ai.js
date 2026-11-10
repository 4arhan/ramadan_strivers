// Claude API wrapper. Optional: without ANTHROPIC_API_KEY the AI endpoints return 503 and the app hides AI features.
const crypto = require('crypto');
const { one, q } = require('./db');
function configured(){ return !!process.env.ANTHROPIC_API_KEY; }
const MODEL = process.env.AI_MODEL || 'claude-opus-5-5';
async function complete(system, user, maxTokens){
  if(!configured()){ const e = new Error('AI not configured (ANTHROPIC_API_KEY)'); e.status = 503; e.code = 'ai_not_configured'; throw e; }
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens || 600, system, messages: [{ role: 'user', content: user }] })
  });
  if(!r.ok){ const t = await r.text(); const e = new Error('AI request failed: ' + r.status + ' ' + t.slice(0, 200)); e.status = 502; throw e; }
  const j = await r.json(); return (j.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n').trim();
}
async function cached(key, fn){
  const k = crypto.createHash('sha256').update(key).digest('hex');
  const hit = await one('SELECT value FROM ai_cache WHERE key=$1', [k]).catch(() => null);
  if(hit) return hit.value;
  const value = await fn();
  await q('INSERT INTO ai_cache(key,value) VALUES($1,$2) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value', [k, JSON.stringify(value)]).catch(() => {});
  return value;
}
// Hard scope: explain cited texts, never issue rulings.
const GUARDRAILS = `You are a gentle, knowledgeable study companion inside the Ramadan Strivers app.
Rules you must never break:
1. Only explain the hadith or Quran verse that is given to you, in context of the deed it supports. Mention the source given.
2. Never issue religious rulings (fatwa), never say something is halal/haram, obligatory or forbidden, never adjudicate between schools of thought. If asked, say the user should consult a qualified local scholar.
3. Be warm, short and practical. Avoid sectarian framing. Do not invent hadith, numbers or sources.
4. Reply in the requested language. Keep Arabic terms (salah, dua, sujood) with a brief gloss if helpful.`;
module.exports = { configured, complete, cached, GUARDRAILS, MODEL };
