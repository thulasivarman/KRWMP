(() => {
  const apiBase = '/api';
  const utils = window.KRWMP_UTILS || {};
  const apiRequest = utils.apiRequest || utils.request;
  const qs = id => document.getElementById(id);
  const esc = utils.escapeHtml || (value => String(value ?? '').replace(/[&<>]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[ch])));

  const KNOWLEDGE_MODULE = 'knowledge_portal';
  const KNOWLEDGE_ATTACHMENT_ROLE = 'resource_file';
  const ALLOWED_FILE_EXTENSIONS = new Set(['pdf', 'docx', 'xlsx', 'jpg', 'jpeg', 'png', 'webp']);
  const ALLOWED_FILE_TYPES = new Set([
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'image/jpeg',
    'image/png',
    'image/webp'
  ]);

  let categories = [];
  let resources = [];
  let selectedFiles = [];
  let locationPicker = null;
  let canCreateKnowledge = false;
  let canUpdateKnowledge = false;
  let canDeleteKnowledge = false;
  const attachmentApi = window.KRWMP_FILE_ATTACHMENTS || null;

  function showStatus(message, error = false) {
    const box = qs('statusBox');
    if (box && utils.showStatus) utils.showStatus(box, message, error);
    else if (error) console.error(message);
  }

  async function requestJson(url, options = {}) {
    if (apiRequest) return apiRequest(url, options);
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    const fetchOptions = { method: options.method || 'GET', headers };
    if (options.body !== undefined) fetchOptions.body = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
    const res = await fetch(url, fetchOptions);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.success === false) throw new Error(data.message || 'Request failed');
    return data;
  }

  function fileExtension(filename = '') {
    return String(filename).split('.').pop().toLowerCase();
  }

  function isAllowedFile(file) {
    return ALLOWED_FILE_TYPES.has(file.type) || ALLOWED_FILE_EXTENSIONS.has(fileExtension(file.name));
  }

  function fileSizeLabel(bytes) {
    const size = Number(bytes || 0);
    if (!Number.isFinite(size) || size <= 0) return '';
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }

  function setUploadStatus(message = '', isError = false) {
    const node = qs('knowledge-upload-status');
    if (!node) return;
    node.textContent = message;
    node.classList.toggle('form-error', !!isError);
    node.classList.toggle('form-helper', !isError);
  }

  function renderSelectedFiles() {
    const container = qs('knowledge-selected-files');
    if (!container) return;
    if (!selectedFiles.length) {
      container.innerHTML = '<div class="rounded border border-slate-800 bg-slate-950/40 p-3 text-sm text-slate-500">No files selected.</div>';
      return;
    }
    container.innerHTML = `<div class="rounded border border-slate-800 bg-slate-950/40 px-3">${selectedFiles.map((file, index) => `
      <div class="flex items-center justify-between gap-3 border-b border-slate-800/50 py-3 last:border-b-0">
        <div class="min-w-0">
          <div class="truncate text-sm font-medium text-slate-200">${esc(file.name)}</div>
          <div class="mt-1 text-xs text-slate-500">${esc(file.type || fileExtension(file.name).toUpperCase())}${file.size ? ` - ${esc(fileSizeLabel(file.size))}` : ''}</div>
        </div>
        <button type="button" class="krwmp-btn krwmp-btn-secondary krwmp-btn-sm btn-remove-selected-file" data-index="${index}">Remove</button>
      </div>
    `).join('')}</div>`;
    container.querySelectorAll('.btn-remove-selected-file').forEach(button => {
      button.addEventListener('click', () => {
        selectedFiles.splice(Number(button.dataset.index), 1);
        qs('knowledgeFilesInput').value = '';
        renderSelectedFiles();
      });
    });
  }

  function handleFileSelection(event) {
    const files = Array.from(event.target.files || []);
    const rejected = files.filter(file => !isAllowedFile(file));
    selectedFiles = files.filter(isAllowedFile);
    renderSelectedFiles();
    setUploadStatus(rejected.length ? `${rejected.length} unsupported file(s) skipped. Allowed: PDF, DOCX, XLSX, JPG, PNG, WEBP.` : '');
  }

  function renderCategories() {
    const options = categories.map(c => `<option value="${esc(c.id)}">${esc(c.category_name)}</option>`).join('');
    qs('filter-category').innerHTML = `<option value="">All Categories</option>${options}`;
    qs('form-category').innerHTML = `<option value="">Uncategorised</option>${options}`;
  }

  function renderDashboard(dashboard = {}) {
    const s = dashboard.summary || {};
    qs('knowledge-kpis').classList.add('krwmp-stat-grid');
    qs('knowledge-kpis').innerHTML = [
      ['Total Resources', s.total_resources],
      ['Published', s.published_resources],
      ['Pending Review', s.pending_resources],
      ['GIS Linked', s.gis_linked_resources]
    ].map(([label, value]) => `<article class="krwmp-stat-card"><div class="krwmp-stat-value krwmp-stat-value-accent">${esc(value || 0)}</div><p class="krwmp-stat-label">${esc(label)}</p></article>`).join('');

    qs('chart-type').innerHTML = (dashboard.by_type || []).map(r => `<div class="flex justify-between border-b border-slate-800 pb-1"><span>${esc(r.content_type)}</span><strong>${esc(r.count)}</strong></div>`).join('') || '<p class="krwmp-empty-state">No data.</p>';
    qs('pending-review').innerHTML = (dashboard.pending_review || []).map(r => `<div class="border-b border-slate-800 pb-2"><div class="font-semibold">${esc(r.title)}</div><div class="krwmp-status-label">${esc(r.content_type)} - ${esc(r.status)}</div></div>`).join('') || '<p class="krwmp-empty-state">No pending records.</p>';
  }

  function renderResources() {
    qs('resource-count').textContent = `${resources.length} records`;
    qs('knowledge-list').innerHTML = resources.map(item => {
      const openUrl = item.file_url || item.video_url || item.external_url || '';
      const editButton = canUpdateKnowledge ? `<button class="btn-edit px-3 py-2 rounded bg-emerald-700 hover:bg-emerald-600" data-id="${esc(item.id)}">Edit</button>` : '';
      return `<article class="p-4 hover:bg-slate-800/40">
        <div class="flex justify-between gap-4">
          <div class="min-w-0">
            <h3 class="font-bold text-lg">${esc(item.title)}</h3>
            <p class="text-sm text-slate-400 mt-1">${esc(item.summary || item.abstract || 'No summary provided.')}</p>
            <div class="flex flex-wrap gap-2 mt-3 text-xs">
              <span class="px-2 py-1 rounded border border-slate-700">${esc(item.content_type)}</span>
              <span class="px-2 py-1 rounded border border-slate-700">${esc(item.category_name || 'Uncategorised')}</span>
              <span class="px-2 py-1 rounded border border-emerald-500/30 text-emerald-300">${esc(item.status)}</span>
            </div>
            <div class="mt-3" data-knowledge-attachments="${esc(item.id)}"></div>
          </div>
          <div class="flex flex-col gap-2 text-xs min-w-24">
            ${openUrl ? `<a class="px-3 py-2 rounded bg-slate-800 hover:bg-slate-700 text-center" href="${esc(openUrl)}" target="_blank" rel="noopener">Open</a>` : ''}
            ${editButton}
          </div>
        </div>
      </article>`;
    }).join('') || '<div class="p-6 text-slate-400 text-sm">No knowledge resources found.</div>';

    document.querySelectorAll('.btn-edit').forEach(btn => btn.addEventListener('click', () => openEdit(btn.dataset.id)));
    hydrateResourceAttachments();
  }

  function ensureLocationPicker() {
    if (locationPicker || !window.KRWMPLocationPicker) return locationPicker;
    locationPicker = new window.KRWMPLocationPicker({
      containerId: 'knowledge-location-picker',
      latitudeInput: '#knowledgeLatitudeInput',
      longitudeInput: '#knowledgeLongitudeInput'
    });
    return locationPicker;
  }

  function applyLocation(item = {}) {
    const latInput = qs('knowledgeLatitudeInput');
    const lngInput = qs('knowledgeLongitudeInput');
    const lat = item.latitude ?? '';
    const lng = item.longitude ?? '';
    if (latInput) latInput.value = lat;
    if (lngInput) lngInput.value = lng;
    const picker = ensureLocationPicker();
    setTimeout(() => {
      if (!picker) return;
      picker.refresh?.();
      if (lat !== '' && lng !== '') picker.setLocation?.(lat, lng, false);
      else picker.clear?.();
    }, 100);
  }

  function renderModalAttachments(files = []) {
    const container = qs('knowledge-attachment-list');
    if (!container) return;
    if (!attachmentApi) {
      container.innerHTML = '<div class="rounded border border-slate-800 bg-slate-950/40 p-3 text-sm text-slate-500">Attachment service is not available.</div>';
      return;
    }
    attachmentApi.renderAttachmentList(container, files, {
      canDelete: canUpdateKnowledge,
      emptyMessage: 'No files uploaded for this resource yet.',
      onDelete: () => loadAll(),
      onError: error => setUploadStatus(error.message, true)
    });
  }

  async function loadModalAttachments(recordId) {
    if (!attachmentApi || !recordId) {
      renderModalAttachments([]);
      return;
    }
    const files = await attachmentApi.listAttachments({
      moduleKey: KNOWLEDGE_MODULE,
      recordId,
      attachmentRole: KNOWLEDGE_ATTACHMENT_ROLE
    });
    renderModalAttachments(files);
  }

  async function hydrateResourceAttachments() {
    if (!attachmentApi) return;
    const nodes = Array.from(document.querySelectorAll('[data-knowledge-attachments]'));
    await Promise.allSettled(nodes.map(async node => {
      const recordId = node.dataset.knowledgeAttachments;
      const files = await attachmentApi.listAttachments({
        moduleKey: KNOWLEDGE_MODULE,
        recordId,
        attachmentRole: KNOWLEDGE_ATTACHMENT_ROLE,
        limit: 10
      });
      if (!files.length) {
        node.innerHTML = '';
        return;
      }
      attachmentApi.renderAttachmentList(node, files, {
        canDelete: canUpdateKnowledge,
        emptyMessage: '',
        onDelete: () => loadAll()
      });
    }));
  }

  async function uploadSelectedFiles(recordId) {
    if (!attachmentApi || !selectedFiles.length) return;
    setUploadStatus(`Uploading ${selectedFiles.length} file(s)...`);
    for (const file of selectedFiles) {
      await attachmentApi.uploadAttachment({
        file,
        moduleKey: KNOWLEDGE_MODULE,
        recordId,
        attachmentRole: KNOWLEDGE_ATTACHMENT_ROLE,
        visibility: 'module'
      });
    }
    selectedFiles = [];
    qs('knowledgeFilesInput').value = '';
    renderSelectedFiles();
    setUploadStatus('Files uploaded successfully.');
  }

  async function loadAll() {
    const params = new URLSearchParams();
    if (qs('filter-q').value) params.set('q', qs('filter-q').value);
    if (qs('filter-category').value) params.set('category_id', qs('filter-category').value);
    if (qs('filter-type').value) params.set('content_type', qs('filter-type').value);
    if (qs('filter-status').value) params.set('status', qs('filter-status').value);
    const [catData, dashData, resourceData] = await Promise.all([
      requestJson(`${apiBase}/knowledge/categories?include_inactive=true`),
      requestJson(`${apiBase}/knowledge/dashboard`),
      requestJson(`${apiBase}/knowledge?${params.toString()}`)
    ]);
    categories = catData.categories || [];
    resources = resourceData.resources || [];
    renderCategories();
    renderDashboard(dashData.dashboard || {});
    renderResources();
  }

  function resetModalState() {
    selectedFiles = [];
    qs('knowledgeFilesInput').value = '';
    renderSelectedFiles();
    setUploadStatus('');
    renderModalAttachments([]);
    applyLocation({});
  }

  function openCreate() {
    if (!canCreateKnowledge) return showStatus('You do not have create access for the Knowledge Portal.', true);
    const form = qs('knowledge-form');
    form.reset();
    form.elements.language.value = 'English';
    form.elements.status.value = 'draft';
    resetModalState();
    qs('knowledge-modal').showModal();
    ensureLocationPicker();
  }

  async function openEdit(id) {
    if (!canUpdateKnowledge) return showStatus('You do not have update access for the Knowledge Portal.', true);
    const item = resources.find(row => String(row.id) === String(id));
    if (!item) return;
    const form = qs('knowledge-form');
    form.reset();
    resetModalState();
    Object.keys(item).forEach(key => {
      if (!form.elements[key] || item[key] == null) return;
      if (form.elements[key].type === 'checkbox') form.elements[key].checked = !!item[key];
      else form.elements[key].value = item[key];
    });
    form.elements.id.value = item.id;
    applyLocation(item);
    await loadModalAttachments(item.id);
    qs('knowledge-modal').showModal();
    ensureLocationPicker();
  }

  function validateForm(form) {
    const title = String(form.elements.title.value || '').trim();
    const externalUrl = String(form.elements.external_url.value || '').trim();
    const videoUrl = String(form.elements.video_url.value || '').trim();
    if (title.length < 3) throw new Error('Title is required and must contain at least 3 characters.');
    [externalUrl, videoUrl].filter(Boolean).forEach(value => {
      const url = new URL(value);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only http/https URLs are allowed.');
    });
  }

  async function save(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const saveButton = qs('btn-save-resource');
    saveButton.disabled = true;
    saveButton.textContent = 'Saving...';
    try {
      validateForm(form);
      const body = Object.fromEntries(new FormData(form).entries());
      const id = body.id;
      delete body.id;
      body.is_featured = form.elements.is_featured.checked;
      body.tags = body.tags ? body.tags.split(',').map(v => v.trim()).filter(Boolean) : [];
      ['publication_year', 'latitude', 'longitude'].forEach(key => { if (body[key] === '') delete body[key]; });
      const result = id
        ? await requestJson(`${apiBase}/knowledge/${id}`, { method: 'PUT', body })
        : await requestJson(`${apiBase}/knowledge`, { method: 'POST', body });
      const recordId = id || result.resource?.id;
      await uploadSelectedFiles(recordId);
      qs('knowledge-modal').close();
      await loadAll();
    } catch (error) {
      setUploadStatus(error.message || 'Unable to save knowledge resource.', true);
      showStatus(error.message || 'Unable to save knowledge resource.', true);
    } finally {
      saveButton.disabled = false;
      saveButton.textContent = 'Save Resource';
    }
  }

  async function init() {
    if (!apiRequest) throw new Error('KRWMP_UTILS.apiRequest is not available. Please reload the page.');
    if (window.KRWMP_ENGINE) await window.KRWMP_ENGINE.assembleInterfaceContext('/sidebar.html', 'sidebar');
    if (window.KRWMP_PRIVILEGES) {
      await window.KRWMP_PRIVILEGES.protectPage('knowledge_portal', 'view');
      canCreateKnowledge = window.KRWMP_PRIVILEGES.can('knowledge_portal', 'create');
      canUpdateKnowledge = window.KRWMP_PRIVILEGES.can('knowledge_portal', 'update');
      canDeleteKnowledge = window.KRWMP_PRIVILEGES.can('knowledge_portal', 'delete');
    } else {
      canCreateKnowledge = true;
      canUpdateKnowledge = true;
      canDeleteKnowledge = false;
    }
    qs('btn-open-create')?.classList.toggle('hidden', !canCreateKnowledge);
    qs('knowledgeFilesInput')?.addEventListener('change', handleFileSelection);
    qs('btn-refresh-knowledge')?.addEventListener('click', loadAll);
    qs('btn-apply-filters')?.addEventListener('click', loadAll);
    qs('btn-open-create')?.addEventListener('click', openCreate);
    qs('btn-close-modal')?.addEventListener('click', () => qs('knowledge-modal').close());
    qs('btn-cancel-form')?.addEventListener('click', () => qs('knowledge-modal').close());
    qs('knowledge-form')?.addEventListener('submit', save);
    renderSelectedFiles();
    await loadAll();
  }

  document.addEventListener('DOMContentLoaded', () => {
    init().catch(error => {
      qs('knowledge-list').innerHTML = `<div class="krwmp-empty-state text-red-300">${esc(error.message)}</div>`;
      const saveButton = qs('btn-save-resource');
      if (saveButton) saveButton.disabled = false;
    });
  });
})();
