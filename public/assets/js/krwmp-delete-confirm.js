(() => {
  if (window.__KRWMP_DELETE_CONFIRM_BRIDGE__) return;
  window.__KRWMP_DELETE_CONFIRM_BRIDGE__ = true;

  const deleteSelector = [
    '[data-delete]',
    '[data-delete-action]',
    '[data-delete-member]',
    '[data-modal-delete-member]',
    '[data-delete-user]',
    '[data-user-delete]',
    '[data-delete-role]',
    '[data-role-delete]',
    '[data-delete-layer]',
    '[data-layer-delete]',
    '[data-delete-record]',
    '[data-remove]',
    '[data-remove-record]'
  ].join(',');

  const nativeConfirm = typeof window.confirm === 'function' ? window.confirm.bind(window) : null;
  let allowExistingHandler = false;

  function titleFor(trigger) {
    if (trigger.matches('[data-delete-action]')) return 'Delete Action';
    if (trigger.matches('[data-delete-member], [data-modal-delete-member]')) return 'Delete Member';
    if (trigger.matches('[data-delete-user], [data-user-delete]')) return 'Delete User';
    if (trigger.matches('[data-delete-role], [data-role-delete]')) return 'Delete Role';
    if (trigger.matches('[data-delete-layer], [data-layer-delete]')) return 'Delete Layer';
    return 'Confirm Delete';
  }

  function messageFor(trigger) {
    const explicit = trigger.dataset.confirmMessage || trigger.getAttribute('aria-label') || '';
    if (explicit && !/^delete$/i.test(explicit.trim())) return explicit.trim();
    if (trigger.matches('[data-delete-action]')) return 'Delete this action record? This operation cannot be undone.';
    if (trigger.matches('[data-delete-member], [data-modal-delete-member]')) return 'Delete this member record? This operation cannot be undone.';
    if (trigger.matches('[data-delete-user], [data-user-delete]')) return 'Delete this user account? This operation cannot be undone.';
    if (trigger.matches('[data-delete-role], [data-role-delete]')) return 'Delete this role or privilege record? This operation cannot be undone.';
    if (trigger.matches('[data-delete-layer], [data-layer-delete]')) return 'Delete this GIS layer record? This operation cannot be undone.';
    return 'Delete this record? This operation cannot be undone.';
  }

  function temporarilyAllowNativeConfirm() {
    if (!nativeConfirm) return () => {};
    const previousConfirm = window.confirm;
    window.confirm = () => true;
    return () => {
      window.confirm = previousConfirm;
    };
  }

  document.addEventListener('click', async event => {
    const trigger = event.target?.closest?.(deleteSelector);
    if (!trigger) return;
    if (allowExistingHandler || trigger.dataset.krwmpDeleteConfirmed === 'true') return;
    if (trigger.disabled || trigger.getAttribute('aria-disabled') === 'true' || trigger.classList.contains('hidden')) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    const confirmed = await window.KRWMP_UTILS.confirmAction({
      title: titleFor(trigger),
      message: messageFor(trigger),
      confirmText: 'Delete',
      cancelText: 'Cancel',
      variant: 'danger'
    });

    if (!confirmed) return;

    const restoreConfirm = temporarilyAllowNativeConfirm();
    allowExistingHandler = true;
    trigger.dataset.krwmpDeleteConfirmed = 'true';
    try {
      trigger.click();
    } finally {
      window.setTimeout(() => {
        allowExistingHandler = false;
        delete trigger.dataset.krwmpDeleteConfirmed;
        restoreConfirm();
      }, 0);
    }
  }, true);
})();
