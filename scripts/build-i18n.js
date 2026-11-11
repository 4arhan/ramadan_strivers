#!/usr/bin/env node
/* =====================================================================================================
   build-i18n.js — merges i18n-src/<lang>/*.json into js/lang/<lang>.js  (RS.I18N[<lang>] = {...}).

   Usage:  node scripts/build-i18n.js [--strict] [--lang=xx]
     --strict   exit 1 when a language has missing keys or placeholder mismatches (default: report only)
     --lang=xx  build only one language (en is always read as the reference)

   Languages: every code in RS.LANGS (read from js/core.js) plus any extra folder in i18n-src/. A language
   is ALWAYS written, so RS.setLang(code) never 404s: a language without an i18n-src/<code>/ folder gets an
   empty stub (`RS.I18N.<code> = {}`), and RS.t falls back to English key by key for anything missing.
   An existing js/lang/<code>.js that is not a stub is never replaced by a stub.

   English-only developer strings (the hidden #/styleguide, module placeholders) live in
   i18n-src/_dev/*.json: they are merged into js/lang/en.js only, are never translated, and are not
   reported as missing for other languages. Keep them out of the translation workflow.

   Source format: each file is a JSON object of key → string. Keys may be flat ("core.ok": "OK") or nested
   ({"core": {"ok": "OK"}}); nested objects are flattened with dots. Plural forms use the CLDR categories as
   the last segment: "x.one", "x.other" (+ "x.zero"/"x.two"/"x.few"/"x.many" where the language needs them).

   Checks
   - FAIL (exit 1, nothing written for that language): invalid JSON, non-string values, the same key in two
     files of one language, a duplicate key inside one file.
   - REPORT: keys missing compared with en (plural groups are checked against the language's own plural
     categories), keys that en does not have, and {placeholder} mismatches with en.
   Output files are committed; the app loads js/lang/en.js eagerly and other languages on demand.
   ===================================================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'i18n-src');
const DEV = path.join(SRC, '_dev');
const OUT = path.join(ROOT, 'js', 'lang');
const PLURAL_CATS = ['zero', 'one', 'two', 'few', 'many', 'other'];
const STUB_MARK = 'no translations yet';
const FALLBACK_LANGS = ['en', 'zh', 'hi', 'es', 'fr', 'ar', 'bn', 'pt', 'ru', 'ur', 'id', 'ms', 'tr', 'fa', 'sw'];

// The app's language list (RS.LANGS in js/core.js) is the source of truth for which files must exist.
function appLangs() {
  try {
    const src = fs.readFileSync(path.join(ROOT, 'js', 'core.js'), 'utf8');
    const block = src.match(/RS\.LANGS\s*=\s*\[([\s\S]*?)\];/);
    const codes = block ? [...block[1].matchAll(/code:\s*'([a-z]{2,3})'/g)].map(m => m[1]) : [];
    if (codes.length) return codes;
  } catch (e) { /* fall through */ }
  console.warn('could not read RS.LANGS from js/core.js; using the built-in list');
  return FALLBACK_LANGS;
}

function readJsonStrict(file, errors) {
  const text = fs.readFileSync(file, 'utf8');
  let data;
  try { data = JSON.parse(text); } catch (e) { errors.push(`${rel(file)}: invalid JSON (${e.message})`); return null; }
  // JSON.parse silently keeps the last of duplicate keys inside one object, so scan the text as well.
  const seen = new Map();
  const re = /"((?:[^"\\]|\\.)*)"\s*:/g;
  let m;
  if (isFlatObject(data)) {
    while ((m = re.exec(text))) {
      const k = JSON.parse('"' + m[1] + '"');
      if (seen.has(k)) errors.push(`${rel(file)}: duplicate key "${k}" inside the file`);
      seen.set(k, true);
    }
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) { errors.push(`${rel(file)}: top level must be an object`); return null; }
  return data;
}
function isFlatObject(o) { return o && typeof o === 'object' && !Array.isArray(o) && Object.keys(o).every(k => typeof o[k] !== 'object' || o[k] === null); }
function rel(f) { return path.relative(ROOT, f); }

function flatten(obj, prefix, out, file, errors) {
  for (const k of Object.keys(obj)) {
    const key = prefix ? prefix + '.' + k : k;
    const v = obj[k];
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, out, file, errors);
    else if (typeof v === 'string') out.push([key, v]);
    else errors.push(`${rel(file)}: "${key}" must be a string`);
  }
  return out;
}

