const statusBox = document.getElementById('statusBox');
const categoryIssueList = document.getElementById('categoryIssueList');
const solutionList = document.getElementById('solutionList');
const issuePagination = document.getElementById('issuePagination');
const solutionPagination = document.getElementById('solutionPagination');
const issueCategory = document.getElementById('issueCategory');
const solutionIssues = document.getElementById('solutionIssues');

let categories = [];
let issues = [];
let solutions = [];
let issuePage = 1;
let solutionPage = 1;
const issuePageSize = 5;
const solutionPageSize = 5;
let canCreateLibraryEntries = false;

function show(message, error = false) {
  window.KRWMP_UTILS.showStatus(statusBox, message, error);
}

const { apiRequest: json, escapeHtml } = window.KRWMP_UTILS;

async function initSidebar() {
  if (window.KRWMP_ENGINE) await window.KRWMP_ENGINE.assembleInterfaceContext('/sidebar.html', 'sidebar');
  await window.KRWMP_PRIVILEGES.protectPage('community_issues_review', 'view');
  canCreateLibraryEntries = window.KRWMP_PRIVILEGES.can('community_issues_review', 'create');
  document.getElementById('categoryForm')?.classList.toggle('hidden', !canCreateLibraryEntries);
  document.getElementById('issueForm')?.classList.toggle('hidden', !canCreateLibraryEntries);
  document.getElementById('solutionForm')?.classList.toggle('hidden', !canCreateLibraryEntries);
  document.querySelector('.krwmp-panel-section')?.classList.add('hidden');
  document.getElementById('section-data-layers')?.classList.add('hidden');
  document.getElementById('section-raster-layers')?.classList.add('hidden');
}

function groupedIssuesByCategory() {
  return categories.map(category => ({
    ...category,
    issues: issues.filter(issue => Number(issue.category_id) === Number(category.id)),
  }));
}

function totalPages(items, pageSize) {
  return Math.max(1, Math.ceil(items.length / pageSize));
}

function paginate(items, page, pageSize) {
  const start = (page - 1) * pageSize;
  return items.slice(start, start + pageSize);
}

function renderPagination(container, currentPage, pageCount, totalCount, label, onPageChange) {
  if (!container) return;
  if (!totalCount) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = `
    <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-3 text-xs text-slate-500 border-t border-slate-800 pt-3">
      <span>${label}: Page ${currentPage} of ${pageCount} | Total ${totalCount}</span>
      <div class="flex items-center gap-2">
        <button type="button" data-page="prev" class="bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded font-bold ${currentPage <= 1 ? 'opacity-50 pointer-events-none' : ''}">Previous</button>
        <button type="button" data-page="next" class="bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded font-bold ${currentPage >= pageCount ? 'opacity-50 pointer-events-none' : ''}">Next</button>
      </div>
    </div>
  `;

  container.querySelector('[data-page="prev"]')?.addEventListener('click', () => onPageChange(currentPage - 1));
  container.querySelector('[data-page="next"]')?.addEventListener('click', () => onPageChange(currentPage + 1));
}

function attachAccordionHandlers(root) {
  root.querySelectorAll('[data-accordion-toggle]').forEach(button => {
    button.addEventListener('click', () => {
      const target = root.querySelector(`[data-accordion-body="${button.dataset.accordionToggle}"]`);
      const icon = button.querySelector('[data-accordion-icon]');
      if (!target) return;
      target.classList.toggle('hidden');
      if (icon) icon.textContent = target.classList.contains('hidden') ? '+' : '−';
    });
  });
}

function populateSelects() {
  issueCategory.innerHTML = '<option value="">Select issue category</option>';
  categories.forEach(category => {
    const option = document.createElement('option');
    option.value = category.id;
    option.textContent = category.category_name;
    issueCategory.appendChild(option);
  });

  solutionIssues.innerHTML = '';
  groupedIssuesByCategory().forEach(category => {
    const group = document.createElement('optgroup');
    group.label = category.category_name;
    category.issues.forEach(issue => {
      const option = document.createElement('option');
      option.value = issue.id;
      option.textContent = issue.issue_name;
      group.appendChild(option);
    });
    solutionIssues.appendChild(group);
  });
}

