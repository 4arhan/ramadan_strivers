#!/usr/bin/env node
// Validate translations in i18n-src/<lang>/*.json against i18n-src/en/*.json.
//   node scripts/check-i18n.js            all languages
//   node scripts/check-i18n.js ur fr      selected languages
//   --strict   exit 1 on warnings too
//   --files content.json,core.json   only check these files
// Checks: JSON validity, missing/extra keys, {placeholder} parity, HTML tag parity, plural categories required by
// Intl.PluralRules for the language (integers 0..1000), emoji, empty strings, untranslated multi-word strings, and
// staleness (keys whose English changed since translation: i18n-src/<lang>/.en-hashes, written by --snapshot).
//   node scripts/check-i18n.js --snapshot fr   record the current English as translated for fr (run after translating)
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const h8 = s => crypto.createHash('sha1').update(String(s)).digest('hex').slice(0, 8);
const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'i18n-src');
const LANGS = ['zh', 'hi', 'es', 'fr', 'ar', 'bn', 'pt', 'ru', 'ur'];
const PLURAL_CATS = ['zero', 'one', 'two', 'few', 'many', 'other'];
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F2FF}\u{2B50}\u{2B55}\u{231A}-\u{23FF}]/u;
const KEEP_SAME = /^(?:[A-Z0-9 .,:;'’\-–—\/()#%+&ﷺ]*|.*\b(?:Ramadan Strivers|Tarteel|Quran\.com|WhatsApp|PDF|CSV|QR|URL|API|Email|OK)\b.*)$/;
const args = process.argv.slice(2); const strict = args.includes('--strict');
const fi = args.indexOf('--files'); const onlyFiles = fi >= 0 ? args[fi + 1].split(',') : null;
const langs = args.filter((a, i) => !a.startsWith('--') && !(fi >= 0 && i === fi + 1)); const targets = langs.length ? langs : LANGS;

function flat(obj, pre, out){ out = out || {}; for(const [k, v] of Object.entries(obj || {})){ const key = pre ? pre + '.' + k : k; if(v && typeof v === 'object' && !Array.isArray(v)) flat(v, key, out); else out[key] = v; } return out; }
function readJSON(f){ return JSON.parse(fs.readFileSync(f, 'utf8')); }
const ph = s => (String(s).match(/\{[a-zA-Z0-9_]+\}/g) || []).sort();
const tags = s => (String(s).match(/<\/?[a-z][a-z0-9]*\b/gi) || []).map(t => t.toLowerCase()).sort();
function neededCats(lang){ const pr = new Intl.PluralRules(lang); const s = new Set(); for(let i = 0; i <= 1000; i++) s.add(pr.select(i)); return [...s]; }

const enFiles = fs.readdirSync(path.join(SRC, 'en')).filter(f => f.endsWith('.json') && (!onlyFiles || onlyFiles.includes(f)));
const en = {}; enFiles.forEach(f => { en[f] = flat(readJSON(path.join(SRC, 'en', f))); });
if(args.includes('--snapshot')){
  for(const lang of langs){ const sf = path.join(SRC, lang, '.en-hashes'); const snap = fs.existsSync(sf) ? readJSON(sf) : {};
    for(const f of enFiles){ snap[f] = {}; for(const [k, v] of Object.entries(en[f])) snap[f][k] = h8(v); }
    fs.writeFileSync(path.join(SRC, lang, '.en-hashes'), JSON.stringify(snap) + '\n'); console.log('snapshot written for ' + lang); }
  process.exit(0);
}
let errors = 0, warnings = 0;
const out = [];
for(const lang of targets){
  const dir = path.join(SRC, lang); const need = neededCats(lang);
  const snapF = path.join(dir, '.en-hashes'); const snap = fs.existsSync(snapF) ? readJSON(snapF) : null;
  const E = [], W = [];
  for(const f of enFiles){
    const file = path.join(dir, f);
    if(!fs.existsSync(file)){ E.push(f + ': file missing'); continue; }
    let tr; try { tr = flat(readJSON(file)); } catch(e){ E.push(f + ': invalid JSON (' + e.message + ')'); continue; }
    const src = en[f];
    // plural groups in English: base keys with .one/.other
    const pluralBases = new Set(Object.keys(src).filter(k => /\.(zero|one|two|few|many|other)$/.test(k)).map(k => k.replace(/\.(zero|one|two|few|many|other)$/, '')));
    const isPlural = k => pluralBases.has(k.replace(/\.(zero|one|two|few|many|other)$/, '')) && /\.(zero|one|two|few|many|other)$/.test(k);
    for(const k of Object.keys(src)){
      if(isPlural(k)) continue;
      if(!(k in tr)){ E.push(f + ': missing ' + k); continue; }
      const v = tr[k];
      if(typeof src[k] !== 'string'){ if(JSON.stringify(v) === undefined) E.push(f + ': bad value ' + k); continue; }
      if(typeof v !== 'string'){ E.push(f + ': not a string ' + k); continue; }
      if(!v.trim() && src[k].trim()) E.push(f + ': empty ' + k);
      if(ph(src[k]).join() !== ph(v).join()) E.push(f + ': placeholders differ ' + k + ' en=' + ph(src[k]).join(',') + ' ' + lang + '=' + ph(v).join(','));
      if(tags(src[k]).join() !== tags(v).join()) E.push(f + ': HTML tags differ ' + k);
      if(EMOJI.test(v)) E.push(f + ': emoji in ' + k);
      if(v === src[k] && src[k].split(/\s+/).length >= 3 && !KEEP_SAME.test(src[k])) W.push(f + ': looks untranslated ' + k);
      if(snap && snap[f] && snap[f][k] !== undefined && snap[f][k] !== h8(src[k])) W.push(f + ': STALE (English changed since translation) ' + k);
      if(snap && snap[f] && snap[f][k] === undefined) W.push(f + ': NEW key since snapshot ' + k);
    }
    for(const base of pluralBases){
      const enOther = src[base + '.other']; const have = PLURAL_CATS.filter(c => (base + '.' + c) in tr);
      for(const c of need) if(!have.includes(c)) E.push(f + ': plural ' + base + ' needs .' + c + ' for ' + lang + ' (has ' + (have.join(',') || 'none') + ')');
      for(const c of have){ const v = tr[base + '.' + c];
        if(typeof v !== 'string' || !v.trim()){ E.push(f + ': empty plural ' + base + '.' + c); continue; }
        const want = ph(enOther || '').filter(p => !(p === '{n}' && ['zero', 'one', 'two'].includes(c)));
        const got = ph(v); for(const p of want) if(!got.includes(p)) E.push(f + ': plural ' + base + '.' + c + ' lacks ' + p);
        for(const p of got) if(!ph(enOther || '').includes(p)) E.push(f + ': plural ' + base + '.' + c + ' has unknown ' + p);
        if(EMOJI.test(v)) E.push(f + ': emoji in ' + base + '.' + c); }
    }
    for(const k of Object.keys(tr)) if(!(k in src) && !isPlural(k)) W.push(f + ': extra key ' + k);
  }
  errors += E.length; warnings += W.length;
  out.push('[' + lang + '] ' + E.length + ' error(s), ' + W.length + ' warning(s)' + (need.length ? '  plural categories: ' + need.join(',') : ''));
  E.slice(0, 200).forEach(x => out.push('  ERROR ' + x)); if(E.length > 200) out.push('  … ' + (E.length - 200) + ' more errors');
  W.slice(0, 80).forEach(x => out.push('  warn  ' + x)); if(W.length > 80) out.push('  … ' + (W.length - 80) + ' more warnings');
}
console.log(out.join('\n'));
console.log('TOTAL: ' + errors + ' error(s), ' + warnings + ' warning(s)');
process.exit(errors || (strict && warnings) ? 1 : 0);
