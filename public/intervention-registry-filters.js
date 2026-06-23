(() => {
  const searchInput = document.getElementById('interventionSearchInput');
  const statusFilter = document.getElementById('interventionStatusFilter');
  const registryList = document.getElementById('registryList');
  if (!searchInput || !statusFilter || !registryList) return;

  const normalize = value => String(value || '').toLowerCase().trim();

  function applyFilters() {
    const query = normalize(searchInput.value);
    const status = normalize(statusFilter.value);
    let visibleCount = 0;

    registryList.querySelectorAll('article.krwmp-card').forEach(card => {
      const text = normalize(card.textContent);
      const statusMatch = !status || text.includes(status);
      const searchMatch = !query || text.includes(query);
      const visible = statusMatch && searchMatch;
      card.classList.toggle('hidden', !visible);
      if (visible) visibleCount += 1;
    });

    let empty = registryList.querySelector('[data-filter-empty]');
    if (!empty) {
      empty = document.createElement('div');
      empty.dataset.filterEmpty = 'true';
      empty.className = 'krwmp-empty-state hidden';
      empty.textContent = 'No interventions match the current search/filter on this page.';
      registryList.prepend(empty);
    }
    empty.classList.toggle('hidden', visibleCount > 0 || (!query && !status));
  }

  searchInput.addEventListener('input', applyFilters);
  statusFilter.addEventListener('change', applyFilters);
  document.getElementById('refreshBtn')?.addEventListener('click', () => setTimeout(applyFilters, 400));
  registryList.addEventListener('click', event => {
    if (event.target.closest('#prevPageBtn, #nextPageBtn')) setTimeout(applyFilters, 100);
  });
  document.addEventListener('DOMContentLoaded', applyFilters);
  setTimeout(applyFilters, 800);
})();