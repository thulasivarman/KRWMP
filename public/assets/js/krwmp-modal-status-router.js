(() => {
  if (window.__KRWMP_MODAL_STATUS_ROUTER__) return;
  window.__KRWMP_MODAL_STATUS_ROUTER__ = true;

  const statusSelectors = ['#statusBox', '[data-modal-routable-status]'];
  const managed = new Map();

  function ensureRecord(statusEl) {
    if (!statusEl || managed.has(statusEl)) return managed.get(statusEl);
    const placeholder = document.createComment(`krwmp-status-placeholder:${statusEl.id || 'status'}`);
    statusEl.parentNode?.insertBefore(placeholder, statusEl);
    const record = { placeholder, originalParent: statusEl.parentNode };
    managed.set(statusEl, record);
    return record;
  }

  function activeDialog() {
    const openDialogs = Array.from(document.querySelectorAll('dialog[open]'));
    return openDialogs.length ? openDialogs[openDialogs.length - 1] : null;
  }

  function preferredStatusHost(dialog) {
    if (!dialog) return null;
    return dialog.querySelector('[data-modal-status-host]')
      || dialog.querySelector('.krwmp-modal-body')
      || dialog.querySelector('form')
      || dialog;
  }

  function moveStatusIntoDialog(statusEl, dialog) {
    if (!statusEl || !dialog || dialog.contains(statusEl)) return;
    ensureRecord(statusEl);
    const host = preferredStatusHost(dialog);
    if (!host) return;
    statusEl.dataset.krwmpRoutedToModal = dialog.id || 'open-dialog';
    host.insertBefore(statusEl, host.firstChild);
  }

  function restoreStatus(statusEl) {
    const record = managed.get(statusEl);
    if (!record?.placeholder?.parentNode || record.placeholder.nextSibling === statusEl) return;
    delete statusEl.dataset.krwmpRoutedToModal;
    record.placeholder.parentNode.insertBefore(statusEl, record.placeholder.nextSibling);
  }

  function routeStatuses() {
    const dialog = activeDialog();
    const statuses = statusSelectors.flatMap(selector => Array.from(document.querySelectorAll(selector)));
    statuses.forEach(statusEl => {
      ensureRecord(statusEl);
      if (dialog) moveStatusIntoDialog(statusEl, dialog);
      else restoreStatus(statusEl);
    });
  }

  document.addEventListener('submit', () => window.setTimeout(routeStatuses, 0), true);
  document.addEventListener('click', () => window.setTimeout(routeStatuses, 0), true);
  document.addEventListener('close', routeStatuses, true);
  document.addEventListener('cancel', routeStatuses, true);

  const observer = new MutationObserver(routeStatuses);
  observer.observe(document.documentElement, {
    subtree: true,
    attributes: true,
    attributeFilter: ['open']
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', routeStatuses, { once: true });
  } else {
    routeStatuses();
  }
})();
