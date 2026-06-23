function enhanceInterventionAccordions() {
  const list = document.getElementById('registryList');
  if (!list) return;

  list.querySelectorAll('article').forEach((card, index) => {
    if (card.dataset.accordionEnhanced === 'true') return;
    const first = card.children[0];
    const rest = Array.from(card.children).slice(1);
    if (!first || !rest.length) return;

    card.dataset.accordionEnhanced = 'true';
    card.classList.remove('space-y-4', 'p-4');
    card.classList.add('overflow-hidden');

    const header = document.createElement('button');
    header.type = 'button';
    header.className = 'w-full text-left p-4 hover:bg-slate-900/70 transition flex justify-between gap-4';
    header.innerHTML = `<div class="min-w-0 flex-1">${first.innerHTML}</div><span class="text-slate-500 text-lg accordion-icon">${index === 0 ? '−' : '+'}</span>`;

    const body = document.createElement('div');
    body.className = `border-t border-slate-800 p-4 space-y-4 ${index === 0 ? '' : 'hidden'}`;
    rest.forEach(el => body.appendChild(el));

    card.innerHTML = '';
    card.appendChild(header);
    card.appendChild(body);

    header.addEventListener('click', event => {
      if (event.target.closest('button[data-view], button[data-edit], button[data-action], button[data-delete]')) return;
      body.classList.toggle('hidden');
      header.querySelector('.accordion-icon').textContent = body.classList.contains('hidden') ? '+' : '−';
    });
  });
}

function applyInterventionRegistryFilters() {
  const searchInput = document.getElementById('interventionSearchInput');
  const statusFilter = document.getElementById('interventionStatusFilter');
  const list = document.getElementById('registryList');
  if (!searchInput || !statusFilter || !list) return;

  const query = String(searchInput.value || '').toLowerCase().trim();
  const status = String(statusFilter.value || '').toLowerCase().trim();
  let visibleCount = 0;

  list.querySelectorAll('article.krwmp-card').forEach(card => {
    const text = String(card.textContent || '').toLowerCase();
    const visible = (!query || text.includes(query)) && (!status || text.includes(status));
    card.classList.toggle('hidden', !visible);
    if (visible) visibleCount += 1;
  });

  let empty = list.querySelector('[data-filter-empty]');
  if (!empty) {
    empty = document.createElement('div');
    empty.dataset.filterEmpty = 'true';
    empty.className = 'krwmp-empty-state hidden';
    empty.textContent = 'No interventions match the current search/filter on this page.';
    list.prepend(empty);
  }
  empty.classList.toggle('hidden', visibleCount > 0 || (!query && !status));
}

const interventionObserver = new MutationObserver(() => {
  enhanceInterventionAccordions();
  applyInterventionRegistryFilters();
});
window.addEventListener('DOMContentLoaded', () => {
  const list = document.getElementById('registryList');
  if (list) interventionObserver.observe(list, { childList: true, subtree: false });
  document.getElementById('interventionSearchInput')?.addEventListener('input', applyInterventionRegistryFilters);
  document.getElementById('interventionStatusFilter')?.addEventListener('change', applyInterventionRegistryFilters);
  setTimeout(() => {
    enhanceInterventionAccordions();
    applyInterventionRegistryFilters();
  }, 500);
});