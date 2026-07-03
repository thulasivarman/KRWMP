// Compatibility patch for Intervention Registry action modal.
// Fixes new action modal crash when personFromAction receives null from resetActionForm().
(function () {
  const utils = window.KRWMP_UTILS || {};
  const escapeHtml = utils.escapeHtml || ((value) => String(value ?? ''));

  window.personFromAction = function personFromAction(action = {}) {
    const safeAction = action || {};
    if (!safeAction.responsible_person_id) return null;

    return {
      id: safeAction.responsible_person_id,
      full_name: safeAction.responsible_person_full_name || safeAction.officer_name || '',
      phone_number: safeAction.responsible_person_phone_number || safeAction.officer_contact || '',
      email: safeAction.responsible_person_email || '',
      dsd: safeAction.responsible_person_dsd || '',
      gnd: safeAction.responsible_person_gnd || '',
    };
  };

  if (!document.querySelector('script[data-intervention-registry-performance]')) {
    const script = document.createElement('script');
    script.src = '/intervention-registry-performance.js';
    script.defer = true;
    script.dataset.interventionRegistryPerformance = 'true';
    document.body.appendChild(script);
  }

  // Keep a visible marker for debugging without interrupting users.
  console.debug('Intervention Registry action person null-safety patch loaded.', escapeHtml('OK'));
})();
