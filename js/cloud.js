/* cloud.js — PLACEHOLDER from the foundation build. The cloud module replaces this file with accounts, sync,
   competitions (participant + organiser), push, share, prayer times and AI helpers. */
(function () {
  'use strict';
  var RS = window.RS;
  RS.router.register('compete', {
    render: function (view) {
      RS.topbar({ title: RS.t('nav.compete'), sub: RS.t('core.app') });
      view.innerHTML = RS.ui.hero({
        kicker: { icon: 'trophy', text: RS.t('nav.compete') },
        text: RS.t('core.placeholder.label'),
        cta: { eyebrow: RS.t('core.placeholder.ctaEyebrow'), text: RS.t('core.placeholder.cta'), act: 'nav.go', arg: 'styleguide' }
      }) + RS.ui.card({
        kicker: { icon: 'info', text: RS.t('core.placeholder.kicker') },
        title: RS.t('core.placeholder.title'),
        body: '<p>' + RS.esc(RS.t('core.placeholder.body')) + '</p>'
      });
    }
  });
})();
