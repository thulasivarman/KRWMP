const { apiRequest: json, escapeHtml } = window.KRWMP_UTILS;

const statusBox = document.getElementById('statusBox');
const categoryIssueList = document.getElementById('categoryIssueList');
const solutionList = document.getElementById('solutionList');
const issuePagination = document.getElementById('issuePagination');
const solutionPagination = document.getElementById('solutionPagination');
const issueCategory = document.getElementById('issueCategory');
const solutionIssues = document.getElementById('solutionIssues');
const libraryActionButtons = document.getElementById('libraryActionButtons');
const categoryModal = document.getElementById('categoryModal');
const issueModal = document.getElementById('issueModal');
const solutionModal = document.getElementById('solutionModal');
const categoryForm = document.getElementById('categoryForm');
const issueForm = document.getElementById('issueForm');
const solutionForm = document.getElementById('solutionForm');

let categories = [];
let issues = [];
let solutions = [];
let issuePage = 1;
let solutionPage = 1;
let canCreateLibraryEntries = false;
let canUpdateLibraryEntries = false;
let canDeleteLibraryEntries = false;

const issuePageSize = 5;
const solutionPageSize = 5;

function show(message, error = false) {
  window.KRWMP_UTILS.showStatus(statusBox, message, error);
}

async function initSidebar() {
  if (window.KRWMP_ENGINE) await window.KRWMP_ENGINE.assembleInterfaceContext('/sidebar.html', 'sidebar');
  await window.KRWMP_PRIVILEGES.protectPage('community_issues_review', 'view');
  canCreateLibraryEntries = window.KRWMP_PRIVILEGES.can('community_issues_review', 'create');
  canUpdateLibraryEntries = window.KRWMP_PRIVILEGES.can('community_issues_review', 'update');
  canDeleteLibraryEntries = window.KRWMP_PRIVILEGES.can('community_issues_review', 'delete');
  libraryActionButtons?.classList.toggle('hidden', !canCreateLibraryEntries);
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
    <nav class="krwmp-pagination" aria-label="${escapeHtml(label)} pagination">
      <span class="krwmp-pagination-meta">${escapeHtml(label)}: Page ${currentPage} of ${pageCount} | Total ${totalCount}</span>
      <div class="krwmp-pagination-controls">
        <button type="button" data-page="prev" class="krwmp-btn krwmp-btn-secondary krwmp-btn-sm ${currentPage <= 1 ? 'opacity-50 pointer-events-none' : ''}">Previous</button>
        <button type="button" data-page="next" class="krwmp-btn krwmp-btn-secondary krwmp-btn-sm ${currentPage >= pageCount ? 'opacity-50 pointer-events-none' : ''}">Next</button>
      </div>
    </nav>
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
      if (icon) icon.textContent = target.classList.contains('hidden') ? '+' : '-';
    });
  });
}

