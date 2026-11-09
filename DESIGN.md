# Ramadan Strivers — "Pine" design system

A restrained, premium system modelled on the *Aubergine* reference (Oura / Apple Fitness / Revolut feel):
**soft light pages, with the one important thing on each screen presented as a glowing dark object** —
re-coloured from aubergine to a deep **pine green** with a **mint** accent (the app's Islamic green identity;
no purple, no violet, no gold).

## 1. Principles
- **One dark object on a light page.** Each screen has exactly one *hero object*: a near-black pine card that
  looks the same in light and dark mode. Everything else is plain cards on paper.
- **One accent, used sparingly.** Emerald by day, mint by night — only for progress, links, toggles, icons and
  small marks. Big buttons use the dark pine gradient, never a bright green fill.
- **One font.** Manrope, wide weight range, tabular figures. Huge numbers thin (300), titles 650–700 with tight
  tracking, labels 500, body 400.
- **Restraint.** No emoji, no gold, no sparkles, no gradient text, no confetti, no boxed stat tiles with corner
  icons, no shadows on everything. Icons are thin line icons (Lucide, ISC licence).

## 2. Tokens (CSS custom properties, defined in `css/app.css`)

| Token | Light | Dark | Use |
|---|---|---|---|
| `--paper` | `#F2F5F3` sage-grey | `#070D0A` | page background |
| `--card` | `#FFFFFF` | `#0F1A15` | cards, sheets |
| `--card-2` | `#F7F9F8` | `#13211B` | inset rows, inputs |
| `--ink` | `#101915` | `#EEF8F2` | primary text |
| `--ink-2` | `#45524C` | `#C2D4CB` | secondary text |
| `--ink-3` | `#5F6C66` | `#93A69D` | tertiary text, captions |
| `--hairline` | `rgba(16,25,21,.09)` | `rgba(238,248,242,.09)` | 1px separators |
| `--accent` | `#047857` emerald | `#6EE7B7` mint | progress, links, toggles, icons |
| `--accent-soft` | `rgba(4,120,87,.10)` | `rgba(110,231,183,.12)` | selected rows, chips |
| `--accent-ink` | `#03684C` | `#6EE7B7` | accent text on an `--accent-soft` tint (active chip, Sahih/Quran grade) |
| `--danger` | `#B42318` | `#FDA29B` | destructive text only |

**Hero object (identical in both themes)**
- background: `radial-gradient(circle at 88% 0%, rgba(52,211,153,.24), transparent 55%), linear-gradient(200deg, #143A2D 0%, #0B2219 46%, #06130F 100%)`
- edge: `1px solid rgba(167,243,208,.28)`; top highlight: `inset 0 1px 0 rgba(236,253,245,.14)`
- shadow: `0 24px 48px -24px rgba(6,95,70,.55), 0 2px 6px rgba(6,40,30,.18)`
- ink `#EEF8F2`, ink-2 `#B6CEC3`, ink-3 `#8FB0A2`, accent `#6EE7B7`, hairline `rgba(167,243,208,.20)`
- progress ring: track `rgba(167,243,208,.16)`, stroke gradient `#ECFDF5 → #6EE7B7`, glow halo `rgba(110,231,183,.35)` blur

**Buttons and navigation**
- Primary button (day): pine pill `linear-gradient(180deg,#16422F,#0B2219)`, white text. (night): mint pill `#A7F3D0`, text `#052E22`.
- Secondary button: transparent with 1px hairline border, ink text. Destructive: text in `--danger`.
- Glass CTA (inside hero): `rgba(236,253,245,.08)` fill, `1px rgba(167,243,208,.22)` border, blur; a small eyebrow
  label above the text; a round mint (`#A7F3D0`) arrow button with a `#052E22` arrow.
- Bottom nav: floating pine bar (`#0E2A20 → #0A1F17`), inactive icons `#B6CEC3`; the active tab is a mint pill
  (`#A7F3D0`) with icon + label in `#052E22`.

All text/background pairs above were checked for WCAG AA (lowest 5.0:1).

## 3. Type
`Manrope` (OFL, Google Fonts, weights 200–800) with `font-variant-numeric: tabular-nums`.
- Display number: 300, 56–72px, `letter-spacing: -0.04em`, line-height 1.
- Title: 650–700, 20–28px, `-0.02em`. Section label / kicker: 500–600, 12–13px, `0.04em`, uppercase optional.
- Body: 400, 15–16px, line-height 1.5. Caption: 500, 12–13px.
- Script fallbacks: Noto Sans Arabic (ar, ur), Noto Sans Bengali (bn), Noto Sans Devanagari (hi), system CJK (zh);
  Quranic and dua text in Amiri. The honorifics ﷺ ﷻ ﷲ come from 'RS Honorific' (`vendor/honorific.woff2`, a
  3-glyph Noto Naskh Arabic subset, OFL), listed right after Manrope in every stack, so they never fall back to
  whatever the device has.

## 4. Shape and space
Radii: **28px** hero, **22px** cards, **16px** inner blocks/sheets, **12px** inputs, **999px** pills.
Spacing scale 4/8/12/16/20/24/32. Lists are **hairline-separated rows inside one card**, never nested boxes.
Minimum touch target 44px. Works from **320px** wide.

## 5. Card grammar (repeat everywhere)
1. a small **kicker** at the top: line icon + label;
2. one **huge thin number** (e.g. `17` *days until Ramadan*);
3. **metrics** as label-above-value pairs separated by thin vertical hairlines (not boxes);
4. a **progress ring** with a soft glow behind it;
5. a **glass pill CTA** with an eyebrow and a round mint arrow.

## 6. Motion and accessibility
- 150–250ms ease-out transitions; `prefers-reduced-motion: reduce` removes transforms/flips (crossfade only).
- A sheet being dragged still follows the finger under reduced motion (direct manipulation is not animation).
- Toasts pause while hovered or focused; error toasts have a close button and stay until closed.
- Visible focus ring `0 0 0 3px` accent at 35%; semantic buttons; `aria-current` on the active tab;
  icons are `aria-hidden` unless they carry meaning; `lang`/`dir` set per language (RTL for Arabic and Urdu).
- Both themes are token-driven (`[data-theme]` plus `prefers-color-scheme` for "System").

## 7. Don'ts
No emoji · no gold · no sparkles · no gradient text · no bright mid-green fills · no boxed stat tiles with
corner icons · no drop shadows on ordinary cards · no more than one hero object per screen.
Icons: no confetti/party or sparkle icons (use `gift`, `moon` or `calendar-check` to celebrate); `moon-star` is the
one exception and is reserved for last-ten-nights / Laylat al-Qadr content — use `moon` for Ramadan kickers and nav.
