/* prep.js — PLACEHOLDER from the foundation build. The prep module replaces this file with the Ramadan Prep
   programme (assessment, 30-day plan, daily prompts, readiness). */
(function () {
  'use strict';
  var RS = window.RS;
  RS.router.register('prep', {
    tab: 'today',
    title: function () { return RS.t('core.placeholder.prep'); },
    render: function (view) {
      RS.topbar({ title: RS.t('core.placeholder.prep'), back: 'today' });
      view.innerHTML = RS.ui.hero({
        kicker: { icon: 'sprout', text: RS.t('core.placeholder.prep') },
        number: '0', unit: '%', label: RS.t('core.placeholder.label'),
        ring: { pct: 0 }
      }) + RS.ui.card({
        kicker: { icon: 'info', text: RS.t('core.placeholder.kicker') },
        title: RS.t('core.placeholder.title'),
        body: '<p>' + RS.esc(RS.t('core.placeholder.body')) + '</p>'
      });
    }
  });
})();