function renderIssueStructure() {
  categoryIssueList.innerHTML = '';
  const grouped = groupedIssuesByCategory();
  const pageCount = totalPages(grouped, issuePageSize);
  if (issuePage > pageCount) issuePage = pageCount;

  if (!grouped.length) {
    categoryIssueList.innerHTML = '<p class="text-sm text-slate-500">No issue categories found.</p>';
    if (issuePagination) issuePagination.innerHTML = '';
    return;
  }

  paginate(grouped, issuePage, issuePageSize).forEach(category => {
    const card = document.createElement('article');
    card.className = 'bg-slate-950/50 border border-slate-800 rounded-lg overflow-hidden';
    const accordionId = `category-${category.id}`;
    const issueHtml = category.issues.length
      ? category.issues.map(issue => `
        <div class="bg-slate-900/70 border border-slate-800 rounded p-3">
          <div class="flex items-start justify-between gap-3">
            <div>
              <h4 class="text-sm font-bold text-slate-100">${escapeHtml(category.category_name)} - ${escapeHtml(issue.issue_name)}</h4>
              <p class="text-xs text-slate-500 mt-1">${escapeHtml(issue.description || '')}</p>
            </div>
            <span class="text-[10px] px-2 py-1 rounded bg-emerald-500/10 text-emerald-300 uppercase">${escapeHtml(issue.severity_level || 'medium')}</span>
          </div>
          <div class="text-[10px] text-slate-600 mt-2">Linked solutions: ${Number(issue.solution_count || 0)}</div>
        </div>
      `).join('')
      : '<p class="text-xs text-slate-500">No specific issues under this category.</p>';

    card.innerHTML = `
      <button type="button" data-accordion-toggle="${accordionId}" class="w-full text-left p-4 flex items-start justify-between gap-3 hover:bg-slate-900/70 transition">
        <div>
          <h3 class="font-bold text-slate-100">${escapeHtml(category.category_name)}</h3>
          <p class="text-xs text-slate-500 mt-1">${escapeHtml(category.description || '')}</p>
          <p class="text-[10px] text-emerald-400 mt-2 uppercase">${Number(category.issue_count || category.issues.length)} issues</p>
        </div>
        <span data-accordion-icon class="text-slate-500 text-lg font-bold">+</span>
      </button>
      <div data-accordion-body="${accordionId}" class="hidden border-t border-slate-800 p-4 space-y-2">${issueHtml}</div>
    `;
    categoryIssueList.appendChild(card);
  });

  attachAccordionHandlers(categoryIssueList);
  renderPagination(issuePagination, issuePage, pageCount, grouped.length, 'Issue Categories', page => {
    issuePage = page;
    renderIssueStructure();
  });
}

function renderSolutions() {
  solutionList.innerHTML = '';
  const pageCount = totalPages(solutions, solutionPageSize);
  if (solutionPage > pageCount) solutionPage = pageCount;

  if (!solutions.length) {
    solutionList.innerHTML = '<p class="text-sm text-slate-500">No solutions found.</p>';
    if (solutionPagination) solutionPagination.innerHTML = '';
    return;
  }

  paginate(solutions, solutionPage, solutionPageSize).forEach(solution => {
    const card = document.createElement('article');
    card.className = 'bg-slate-950/50 border border-slate-800 rounded-lg overflow-hidden';
    const accordionId = `solution-${solution.id}`;
    const links = Array.isArray(solution.linked_issues) ? solution.linked_issues : [];
    const linkHtml = links.length
      ? links.map(issue => `<span class="inline-flex px-2 py-1 rounded bg-emerald-500/10 text-emerald-300 text-[10px] font-bold uppercase mr-1 mb-1">${escapeHtml(issue.category_name)} - ${escapeHtml(issue.issue_name)}</span>`).join('')
      : '<span class="text-xs text-rose-300">No linked specific issues</span>';

    card.innerHTML = `
      <button type="button" data-accordion-toggle="${accordionId}" class="w-full text-left p-4 flex items-start justify-between gap-3 hover:bg-slate-900/70 transition">
        <div>
          <h3 class="font-bold text-slate-100">${escapeHtml(solution.solution_title)}</h3>
          <p class="text-xs text-slate-500 mt-1">Priority: ${escapeHtml(solution.priority_level || 'medium')} | Linked Issues: ${links.length}</p>
        </div>
        <span data-accordion-icon class="text-slate-500 text-lg font-bold">+</span>
      </button>
      <div data-accordion-body="${accordionId}" class="hidden border-t border-slate-800 p-4">
        <p class="text-sm text-slate-300 whitespace-pre-line">${escapeHtml(solution.solution_description || '')}</p>
        ${solution.recommended_actions ? `<p class="text-xs text-slate-400 mt-3 whitespace-pre-line"><span class="font-bold text-slate-300">Recommended Actions:</span><br>${escapeHtml(solution.recommended_actions)}</p>` : ''}
        ${solution.responsible_party ? `<p class="text-xs text-slate-500 mt-3"><span class="font-bold text-slate-300">Responsible Party:</span> ${escapeHtml(solution.responsible_party)}</p>` : ''}
        ${solution.estimated_timeframe ? `<p class="text-xs text-slate-500 mt-1"><span class="font-bold text-slate-300">Timeframe:</span> ${escapeHtml(solution.estimated_timeframe)}</p>` : ''}
        <div class="mt-3 border-t border-slate-800 pt-3">${linkHtml}</div>
      </div>
    `;
    solutionList.appendChild(card);
  });

  attachAccordionHandlers(solutionList);
  renderPagination(solutionPagination, solutionPage, pageCount, solutions.length, 'Solutions', page => {
    solutionPage = page;
    renderSolutions();
  });
}

