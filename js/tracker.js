/* tracker.js — PLACEHOLDER from the foundation build. The tracker module replaces this file with Today, Quran,
   Me (progress, badges, report, settings, data, guide), modes, journal and year-round cards. */
(function () {
  'use strict';
  var RS = window.RS;
  function placeholder(view, tab, icon) {
    var h = RS.hijri();
    RS.topbar({ title: RS.t('nav.' + tab), sub: RS.fmt.hijri() });
    view.innerHTML = RS.ui.hero({
      kicker: { icon: icon, text: RS.t('nav.' + tab) },
      number: String(h.day),
      label: RS.t('core.hijri.monthYear', { month: RS.hijriMonth(h.month), year: h.year }),
      ring: { pct: Math.round(h.day / 30 * 100) },
      metrics: [{ label: RS.t('core.placeholder.mode'), value: RS.t('core.mode.' + RS.appMode()) }, { label: RS.t('core.placeholder.version'), value: RS.VERSION }],
      cta: { eyebrow: RS.t('core.placeholder.ctaEyebrow'), text: RS.t('core.placeholder.cta'), act: 'nav.go', arg: 'styleguide' }
    }) + RS.ui.card({
      kicker: { icon: 'info', text: RS.t('core.placeholder.kicker') },
      title: RS.t('core.placeholder.title'),
      body: '<p>' + RS.esc(RS.t('core.placeholder.body')) + '</p>'
    });
  }
  RS.router.register('today', { render: function (el) { placeholder(el, 'today', 'circle-check'); } });
  RS.router.register('quran', { render: function (el) { placeholder(el, 'quran', 'book-open'); } });
  RS.router.register('me', { render: function (el) { placeholder(el, 'me', 'user'); } });
})();
