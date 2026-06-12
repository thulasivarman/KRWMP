const user = JSON.parse(localStorage.getItem('krwmp_user') || 'null');
const statusBox = document.getElementById('statusBox');
const categoryIssueList = document.getElementById('categoryIssueList');
const solutionList = document.getElementById('solutionList');
const issueCategory = document.getElementById('issueCategory');
const solutionIssues = document.getElementById('solutionIssues');

let categories = [];
let issues = [];
let solutions = [];

function headers(extra = {}) {
  return {
    ...extra,
    'X-KRWMP-User': user?.identifier || user?.username || 'admin',
    'X-KRWMP-Role': user?.role_name || user?.role || 'admin',
  };
}

function show(message, error = false) {
  statusBox.className = `rounded-lg p-3 text-sm ${error ? 'bg-rose-500/10 text-rose-300 border border-rose-500/30' : 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30'}`;
  statusBox.textContent = message;
  statusBox.classList.remove('hidden');
}

async function json(url, options = {}) {
  options.headers = headers(options.headers || {});
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.success === false) throw new Error(data.message || 'Request failed');
  return data;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

async function initSidebar() {
  if (window.KRWMP_ENGINE) await window.KRWMP_ENGINE.assembleInterfaceContext('/sidebar.html', 'sidebar');
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
  if (!categories.length) {
    categoryIssueList.innerHTML = '<p class="text-sm text-slate-500">No issue categories found.</p>';
    return;
  }

  groupedIssuesByCategory().forEach(category => {
    const card = document.createElement('article');
    card.className = 'bg-slate-950/50 border border-slate-800 rounded-lg p-4';
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
      <div class="flex items-start justify-between gap-3 mb-3">
        <div>
          <h3 class="font-bold text-slate-100">${escapeHtml(category.category_name)}</h3>
          <p class="text-xs text-slate-500 mt-1">${escapeHtml(category.description || '')}</p>
        </div>
        <span class="text-[10px] px-2 py-1 rounded bg-slate-800 text-slate-300 uppercase">${Number(category.issue_count || category.issues.length)} issues</span>
      </div>
      <div class="space-y-2">${issueHtml}</div>
    `;
    categoryIssueList.appendChild(card);
  });
}

function renderSolutions() {
  solutionList.innerHTML = '';
  if (!solutions.length) {
    solutionList.innerHTML = '<p class="text-sm text-slate-500">No solutions found.</p>';
    return;
  }

  solutions.forEach(solution => {
    const card = document.createElement('article');
    card.className = 'bg-slate-950/50 border border-slate-800 rounded-lg p-4';
    const links = Array.isArray(solution.linked_issues) ? solution.linked_issues : [];
    const linkHtml = links.length
      ? links.map(issue => `<span class="inline-flex px-2 py-1 rounded bg-emerald-500/10 text-emerald-300 text-[10px] font-bold uppercase mr-1 mb-1">${escapeHtml(issue.category_name)} - ${escapeHtml(issue.issue_name)}</span>`).join('')
      : '<span class="text-xs text-rose-300">No linked specific issues</span>';

    card.innerHTML = `
      <div class="flex items-start justify-between gap-3">
        <div>
          <h3 class="font-bold text-slate-100">${escapeHtml(solution.solution_title)}</h3>
          <p class="text-xs text-slate-500 mt-1">Priority: ${escapeHtml(solution.priority_level || 'medium')}</p>
        </div>
      </div>
      <p class="text-sm text-slate-300 mt-3 whitespace-pre-line">${escapeHtml(solution.solution_description || '')}</p>
      ${solution.recommended_actions ? `<p class="text-xs text-slate-400 mt-3 whitespace-pre-line"><span class="font-bold text-slate-300">Recommended Actions:</span><br>${escapeHtml(solution.recommended_actions)}</p>` : ''}
      <div class="mt-3 border-t border-slate-800 pt-3">${linkHtml}</div>
    `;
    solutionList.appendChild(card);
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
  const form = event.target;
  try {
    validateCategory(form);
    const body = Object.fromEntries(new FormData(form));
    await json('/api/issue-categories', {
      method: 'POST',
      headers: headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(body),
    });
    form.reset();
    show('Issue category saved.');
    await loadLibrary();
  } catch (error) {
    show(error.message, true);
  }
});

document.getElementById('issueForm').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.target;
  try {
    validateIssue(form);
    const body = Object.fromEntries(new FormData(form));
    await json('/api/specific-issues', {
      method: 'POST',
      headers: headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(body),
    });
    form.reset();
    show('Specific issue saved.');
    await loadLibrary();
  } catch (error) {
    show(error.message, true);
  }
});

document.getElementById('solutionForm').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.target;
  try {
    validateSolution(form);
    const body = Object.fromEntries(new FormData(form));
    body.issue_ids = getMultiSelectValues(solutionIssues);
    await json('/api/solutions', {
      method: 'POST',
      headers: headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(body),
    });
    form.reset();
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