async function loadLibrary() {
  const [catData, issueData, solData] = await Promise.all([
    json('/api/issue-categories'),
    json('/api/specific-issues'),
    json('/api/solutions'),
  ]);
  categories = catData.categories || [];
  issues = issueData.issues || [];
  solutions = solData.solutions || [];
  if (issuePage > totalPages(categories, issuePageSize)) issuePage = 1;
  if (solutionPage > totalPages(solutions, solutionPageSize)) solutionPage = 1;
  populateSelects();
  renderIssueStructure();
  renderSolutions();
}

function getMultiSelectValues(select) {
  return Array.from(select.selectedOptions).map(option => option.value);
}

function validateCategory(form) {
  const name = form.category_name.value.trim();
  if (name.length < 3) throw new Error('Issue category name must be at least 3 characters.');
}

function validateIssue(form) {
  const categoryId = form.category_id.value;
  const name = form.issue_name.value.trim();
  if (!categoryId) throw new Error('Please select an issue category.');
  if (name.length < 3) throw new Error('Specific issue name must be at least 3 characters.');
}

function validateSolution(form) {
  const title = form.solution_title.value.trim();
  const description = form.solution_description.value.trim();
  const selectedIssues = getMultiSelectValues(solutionIssues);
  if (title.length < 3) throw new Error('Solution title must be at least 3 characters.');
  if (description.length < 10) throw new Error('Solution description must be at least 10 characters.');
  if (!selectedIssues.length) throw new Error('Please link the solution to at least one specific issue.');
}

document.getElementById('categoryForm').addEventListener('submit', async event => {
  event.preventDefault();
  if (!canCreateLibraryEntries) return show('You do not have create access for the issue and solution library.', true);
  const form = event.target;
  try {
    validateCategory(form);
    const body = Object.fromEntries(new FormData(form));
    await json('/api/issue-categories', {
      method: 'POST',
      body,
    });
    form.reset();
    issuePage = 1;
    show('Issue category saved.');
    await loadLibrary();
  } catch (error) {
    show(error.message, true);
  }
});

document.getElementById('issueForm').addEventListener('submit', async event => {
  event.preventDefault();
  if (!canCreateLibraryEntries) return show('You do not have create access for the issue and solution library.', true);
  const form = event.target;
  try {
    validateIssue(form);
    const body = Object.fromEntries(new FormData(form));
    await json('/api/specific-issues', {
      method: 'POST',
      body,
    });
    form.reset();
    issuePage = 1;
    show('Specific issue saved.');
    await loadLibrary();
  } catch (error) {
    show(error.message, true);
  }
});

document.getElementById('solutionForm').addEventListener('submit', async event => {
  event.preventDefault();
  if (!canCreateLibraryEntries) return show('You do not have create access for the issue and solution library.', true);
  const form = event.target;
  try {
    validateSolution(form);
    const body = Object.fromEntries(new FormData(form));
    body.issue_ids = getMultiSelectValues(solutionIssues);
    await json('/api/solutions', {
      method: 'POST',
      body,
    });
    form.reset();
    solutionPage = 1;
    show('Recommended solution saved and linked to selected issues.');
    await loadLibrary();
  } catch (error) {
    show(error.message, true);
  }
});

document.getElementById('refreshBtn')?.addEventListener('click', () => loadLibrary().catch(error => show(error.message, true)));

(async () => {
  await initSidebar();
  await loadLibrary();
})().catch(error => show(error.message, true));