function actionButtons(type, id) {
  return `
    <div class="krwmp-table-actions">
      <button type="button" data-edit-${type}="${escapeHtml(id)}" class="krwmp-btn krwmp-btn-secondary krwmp-btn-sm ${canUpdateLibraryEntries ? '' : 'hidden'}">Edit</button>
      <button type="button" data-delete-${type}="${escapeHtml(id)}" class="krwmp-btn krwmp-btn-danger krwmp-btn-sm ${canDeleteLibraryEntries ? '' : 'hidden'}">Delete</button>
    </div>
  `;
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
    categoryIssueList.innerHTML = '<div class="krwmp-empty-state">No issue categories found.</div>';
    issuePagination.innerHTML = '';
    return;
  }

  paginate(grouped, issuePage, issuePageSize).forEach(category => {
    const card = document.createElement('article');
    card.className = 'krwmp-card overflow-hidden p-0';
    const accordionId = `category-${category.id}`;
    const issueHtml = category.issues.length
      ? category.issues.map(issue => `
        <div class="bg-slate-900/70 border border-slate-800 rounded p-3">
          <div class="flex items-start justify-between gap-3">
            <div>
              <h4 class="text-sm font-bold text-slate-100">${escapeHtml(category.category_name)} - ${escapeHtml(issue.issue_name)}</h4>
              <p class="text-xs text-slate-500 mt-1">${escapeHtml(issue.description || '')}</p>
              <div class="text-[10px] text-slate-600 mt-2">Linked solutions: ${Number(issue.solution_count || 0)}</div>
            </div>
            <div class="flex flex-col items-end gap-2">
              <span class="krwmp-badge krwmp-badge-warning">${escapeHtml(issue.severity_level || 'medium')}</span>
              ${actionButtons('issue', issue.id)}
            </div>
          </div>
        </div>
      `).join('')
      : '<div class="krwmp-empty-state">No specific issues under this category.</div>';

    card.innerHTML = `
      <div class="p-4 flex items-start justify-between gap-3 hover:bg-slate-900/70 transition">
        <button type="button" data-accordion-toggle="${accordionId}" class="min-w-0 flex-1 text-left">
          <h3 class="font-bold text-slate-100">${escapeHtml(category.category_name)}</h3>
          <p class="text-xs text-slate-500 mt-1">${escapeHtml(category.description || '')}</p>
          <p class="text-[10px] text-emerald-400 mt-2 uppercase">${Number(category.issue_count || category.issues.length)} issues</p>
        </button>
        <div class="flex items-start gap-3">
          ${actionButtons('category', category.id)}
          <button type="button" data-accordion-toggle="${accordionId}" class="text-slate-500 text-lg font-bold"><span data-accordion-icon>+</span></button>
        </div>
      </div>
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
    solutionList.innerHTML = '<div class="krwmp-empty-state">No solutions found.</div>';
    solutionPagination.innerHTML = '';
    return;
  }

  paginate(solutions, solutionPage, solutionPageSize).forEach(solution => {
    const card = document.createElement('article');
    card.className = 'krwmp-card overflow-hidden p-0';
    const accordionId = `solution-${solution.id}`;
    const links = Array.isArray(solution.linked_issues) ? solution.linked_issues : [];
    const linkHtml = links.length
      ? links.map(issue => `<span class="krwmp-badge krwmp-badge-success mr-1 mb-1">${escapeHtml(issue.category_name)} - ${escapeHtml(issue.issue_name)}</span>`).join('')
      : '<span class="krwmp-badge krwmp-badge-danger">No linked specific issues</span>';

    card.innerHTML = `
      <div class="p-4 flex items-start justify-between gap-3 hover:bg-slate-900/70 transition">
        <button type="button" data-accordion-toggle="${accordionId}" class="min-w-0 flex-1 text-left">
          <h3 class="font-bold text-slate-100">${escapeHtml(solution.solution_title)}</h3>
          <p class="text-xs text-slate-500 mt-1">Priority: ${escapeHtml(solution.priority_level || 'medium')} | Linked Issues: ${links.length}</p>
        </button>
        <div class="flex items-start gap-3">
          ${actionButtons('solution', solution.id)}
          <button type="button" data-accordion-toggle="${accordionId}" class="text-slate-500 text-lg font-bold"><span data-accordion-icon>+</span></button>
        </div>
      </div>
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

function setMultiSelectValues(select, values = []) {
  const selected = new Set(values.map(String));
  Array.from(select.options).forEach(option => { option.selected = selected.has(String(option.value)); });
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

function openCategoryModal(category = null) {
  categoryForm.reset();
  categoryForm.elements.id.value = category?.id || '';
  categoryForm.category_name.value = category?.category_name || '';
  categoryForm.description.value = category?.description || '';
  categoryForm.severity_level.value = category?.severity_level || 'medium';
  document.getElementById('categoryModalTitle').textContent = category ? 'Edit Issue Category' : 'Add Issue Category';
  categoryModal.showModal();
}

function openIssueModal(issue = null) {
  issueForm.reset();
  issueForm.elements.id.value = issue?.id || '';
  issueForm.category_id.value = issue?.category_id || '';
  issueForm.issue_name.value = issue?.issue_name || '';
  issueForm.description.value = issue?.description || '';
  issueForm.severity_level.value = issue?.severity_level || 'medium';
  document.getElementById('issueModalTitle').textContent = issue ? 'Edit Specific Issue' : 'Add Specific Issue';
  issueModal.showModal();
}

function openSolutionModal(solution = null) {
  solutionForm.reset();
  solutionForm.elements.id.value = solution?.id || '';
  solutionForm.solution_title.value = solution?.solution_title || '';
  solutionForm.solution_description.value = solution?.solution_description || '';
  solutionForm.recommended_actions.value = solution?.recommended_actions || '';
  solutionForm.responsible_party.value = solution?.responsible_party || '';
  solutionForm.estimated_timeframe.value = solution?.estimated_timeframe || '';
  solutionForm.priority_level.value = solution?.priority_level || 'medium';
  setMultiSelectValues(solutionIssues, (solution?.linked_issues || []).map(issue => issue.id));
  document.getElementById('solutionModalTitle').textContent = solution ? 'Edit Solution' : 'Add Solution';
  solutionModal.showModal();
}

async function saveCategory(event) {
  event.preventDefault();
  if (!categoryForm.elements.id.value && !canCreateLibraryEntries) return show('You do not have create access for the issue and solution library.', true);
  if (categoryForm.elements.id.value && !canUpdateLibraryEntries) return show('You do not have update access for the issue and solution library.', true);
  try {
    validateCategory(categoryForm);
    const body = Object.fromEntries(new FormData(categoryForm));
    const id = body.id;
    delete body.id;
    await json(id ? `/api/issue-categories/${id}` : '/api/issue-categories', { method: id ? 'PUT' : 'POST', body });
    categoryModal.close();
    issuePage = 1;
    show('Issue category saved.');
    await loadLibrary();
  } catch (error) {
    show(error.message, true);
  }
}

async function saveIssue(event) {
  event.preventDefault();
  if (!issueForm.elements.id.value && !canCreateLibraryEntries) return show('You do not have create access for the issue and solution library.', true);
  if (issueForm.elements.id.value && !canUpdateLibraryEntries) return show('You do not have update access for the issue and solution library.', true);
  try {
    validateIssue(issueForm);
    const body = Object.fromEntries(new FormData(issueForm));
    const id = body.id;
    delete body.id;
    await json(id ? `/api/specific-issues/${id}` : '/api/specific-issues', { method: id ? 'PUT' : 'POST', body });
    issueModal.close();
    issuePage = 1;
    show('Specific issue saved.');
    await loadLibrary();
  } catch (error) {
    show(error.message, true);
  }
}

async function saveSolution(event) {
  event.preventDefault();
  if (!solutionForm.elements.id.value && !canCreateLibraryEntries) return show('You do not have create access for the issue and solution library.', true);
  if (solutionForm.elements.id.value && !canUpdateLibraryEntries) return show('You do not have update access for the issue and solution library.', true);
  try {
    validateSolution(solutionForm);
    const body = Object.fromEntries(new FormData(solutionForm));
    const id = body.id;
    delete body.id;
    body.issue_ids = getMultiSelectValues(solutionIssues);
    await json(id ? `/api/solutions/${id}` : '/api/solutions', { method: id ? 'PUT' : 'POST', body });
    solutionModal.close();
    solutionPage = 1;
    show('Recommended solution saved.');
    await loadLibrary();
  } catch (error) {
    show(error.message, true);
  }
}

async function deleteRecord(type, id) {
  if (!canDeleteLibraryEntries) return show('You do not have delete access for the issue and solution library.', true);
  const labels = { category: 'issue category', issue: 'specific issue', solution: 'solution' };
  if (!confirm(`Delete this ${labels[type]}? It will be deactivated and hidden from active lists.`)) return;
  const urls = { category: `/api/issue-categories/${id}`, issue: `/api/specific-issues/${id}`, solution: `/api/solutions/${id}` };
  try {
    await json(urls[type], { method: 'DELETE' });
    show(`${labels[type][0].toUpperCase()}${labels[type].slice(1)} deleted.`);
    await loadLibrary();
  } catch (error) {
    show(error.message, true);
  }
}

function bindEvents() {
  document.getElementById('addCategoryBtn')?.addEventListener('click', () => openCategoryModal());
  document.getElementById('addIssueBtn')?.addEventListener('click', () => openIssueModal());
  document.getElementById('addSolutionBtn')?.addEventListener('click', () => openSolutionModal());
  document.getElementById('refreshBtn')?.addEventListener('click', () => loadLibrary().catch(error => show(error.message, true)));
  document.querySelectorAll('[data-close-modal]').forEach(button => {
    button.addEventListener('click', () => document.getElementById(button.dataset.closeModal)?.close());
  });
  categoryForm.addEventListener('submit', saveCategory);
  issueForm.addEventListener('submit', saveIssue);
  solutionForm.addEventListener('submit', saveSolution);

  categoryIssueList.addEventListener('click', event => {
    const editCategory = event.target.closest('[data-edit-category]');
    const deleteCategory = event.target.closest('[data-delete-category]');
    const editIssue = event.target.closest('[data-edit-issue]');
    const deleteIssue = event.target.closest('[data-delete-issue]');
    if (editCategory) return openCategoryModal(categories.find(item => String(item.id) === String(editCategory.dataset.editCategory)));
    if (deleteCategory) return deleteRecord('category', deleteCategory.dataset.deleteCategory);
    if (editIssue) return openIssueModal(issues.find(item => String(item.id) === String(editIssue.dataset.editIssue)));
    if (deleteIssue) return deleteRecord('issue', deleteIssue.dataset.deleteIssue);
  });

  solutionList.addEventListener('click', event => {
    const editSolution = event.target.closest('[data-edit-solution]');
    const deleteSolution = event.target.closest('[data-delete-solution]');
    if (editSolution) return openSolutionModal(solutions.find(item => String(item.id) === String(editSolution.dataset.editSolution)));
    if (deleteSolution) return deleteRecord('solution', deleteSolution.dataset.deleteSolution);
  });
}

(async () => {
  await initSidebar();
  bindEvents();
  await loadLibrary();
})().catch(error => show(error.message, true));
