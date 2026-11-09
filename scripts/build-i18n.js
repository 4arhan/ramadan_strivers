#!/usr/bin/env node
/* =====================================================================================================
   build-i18n.js — merges i18n-src/<lang>/*.json into js/lang/<lang>.js  (RS.I18N[<lang>] = {...}).

   Usage:  node scripts/build-i18n.js [--strict] [--lang=xx]
     --strict   exit 1 when a language has missing keys or placeholder mismatches (default: report only)
     --lang=xx  build only one language (en is always read as the reference)

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
const OUT = path.join(ROOT, 'js', 'lang');
const PLURAL_CATS = ['zero', 'one', 'two', 'few', 'many', 'other'];

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

function loadLang(code) {
  const dir = path.join(SRC, code);
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort();
  const errors = [];
  const dict = {};
  const origin = {};
  for (const f of files) {
    const file = path.join(dir, f);
    const data = readJsonStrict(file, errors);
    if (!data) continue;
    for (const [k, v] of flatten(data, '', [], file, errors)) {
      if (Object.prototype.hasOwnProperty.call(dict, k)) {
        errors.push(`duplicate key "${k}" in ${rel(file)} (already defined in ${origin[k]})`);
        continue;
      }
      dict[k] = v;
      origin[k] = rel(file);
    }
  }
  return { code, files, dict, errors };
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

function compare(en, lang) {
  const report = { missing: [], extra: [], mismatch: [] };
  if (lang.code === 'en') return report;
  const groups = pluralGroups(en);
  let cats;
  try { cats = new Intl.PluralRules(lang.code).resolvedOptions().pluralCategories; } catch (e) { cats = ['one', 'other']; }
  const pluralKeyBase = k => { const i = k.lastIndexOf('.'); const b = k.slice(0, i); return i > 0 && groups.has(b) && PLURAL_CATS.includes(k.slice(i + 1)) ? b : null; };
  for (const k of Object.keys(en)) {
    const base = pluralKeyBase(k);
    if (base) continue;
    if (!Object.prototype.hasOwnProperty.call(lang.dict, k)) report.missing.push(k);
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
  const js = `/* Generated by scripts/build-i18n.js from i18n-src/${lang.code}/*.json. Do not edit by hand. */\n` +
    `(function () {\n  var RS = window.RS = window.RS || {};\n  RS.I18N = RS.I18N || {};\n  RS.I18N[${JSON.stringify(lang.code)}] = {\n${body}\n  };\n})();\n`;
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, lang.code + '.js'), js);
  return keys.length;
}

function build(opts) {
  opts = opts || {};
  const strict = !!opts.strict;
  if (!fs.existsSync(path.join(SRC, 'en'))) { console.error('i18n-src/en is missing'); return 1; }
  const codes = fs.readdirSync(SRC).filter(d => fs.statSync(path.join(SRC, d)).isDirectory()).sort((a, b) => (a === 'en' ? -1 : b === 'en' ? 1 : a.localeCompare(b)));
  const en = loadLang('en');
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
    if (code === 'en' && en.errors.length) continue;
    const r = compare(en.dict, lang);
    const n = writeLang(lang);
    const parts = [`${n} keys from ${lang.files.length} file(s)`];
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
