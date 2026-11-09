/* learn.js — PLACEHOLDER from the foundation build. The learn module replaces this file with the Learn tab
   (true/false, multiple choice, flashcards with spaced repetition, daily 5, stats). */
(function () {
  'use strict';
  var RS = window.RS;
  RS.router.register('learn', {
    render: function (view) {
      RS.topbar({ title: RS.t('nav.learn'), sub: RS.t('core.app') });
      view.innerHTML = RS.ui.hero({
        kicker: { icon: 'graduation-cap', text: RS.t('nav.learn') },
        number: '0', unit: '/5', label: RS.t('core.placeholder.label'),
        ring: { pct: 0 },
        cta: { eyebrow: RS.t('core.placeholder.ctaEyebrow'), text: RS.t('core.placeholder.cta'), act: 'nav.go', arg: 'styleguide' }
      }) + RS.ui.card({
        kicker: { icon: 'info', text: RS.t('core.placeholder.kicker') },
        title: RS.t('core.placeholder.title'),
        body: '<p>' + RS.esc(RS.t('core.placeholder.body')) + '</p>'
      });
    }
  });
})();
