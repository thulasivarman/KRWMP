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
      if (event.target.closest('button[data-edit], button[data-delete]')) return;
      body.classList.toggle('hidden');
      header.querySelector('.accordion-icon').textContent = body.classList.contains('hidden') ? '+' : '−';
    });
  });
}

const interventionObserver = new MutationObserver(() => enhanceInterventionAccordions());
window.addEventListener('DOMContentLoaded', () => {
  const list = document.getElementById('registryList');
  if (list) interventionObserver.observe(list, { childList: true, subtree: false });
  setTimeout(enhanceInterventionAccordions, 500);
});