function jsonFiles(dir) {
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort().map(f => path.join(dir, f)) : [];
}
// en also merges the English-only developer strings (i18n-src/_dev); their keys are returned in `dev`.
function loadLang(code) {
  const dir = path.join(SRC, code);
  const files = jsonFiles(dir);
  const devFiles = code === 'en' ? jsonFiles(DEV) : [];
  const errors = [];
  const dict = {};
  const origin = {};
  const dev = new Set();
  for (const file of files.concat(devFiles)) {
    const data = readJsonStrict(file, errors);
    if (!data) continue;
    for (const [k, v] of flatten(data, '', [], file, errors)) {
      if (Object.prototype.hasOwnProperty.call(dict, k)) {
        errors.push(`duplicate key "${k}" in ${rel(file)} (already defined in ${origin[k]})`);
        continue;
      }
      dict[k] = v;
      origin[k] = rel(file);
      if (devFiles.includes(file)) dev.add(k);
    }
  }
  return { code, files: files.concat(devFiles).map(f => path.basename(f)), dict, errors, dev, hasSource: fs.existsSync(dir) };
}

function placeholders(s) {
  const set = new Set();
  String(s).replace(/\{(\w+)\}/g, (m, k) => { set.add(k); return m; });
  return set;
}
function sameSet(a, b) { if (a.size !== b.size) return false; for (const x of a) if (!b.has(x)) return false; return true; }

// Plural groups in en: base B where en has B.other plus at least one other CLDR category.
function pluralGroups(en) {
  const groups = new Map();
  for (const k of Object.keys(en)) {
    const i = k.lastIndexOf('.');
    if (i < 0) continue;
    const cat = k.slice(i + 1);
    if (!PLURAL_CATS.includes(cat)) continue;
    const base = k.slice(0, i);
    if (!groups.has(base)) groups.set(base, new Set());
    groups.get(base).add(cat);
  }
  for (const [base, cats] of [...groups]) if (!cats.has('other') || cats.size < 2) groups.delete(base);
  return groups;
}

// The Eid report PDF uses jsPDF's Helvetica (Latin-1 only), so js/tracker.js (PDF_LANGS) prints its labels in English
// for every other language; those languages need only the me.pdf.* toasts. Keep in step with scripts/check-i18n.js.
const PDF_LANGS = ['en', 'es', 'fr', 'pt', 'id', 'ms', 'sw'];
const PDF_TOASTS = ['me.pdf.loading', 'me.pdf.done', 'me.pdf.failed'];
const pdfOnly = (code, k) => PDF_LANGS.indexOf(code) < 0 && k.startsWith('me.pdf.') && PDF_TOASTS.indexOf(k) < 0;

function compare(en, lang) {
  const report = { missing: [], extra: [], mismatch: [] };
  if (lang.code === 'en') return report;
  const groups = pluralGroups(en);
  // Required plural categories are those that whole numbers 0..1000 reach, as in scripts/check-i18n.js. es/fr/pt also
  // have "many" (exact millions); RS.tn falls back to the language's own .other there, which is the right form.
  let cats;
  try { const pr = new Intl.PluralRules(lang.code), seen = new Set(); for (let i = 0; i <= 1000; i++) seen.add(pr.select(i)); cats = [...seen]; }
  catch (e) { cats = ['one', 'other']; }
  const pluralKeyBase = k => { const i = k.lastIndexOf('.'); const b = k.slice(0, i); return i > 0 && groups.has(b) && PLURAL_CATS.includes(k.slice(i + 1)) ? b : null; };
  for (const k of Object.keys(en)) {
    const base = pluralKeyBase(k);
    if (base) continue;
    if (!Object.prototype.hasOwnProperty.call(lang.dict, k)) { if (!pdfOnly(lang.code, k)) report.missing.push(k); }
    else if (!sameSet(placeholders(en[k]), placeholders(lang.dict[k]))) report.mismatch.push(k);
  }
  for (const [base] of groups) {
    const allowed = new Set([...placeholders(en[base + '.other'])].concat(['n']));
    for (const c of cats) {
      const key = base + '.' + c;
      if (!Object.prototype.hasOwnProperty.call(lang.dict, key)) { report.missing.push(key); continue; }
      for (const p of placeholders(lang.dict[key])) if (!allowed.has(p)) { report.mismatch.push(key); break; }
    }
  }
  for (const k of Object.keys(lang.dict)) {
    if (!Object.prototype.hasOwnProperty.call(en, k) && !pluralKeyBase(k)) report.extra.push(k);
  }
  return report;
}

