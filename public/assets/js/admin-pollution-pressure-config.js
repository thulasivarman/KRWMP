const api = window.KRWMP_UTILS.apiRequest;
const esc = window.KRWMP_UTILS.escapeHtml;
const statusBox = document.getElementById('statusBox');

function show(message, error = false) {
  window.KRWMP_UTILS.showStatus(statusBox, message, error);
}

function numberInput(value, className, step = '0.01') {
  return '<input type="number" step="' + step + '" value="' + esc(value ?? '') + '" class="form-input ' + className + '">';
}

function textInput(value, className) {
  return '<input type="text" value="' + esc(value ?? '') + '" class="form-input ' + className + '">';
}

async function updateJson(url, body) {
  const response = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) throw new Error(payload.message || 'Update failed');
  return payload;
}

function renderComponents(components) {
  const grid = document.getElementById('componentConfigGrid');
  grid.innerHTML = components.map((item) => `
    <div class="bg-slate-950/50 border border-slate-800 rounded-xl p-4 space-y-3" data-component-id="${esc(item.id)}">
      <div>
        <div class="text-[10px] uppercase tracking-wider text-slate-500 font-bold">${esc(item.component_code)}</div>
        <input type="text" class="form-input component-name mt-1" value="${esc(item.component_name)}">
      </div>
      <label class="form-label">Weight
        <input type="number" step="0.01" min="0" max="1" class="form-input component-weight mt-1" value="${esc(item.weight)}">
      </label>
      <label class="inline-flex items-center gap-2 text-xs text-slate-300">
        <input type="checkbox" class="component-active accent-emerald-500" ${item.is_active ? 'checked' : ''}> Active
      </label>
      <button class="krwmp-btn krwmp-btn-primary krwmp-btn-sm save-component">Save Component</button>
    </div>
  `).join('');

  grid.querySelectorAll('.save-component').forEach((button) => {
    button.addEventListener('click', async () => {
      const card = button.closest('[data-component-id]');
      try {
        await updateJson('/api/analytics/pollution-pressure/config/components/' + card.dataset.componentId, {
          component_name: card.querySelector('.component-name').value,
          weight: Number(card.querySelector('.component-weight').value),
          is_active: card.querySelector('.component-active').checked
        });
        show('Component updated successfully.');
      } catch (error) {
        show(error.message || 'Component update failed.', true);
      }
    });
  });
}

function renderRules(rules) {
  const body = document.getElementById('ruleConfigBody');
  body.innerHTML = rules.map((rule) => `
    <tr data-rule-id="${esc(rule.id)}">
      <td class="border border-slate-800 p-2 text-slate-400">${esc(rule.component_code)}</td>
      <td class="border border-slate-800 p-2">${textInput(rule.rule_name, 'rule-name')}</td>
      <td class="border border-slate-800 p-2">${textInput(rule.condition_field, 'rule-field')}</td>
      <td class="border border-slate-800 p-2">
        <select class="form-select rule-operator">
          ${['=', '!=', '<', '<=', '>', '>=', 'always'].map(op => '<option value="' + op + '" ' + (op === rule.condition_operator ? 'selected' : '') + '>' + op + '</option>').join('')}
        </select>
      </td>
      <td class="border border-slate-800 p-2">${textInput(rule.condition_value || '', 'rule-value')}</td>
      <td class="border border-slate-800 p-2 text-right">${numberInput(rule.score, 'rule-score')}</td>
      <td class="border border-slate-800 p-2 text-center"><input type="checkbox" class="rule-active accent-emerald-500" ${rule.is_active ? 'checked' : ''}></td>
      <td class="border border-slate-800 p-2 text-center"><button class="krwmp-btn krwmp-btn-primary krwmp-btn-sm save-rule">Save</button></td>
    </tr>
  `).join('');

  body.querySelectorAll('.save-rule').forEach((button) => {
    button.addEventListener('click', async () => {
      const row = button.closest('[data-rule-id]');
      try {
        await updateJson('/api/analytics/pollution-pressure/config/rules/' + row.dataset.ruleId, {
          rule_name: row.querySelector('.rule-name').value,
          condition_field: row.querySelector('.rule-field').value,
          condition_operator: row.querySelector('.rule-operator').value,
          condition_value: row.querySelector('.rule-value').value,
          score: Number(row.querySelector('.rule-score').value),
          is_active: row.querySelector('.rule-active').checked
        });
        show('Rule updated successfully.');
      } catch (error) {
        show(error.message || 'Rule update failed.', true);
      }
    });
  });
}

function renderClasses(classes) {
  const body = document.getElementById('classConfigBody');
  body.innerHTML = classes.map((item) => `
    <tr data-class-id="${esc(item.id)}">
      <td class="border border-slate-800 p-2">${textInput(item.class_name, 'class-name')}</td>
      <td class="border border-slate-800 p-2 text-right">${numberInput(item.min_score, 'class-min')}</td>
      <td class="border border-slate-800 p-2 text-right">${numberInput(item.max_score, 'class-max')}</td>
      <td class="border border-slate-800 p-2"><input type="color" class="class-color h-9 w-20 bg-slate-950 border border-slate-700 rounded" value="${esc(item.color_code || '#64748b')}"></td>
      <td class="border border-slate-800 p-2 text-center"><button class="krwmp-btn krwmp-btn-primary krwmp-btn-sm save-class">Save</button></td>
    </tr>
  `).join('');

  body.querySelectorAll('.save-class').forEach((button) => {
    button.addEventListener('click', async () => {
      const row = button.closest('[data-class-id]');
      try {
        await updateJson('/api/analytics/pollution-pressure/config/classes/' + row.dataset.classId, {
          class_name: row.querySelector('.class-name').value,
          min_score: Number(row.querySelector('.class-min').value),
          max_score: Number(row.querySelector('.class-max').value),
          color_code: row.querySelector('.class-color').value
        });
        show('Pressure class updated successfully.');
      } catch (error) {
        show(error.message || 'Pressure class update failed.', true);
      }
    });
  });
}

async function loadConfig() {
  try {
    show('Loading pollution pressure configuration...');
    const response = await api('/api/analytics/pollution-pressure/config');
    const config = response.data || {};
    renderComponents(config.components || []);
    renderRules(config.rules || []);
    renderClasses(config.classes || []);
    statusBox.classList.add('hidden');
  } catch (error) {
    show(error.message || 'Unable to load configuration.', true);
  }
}

async function init() {
  if (window.KRWMP_ENGINE) await window.KRWMP_ENGINE.assembleInterfaceContext('/sidebar.html', 'sidebar');
  if (window.KRWMP_PRIVILEGES) await window.KRWMP_PRIVILEGES.protectPage('admin', 'view');
  document.getElementById('refreshConfigBtn').addEventListener('click', loadConfig);
  await loadConfig();
}

init().catch(error => show(error.message || 'Unable to initialize configuration page.', true));
