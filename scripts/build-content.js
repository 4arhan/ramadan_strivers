#!/usr/bin/env node
/* =====================================================================================================
   build-content.js — turns content/*.json (English source) into
     js/content.js              RS.content = structure only (ids, icons, points, refs, flags) — no text
     i18n-src/en/content.json   every text string, keyed as in CONTRACT §4
   and then runs scripts/build-i18n.js so js/lang/en.js is up to date.

   Usage:  node scripts/build-content.js [--no-i18n]

   SOURCE FORMAT (all text fields in English; ref strings such as "Bukhari 38" are never translated;
   url may be "" — it is derived from ref for the six books and the Quran; grade "" when unknown)
   sections.json   [{id, icon, l10?, title, note:{text, ref, url, grade},
                     subs?:[{id, icon, title, items:[deedId]}], items?:[deedId]}]
   deeds.json      [{id, sec, sub, label, exp, pts, ref, url, grade, haydOff, stk?, give?, app?}]
                     stk: 'fajr'|'night'|'quran'|'charity' · app: 'lwa'|'trt' · sub: '' when the section has no subs
   hadith.json     [{n (1..30), text, ref, url, grade}]
   badges.json     [{id, icon, name, desc}]                 desc = the unlock rule
   quiz-cats.json  [{id, icon, name}]
   tf.json         [{id, cat, q, a (true|false), x, ref, url, grade}]
   mcq.json        [{id, cat, q, o:[4 options], correct (0..3), x, ref, url, grade}]
   decks.json      [{id, icon, name, desc, cards?:[cardId]}]   cards defaults to the cards whose deck is this id
   cards.json      [{id, deck, f, b, arabic?, translit?, ref, url, grade}]   f/b = front/back text
   prep.json       {intro:{title, body},
                    tracks:[{id, icon, name, desc}],
                    assessment:[{id, q, options:[text…], scores:[number…]}],
                    days:[{n, track, theme, reflect, mot, prompts:[{id, track, text, tip}], ref, url, grade}],
                    milestones:[{week, title, goal}]}
   guide.json      [{id, icon, title, body}]                body: paragraphs separated by blank lines

   Fails (exit 1, nothing written) on: invalid JSON, duplicate ids, unknown references (deed/category/deck/
   track), unknown icons (must exist in js/icons.js), missing required text, any emoji in text.
   ===================================================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'content');
const OUT_JS = path.join(ROOT, 'js', 'content.js');
const OUT_TEXT = path.join(ROOT, 'i18n-src', 'en', 'content.json');

const errors = [];
const fail = msg => errors.push(msg);
const EMOJI = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{FE0E}\u{FE0F}\u{200D}\u{20E3}]/u;
const STK = ['fajr', 'night', 'quran', 'charity'];
const APPS = ['lwa', 'trt'];

function load(name, fallback) {
  const f = path.join(SRC, name);
  if (!fs.existsSync(f)) { if (fallback !== undefined) return fallback; fail(`content/${name} is missing`); return fallback; }
  try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { fail(`content/${name}: invalid JSON (${e.message})`); return fallback; }
}
function iconNames() {
  const f = path.join(ROOT, 'js', 'icons.js');
  if (!fs.existsSync(f)) return null;
  const set = new Set();
  const re = /^\s*"([a-z0-9-]+)":\s*"/gm;
  let m;
  const src = fs.readFileSync(f, 'utf8');
  while ((m = re.exec(src))) set.add(m[1]);
  return set;
}
const ICONS = iconNames();
function checkIcon(where, icon) {
  if (!icon) { fail(`${where}: icon is required`); return; }
  if (ICONS && !ICONS.has(icon)) fail(`${where}: unknown icon "${icon}" (not in js/icons.js)`);
}
const BOOK = { 'bukhari': 'bukhari', 'muslim': 'muslim', 'tirmidhi': 'tirmidhi', 'nasai': 'nasai', "nasa'i": 'nasai', 'ibn majah': 'ibnmajah', 'abu dawud': 'abudawud' };
function refUrl(ref) {   // same rule as RS.refUrl in js/core.js
  if (!ref) return '';
  let m = String(ref).trim().match(/^(?:Quran|Qur'an)\s+(\d{1,3}):(\d{1,3})(?:\s*[-–]\s*\d{1,3})?$/i);
  if (m) return 'https://quran.com/' + m[1] + '/' + m[2];
  m = String(ref).trim().match(/^(.+?)\s+(\d+[a-z]?)$/i);
  if (m && BOOK[m[1].toLowerCase()]) return 'https://sunnah.com/' + BOOK[m[1].toLowerCase()] + ':' + m[2];
  return '';
}
function refPart(where, o) {
  const out = { ref: String(o.ref || '').trim(), url: String(o.url || '').trim() || refUrl(o.ref), grade: String(o.grade || '').trim() };
  if (out.url && !/^https:\/\//.test(out.url)) fail(`${where}: url must be https (${out.url})`);
  return out;
}
function uniqueIds(list, where, key) {
  key = key || 'id';
  const seen = new Set();
  (list || []).forEach((x, i) => {
    const id = x && x[key];
    if (id === undefined || id === null || id === '') fail(`${where}[${i}]: ${key} is required`);
    else if (seen.has(id)) fail(`${where}: duplicate ${key} "${id}"`);
    else seen.add(id);
  });
  return seen;
}

const text = {};
function put(key, value, opts) {
  opts = opts || {};
  const v = value == null ? '' : String(value);
  if (!v.trim() && !opts.optional) fail(`text "${key}" is empty`);
  if (EMOJI.test(v)) fail(`text "${key}" contains an emoji`);
  if (Object.prototype.hasOwnProperty.call(text, key)) fail(`text key "${key}" is generated twice`);
  text[key] = v.trim();
}

// ---------------------------------------------------------------- load
const sections = load('sections.json', []);
const deedsSrc = load('deeds.json', []);
const hadithSrc = load('hadith.json', []);
const badgesSrc = load('badges.json', []);
const catsSrc = load('quiz-cats.json', []);
const tfSrc = load('tf.json', []);
const mcqSrc = load('mcq.json', []);
const decksSrc = load('decks.json', []);
const cardsSrc = load('cards.json', []);
const prepSrc = load('prep.json', { intro: { title: '', body: '' }, tracks: [], assessment: [], days: [], milestones: [] });
const guideSrc = load('guide.json', []);

// ---------------------------------------------------------------- deeds + sections
const deedIds = uniqueIds(deedsSrc, 'deeds.json');
const deedById = new Map(deedsSrc.map(d => [d.id, d]));
const placed = new Map();
uniqueIds(sections, 'sections.json');
const subIds = new Set();
const outSections = sections.map(s => {
  const where = `sections.json "${s.id}"`;
  checkIcon(where, s.icon);
  put(`sec.${s.id}.title`, s.title);
  put(`sec.${s.id}.note`, s.note && s.note.text, { optional: true });
  const o = { id: s.id, icon: s.icon };
  if (s.l10) o.l10 = true;
  const claim = (id, subId) => {
    if (!deedIds.has(id)) { fail(`${where}: unknown deed "${id}"`); return id; }
    if (placed.has(id)) fail(`${where}: deed "${id}" already listed in ${placed.get(id)}`);
    placed.set(id, s.id);
    const d = deedById.get(id);
    if (d.sec !== s.id) fail(`deeds.json "${id}": sec "${d.sec}" but listed in section "${s.id}"`);
    if ((d.sub || '') !== (subId || '')) fail(`deeds.json "${id}": sub "${d.sub || ''}" but listed under "${subId || ''}"`);
    return id;
  };
  if (s.subs) {
    o.subs = s.subs.map(sub => {
      if (subIds.has(sub.id)) fail(`${where}: duplicate sub id "${sub.id}"`);
      subIds.add(sub.id);
      checkIcon(`${where} sub "${sub.id}"`, sub.icon);
      put(`sub.${sub.id}`, sub.title);
      return { id: sub.id, icon: sub.icon, items: (sub.items || []).map(id => claim(id, sub.id)) };
    });
  }
  if (s.items) o.items = s.items.map(id => claim(id, ''));
  if (!s.subs && !s.items) fail(`${where}: needs items or subs`);
  o.note = refPart(where + ' note', s.note || {});
  return o;
});
const outDeeds = {};
deedsSrc.forEach(d => {
  const where = `deeds.json "${d.id}"`;
  if (!placed.has(d.id)) fail(`${where}: not listed in any section`);
  if (typeof d.pts !== 'number' || !(d.pts > 0)) fail(`${where}: pts must be a positive number`);
  if (typeof d.haydOff !== 'boolean') fail(`${where}: haydOff must be true or false`);
  if (d.stk && !STK.includes(d.stk)) fail(`${where}: stk must be one of ${STK.join('|')}`);
  if (d.app && !APPS.includes(d.app)) fail(`${where}: app must be one of ${APPS.join('|')}`);
  put(`deed.${d.id}.label`, d.label);
  put(`deed.${d.id}.exp`, d.exp, { optional: true });
  const o = Object.assign({ sec: d.sec, sub: d.sub || '', pts: d.pts }, refPart(where, d), { haydOff: d.haydOff });
  if (d.stk) o.stk = d.stk;
  if (d.give) o.give = true;
  if (d.app) o.app = d.app;
  outDeeds[d.id] = o;
});

// ---------------------------------------------------------------- daily hadith
uniqueIds(hadithSrc, 'hadith.json', 'n');
const outHadith = hadithSrc.map(h => {
  if (!(Number.isInteger(h.n) && h.n >= 1 && h.n <= 30)) fail(`hadith.json: n must be 1..30 (got ${h.n})`);
  put(`hadith.${h.n}`, h.text);
  return Object.assign({ n: h.n }, refPart(`hadith.json ${h.n}`, h));
}).sort((a, b) => a.n - b.n);

// ---------------------------------------------------------------- badges, quiz categories, quizzes
uniqueIds(badgesSrc, 'badges.json');
const outBadges = badgesSrc.map(b => {
  checkIcon(`badges.json "${b.id}"`, b.icon);
  put(`badge.${b.id}.name`, b.name);
  put(`badge.${b.id}.desc`, b.desc);
  return { id: b.id, icon: b.icon };
});
const catIds = uniqueIds(catsSrc, 'quiz-cats.json');
const outCats = catsSrc.map(c => { checkIcon(`quiz-cats.json "${c.id}"`, c.icon); put(`cat.${c.id}`, c.name); return { id: c.id, icon: c.icon }; });

uniqueIds(tfSrc, 'tf.json');
const outTf = tfSrc.map(q => {
  const where = `tf.json "${q.id}"`;
  if (!catIds.has(q.cat) || q.cat === 'all') fail(`${where}: unknown category "${q.cat}"`);
  if (typeof q.a !== 'boolean') fail(`${where}: a must be true or false`);
  put(`tf.${q.id}.q`, q.q);
  put(`tf.${q.id}.x`, q.x, { optional: true });
  return Object.assign({ id: q.id, cat: q.cat, a: q.a }, refPart(where, q));
});

uniqueIds(mcqSrc, 'mcq.json');
const outMcq = mcqSrc.map(q => {
  const where = `mcq.json "${q.id}"`;
  const opts = q.o || q.options || [];
  if (!catIds.has(q.cat) || q.cat === 'all') fail(`${where}: unknown category "${q.cat}"`);
  if (opts.length !== 4) fail(`${where}: needs exactly 4 options`);
  if (!(Number.isInteger(q.correct) && q.correct >= 0 && q.correct <= 3)) fail(`${where}: correct must be 0..3`);
  put(`mcq.${q.id}.q`, q.q);
  opts.forEach((t, i) => put(`mcq.${q.id}.o${i}`, t));
  put(`mcq.${q.id}.x`, q.x, { optional: true });
  return Object.assign({ id: q.id, cat: q.cat, correct: q.correct }, refPart(where, q));
});

// ---------------------------------------------------------------- flashcards
const deckIds = uniqueIds(decksSrc, 'decks.json');
uniqueIds(cardsSrc, 'cards.json');
const cardIds = new Set(cardsSrc.map(c => c.id));
const outCards = {};
cardsSrc.forEach(c => {
  const where = `cards.json "${c.id}"`;
  if (!deckIds.has(c.deck)) fail(`${where}: unknown deck "${c.deck}"`);
  put(`fc.${c.id}.f`, c.f);
  put(`fc.${c.id}.b`, c.b);
  outCards[c.id] = Object.assign({ deck: c.deck, arabic: String(c.arabic || ''), translit: String(c.translit || '') }, refPart(where, c));
});
const outDecks = decksSrc.map(d => {
  const where = `decks.json "${d.id}"`;
  checkIcon(where, d.icon);
  put(`deck.${d.id}.name`, d.name);
  put(`deck.${d.id}.desc`, d.desc, { optional: true });
  const cards = d.cards || cardsSrc.filter(c => c.deck === d.id).map(c => c.id);
  cards.forEach(id => { if (!cardIds.has(id)) fail(`${where}: unknown card "${id}"`); });
  return { id: d.id, icon: d.icon, cards };
});

// ---------------------------------------------------------------- Ramadan Prep
const prep = prepSrc || {};
put('prep.intro.title', prep.intro && prep.intro.title, { optional: true });
put('prep.intro.body', prep.intro && prep.intro.body, { optional: true });
const trackIds = uniqueIds(prep.tracks || [], 'prep.json tracks');
const outTracks = (prep.tracks || []).map(t => {
  checkIcon(`prep.json track "${t.id}"`, t.icon);
  put(`prep.track.${t.id}.name`, t.name);
  put(`prep.track.${t.id}.desc`, t.desc, { optional: true });
  return { id: t.id, icon: t.icon };
});
uniqueIds(prep.assessment || [], 'prep.json assessment');
const outAssessment = (prep.assessment || []).map(a => {
  const where = `prep.json assessment "${a.id}"`;
  const options = a.options || [];
  const scores = a.scores || [];
  if (!options.length) fail(`${where}: needs options`);
  if (options.length !== scores.length) fail(`${where}: options and scores must have the same length`);
  if (scores.some(s => typeof s !== 'number')) fail(`${where}: scores must be numbers`);
  put(`prep.a.${a.id}.q`, a.q);
  options.forEach((t, k) => put(`prep.a.${a.id}.o${k}`, t));
  return { id: a.id, scores };
});
uniqueIds(prep.days || [], 'prep.json days', 'n');
const promptIds = new Set();
const outDays = (prep.days || []).map(d => {
  const where = `prep.json day ${d.n}`;
  if (!Number.isInteger(d.n) || d.n < 1) fail(`${where}: n must be a positive integer`);
  if (d.track && !trackIds.has(d.track)) fail(`${where}: unknown track "${d.track}"`);
  put(`prep.day.${d.n}.theme`, d.theme);
  put(`prep.day.${d.n}.reflect`, d.reflect, { optional: true });
  put(`prep.day.${d.n}.mot`, d.mot, { optional: true });
  const prompts = (d.prompts || []).map(p => {
    if (!p.id) fail(`${where}: prompt without id`);
    else if (promptIds.has(p.id)) fail(`${where}: duplicate prompt id "${p.id}"`);
    promptIds.add(p.id);
    if (p.track && !trackIds.has(p.track)) fail(`${where} prompt "${p.id}": unknown track "${p.track}"`);
    put(`prep.p.${p.id}.text`, p.text);
    put(`prep.p.${p.id}.tip`, p.tip, { optional: true });
    return { id: p.id, track: p.track || d.track || '' };
  });
  return Object.assign({ n: d.n, track: d.track || '', prompts }, refPart(where, d));
}).sort((a, b) => a.n - b.n);
uniqueIds(prep.milestones || [], 'prep.json milestones', 'week');
const outMilestones = (prep.milestones || []).map(m => {
  put(`prep.ms.${m.week}.title`, m.title);
  put(`prep.ms.${m.week}.goal`, m.goal, { optional: true });
  return { week: m.week };
});

// ---------------------------------------------------------------- guide
uniqueIds(guideSrc, 'guide.json');
const outGuide = guideSrc.map(g => {
  checkIcon(`guide.json "${g.id}"`, g.icon);
  put(`guide.${g.id}.title`, g.title);
  put(`guide.${g.id}.body`, g.body);
  return { id: g.id, icon: g.icon };
});

// ---------------------------------------------------------------- write
if (errors.length) {
  console.error(`build-content: ${errors.length} error(s), nothing written:`);
  errors.forEach(e => console.error('  - ' + e));
  process.exit(1);
}
const content = {
  sections: outSections,
  deeds: outDeeds,
  hadith: outHadith,
  badges: outBadges,
  quizCats: outCats,
  tf: outTf,
  mcq: outMcq,
  decks: outDecks,
  cards: outCards,
  prep: { tracks: outTracks, assessment: outAssessment, days: outDays, milestones: outMilestones },
  guide: outGuide
};
// one entry per line keeps diffs readable
function serialize(v, indent) {
  const pad = '  '.repeat(indent);
  if (Array.isArray(v)) return v.length ? '[\n' + v.map(x => pad + '  ' + JSON.stringify(x)).join(',\n') + '\n' + pad + ']' : '[]';
  if (v && typeof v === 'object') {
    const keys = Object.keys(v);
    if (!keys.length) return '{}';
    const deep = indent < 1;
    return '{\n' + keys.map(k => pad + '  ' + JSON.stringify(k) + ': ' + (deep ? serialize(v[k], indent + 1) : JSON.stringify(v[k]))).join(',\n') + '\n' + pad + '}';
  }
  return JSON.stringify(v);
}
const js = '/* Generated by scripts/build-content.js from content/*.json. Do not edit by hand.\n' +
  '   Structure only: every text string lives in i18n-src/en/content.json (RS.t keys, CONTRACT §4). */\n' +
  '(function () {\n  var RS = window.RS = window.RS || {};\n  RS.content = ' + serialize(content, 1).replace(/\n/g, '\n') + ';\n})();\n';
fs.writeFileSync(OUT_JS, js);
fs.mkdirSync(path.dirname(OUT_TEXT), { recursive: true });
fs.writeFileSync(OUT_TEXT, JSON.stringify(text, null, 2) + '\n');
console.log(`build-content: js/content.js (${outSections.length} sections, ${Object.keys(outDeeds).length} deeds, ${outHadith.length} hadith, ${outBadges.length} badges, ` +
  `${outCats.length} categories, ${outTf.length} true/false, ${outMcq.length} MCQ, ${outDecks.length} decks, ${Object.keys(outCards).length} cards, ` +
  `${outDays.length} prep days, ${outGuide.length} guide topics) · i18n-src/en/content.json (${Object.keys(text).length} strings)`);

if (!process.argv.includes('--no-i18n')) {
  const code = require('./build-i18n.js')({});
  if (code) process.exit(code);
}