function writeLang(lang) {
  const keys = Object.keys(lang.dict).sort();
  const body = keys.map(k => '  ' + JSON.stringify(k) + ': ' + JSON.stringify(lang.dict[k])).join(',\n');
  const head = lang.hasSource
    ? `/* Generated by scripts/build-i18n.js from i18n-src/${lang.code}/*.json${lang.code === 'en' ? ' and i18n-src/_dev/*.json' : ''}. Do not edit by hand. */\n`
    : `/* Generated by scripts/build-i18n.js: ${STUB_MARK} (no i18n-src/${lang.code}/), so every string falls back to English. Do not edit by hand. */\n`;
  const js = head + `(function () {\n  var RS = window.RS = window.RS || {};\n  RS.I18N = RS.I18N || {};\n  RS.I18N[${JSON.stringify(lang.code)}] = {` +
    (keys.length ? `\n${body}\n  };` : '};') + `\n})();\n`;
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, lang.code + '.js'), js);
  return keys.length;
}
function isStubFile(file) {
  try { return fs.readFileSync(file, 'utf8').indexOf(STUB_MARK) >= 0; } catch (e) { return true; }   // missing → write it
}

function build(opts) {
  opts = opts || {};
  const strict = !!opts.strict;
  if (!fs.existsSync(path.join(SRC, 'en'))) { console.error('i18n-src/en is missing'); return 1; }
  const folders = fs.readdirSync(SRC).filter(d => !/^[._]/.test(d) && fs.statSync(path.join(SRC, d)).isDirectory());
  const codes = [...new Set(appLangs().concat(folders))].sort((a, b) => (a === 'en' ? -1 : b === 'en' ? 1 : a.localeCompare(b)));
  const en = loadLang('en');
  const enRef = {};                                      // the reference other languages are compared with
  Object.keys(en.dict).forEach(k => { if (!en.dev.has(k)) enRef[k] = en.dict[k]; });
  let failed = false;
  for (const code of codes) {
    if (opts.lang && code !== opts.lang && code !== 'en') continue;
    const lang = code === 'en' ? en : loadLang(code);
    if (lang.errors.length) {
      failed = true;
      console.error(`\n[${code}] FAILED — not written:`);
      lang.errors.forEach(e => console.error('  - ' + e));
      continue;
    }
    const outFile = path.join(OUT, code + '.js');
    if (!lang.hasSource && !isStubFile(outFile)) {
      console.warn(`[${code}] js/lang/${code}.js exists but i18n-src/${code}/ does not — left unchanged`);
      continue;
    }
    const r = compare(enRef, lang);
    const n = writeLang(lang);
    if (!lang.hasSource) {
      console.log(`[${code}] js/lang/${code}.js — empty stub (no i18n-src/${code}/ yet; English fallback)`);
      if (strict) failed = true;
      continue;
    }
    const parts = [`${n} keys from ${lang.files.length} file(s)`];
    if (code === 'en' && en.dev.size) parts.push(`${en.dev.size} of them English-only developer strings`);
    if (code !== 'en') parts.push(`${r.missing.length} missing`, `${r.mismatch.length} placeholder mismatch(es)`, `${r.extra.length} extra`);
    console.log(`[${code}] js/lang/${code}.js — ${parts.join(', ')}`);
    const show = (label, list) => { if (list.length) console.log(`  ${label}: ${list.slice(0, 25).join(', ')}${list.length > 25 ? ` … (+${list.length - 25})` : ''}`); };
    show('missing', r.missing);
    show('placeholder mismatch', r.mismatch);
    show('extra (not in en)', r.extra);
    if (strict && (r.missing.length || r.mismatch.length)) failed = true;
  }
  return failed ? 1 : 0;
}

module.exports = build;
if (require.main === module) {
  const args = process.argv.slice(2);
  const langArg = args.find(a => a.startsWith('--lang='));
  process.exitCode = build({ strict: args.includes('--strict'), lang: langArg ? langArg.slice(7) : null });
}
