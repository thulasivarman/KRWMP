(() => {
  const apiBase = '/api';
  const qs = id => document.getElementById(id);
  const { apiRequest, escapeHtml: esc } = window.KRWMP_UTILS;
  const attachmentApi = window.KRWMP_FILE_ATTACHMENTS;
  const KNOWLEDGE_MODULE = 'knowledge_resources';
  const KNOWLEDGE_RECORD_KIND = 'knowledge_content';
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
  let canCreateKnowledge = false;
  let canUpdateKnowledge = false;
  let selectedFiles = [];
  let locationPicker = null;

  function renderCategories() {
    const options = categories.map(c => `<option value="${c.id}">${esc(c.category_name)}</option>`).join('');
    qs('filter-category').innerHTML = `<option value="">All Categories</option>${options}`;
    qs('form-category').innerHTML = `<option value="">Uncategorised</option>${options}`;
  }

  function renderDashboard(dashboard) {
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
      const location = item.latitude && item.longitude ? `<span class="krwmp-badge krwmp-badge-neutral">Mapped</span>` : '';
      return `<article class="krwmp-card border-x-0 border-t-0 rounded-none"><div class="flex flex-col lg:flex-row lg:justify-between gap-4"><div class="min-w-0"><h3 class="font-bold text-lg">${esc(item.title)}</h3><p class="text-sm text-slate-400 mt-1">${esc(item.summary || item.abstract || 'No summary provided.')}</p><div class="flex flex-wrap gap-2 mt-3"><span class="krwmp-badge krwmp-badge-neutral">${esc(item.content_type)}</span><span class="krwmp-badge krwmp-badge-neutral">${esc(item.category_name || 'Uncategorised')}</span><span class="krwmp-badge krwmp-badge-info">${esc(item.status)}</span>${location}</div><div class="mt-3" data-knowledge-attachments="${esc(item.id)}"></div></div><div class="krwmp-table-actions min-w-24">${openUrl ? `<a  class="krwmp-btn krwmp-btn-secondary krwmp-btn-sm text-center" href="${esc(openUrl)}">Open</a>` : ''}${canUpdateKnowledge ? `<button  class="krwmp-btn krwmp-btn-primary krwmp-btn-sm btn-edit" data-id="${item.id}">Edit</button>` : ''}</div></div></article>`;
    }).join('') || '<div class="krwmp-empty-state">No knowledge resources found.</div>';

    document.querySelectorAll('.btn-edit').forEach(btn => btn.addEventListener('click', () => openEdit(btn.dataset.id)));
    hydrateResourceAttachments();
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

  function validOptionalUrl(value) {
    const text = String(value || '').trim();
    if (!text) return true;
    try {
      const url = new URL(text);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch (_) {
      return false;
    }
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
    latInput.value = lat;
    lngInput.value = lng;
    const picker = ensureLocationPicker();
    setTimeout(() => {
      if (picker) {
        picker.refresh();
        if (lat !== '' && lng !== '') picker.setLocation(lat, lng, false);
        else picker.clear();
      }
    }, 100);
  }

  function renderModalAttachments(files = []) {
    if (!attachmentApi) return;
    attachmentApi.renderAttachmentList(qs('knowledge-attachment-list'), files, {
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

  async function loadAll() {
    const params = new URLSearchParams();
    if (qs('filter-q').value) params.set('q', qs('filter-q').value);
    if (qs('filter-category').value) params.set('category_id', qs('filter-category').value);
    if (qs('filter-type').value) params.set('content_type', qs('filter-type').value);
    if (qs('filter-status').value) params.set('status', qs('filter-status').value);
    const [catData, dashData, resourceData] = await Promise.all([
      apiRequest(`${apiBase}/knowledge/categories?include_inactive=true`),
      apiRequest(`${apiBase}/knowledge/dashboard`),
      apiRequest(`${apiBase}/knowledge?${params.toString()}`)
    ]);
    categories = catData.categories || [];
    resources = resourceData.resources || [];
    renderCategories();
    renderDashboard(dashData.dashboard || {});
    renderResources();
  }

  function openCreate() {
    if (!canCreateKnowledge) return;
    const form = qs('knowledge-form');
    form.reset();
    form.elements.language.value = 'English';
    selectedFiles = [];
    renderSelectedFiles();
    setUploadStatus('');
    renderModalAttachments([]);
    qs('knowledge-modal').showModal();
    applyLocation({});
  }

  function openEdit(id) {
    if (!canUpdateKnowledge) return;
    const item = resources.find(row => String(row.id) === String(id));
    if (!item) return;
    const form = qs('knowledge-form');
    form.reset();
    Object.keys(item).forEach(key => {
      if (!form.elements[key] || item[key] == null) return;
      if (form.elements[key].type === 'checkbox') form.elements[key].checked = !!item[key];
      else form.elements[key].value = item[key];
    });
    form.elements.id.value = item.id;
    selectedFiles = [];
    qs('knowledgeFilesInput').value = '';
    renderSelectedFiles();
    setUploadStatus('');
    qs('knowledge-modal').showModal();
    applyLocation(item);
    loadModalAttachments(item.id).catch(error => setUploadStatus(error.message, true));
  }

  async function uploadSelectedFiles(recordId, body = {}) {
    if (!selectedFiles.length) return;
    if (!attachmentApi) throw new Error('Attachment upload helper is not available.');

    for (let index = 0; index < selectedFiles.length; index += 1) {
      const file = selectedFiles[index];
      const label = `${index + 1}/${selectedFiles.length}`;
      setUploadStatus(`Uploading ${label}: ${file.name}`);
      await attachmentApi.uploadAttachment(file, {
        moduleKey: KNOWLEDGE_MODULE,
        recordId,
        recordKind: KNOWLEDGE_RECORD_KIND,
        attachmentRole: KNOWLEDGE_ATTACHMENT_ROLE,
        visibility: 'module',
        metadata: {
          title: body.title || '',
          content_type: body.content_type || 'article'
        },
        onProgress: percent => setUploadStatus(`Uploading ${label}: ${file.name} (${percent}%)`)
      });
    }

    selectedFiles = [];
    qs('knowledgeFilesInput').value = '';
    renderSelectedFiles();
    await loadModalAttachments(recordId);
    setUploadStatus('Files uploaded successfully.');
  }

  async function save(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const saveButton = qs('btn-save-resource');
    try {
      const body = Object.fromEntries(new FormData(form).entries());
      const id = body.id;
      delete body.id;
      if (id && !canUpdateKnowledge) throw new Error('You do not have update access for knowledge resources.');
      if (!id && !canCreateKnowledge) throw new Error('You do not have create access for knowledge resources.');
      if (!validOptionalUrl(body.external_url)) throw new Error('External URL must be a valid http or https URL.');
      if (!validOptionalUrl(body.video_url)) throw new Error('Video URL must be a valid http or https URL.');
      if (!validOptionalUrl(body.thumbnail_url)) throw new Error('Thumbnail URL must be a valid http or https URL.');
      body.is_featured = form.elements.is_featured.checked;
      body.tags = body.tags ? body.tags.split(',').map(v => v.trim()).filter(Boolean) : [];
      ['publication_year', 'latitude', 'longitude'].forEach(key => { if (body[key] === '') delete body[key]; });
      saveButton.disabled = true;
      setUploadStatus('Saving resource metadata...');
      const result = id
        ? await apiRequest(`${apiBase}/knowledge/${id}`, { method: 'PUT', body })
        : await apiRequest(`${apiBase}/knowledge`, { method: 'POST', body });
      const resource = result.resource || {};
      const recordId = resource.id || id;
      await uploadSelectedFiles(recordId, body);
      qs('knowledge-modal').close();
      await loadAll();
    } catch (error) {
      setUploadStatus(error.message, true);
    } finally {
      saveButton.disabled = false;
    }
  }

  document.addEventListener('DOMContentLoaded', async () => {
    try {
      if (window.KRWMP_ENGINE) await window.KRWMP_ENGINE.assembleInterfaceContext();
      await window.KRWMP_PRIVILEGES.protectPage('knowledge_portal', 'view');
      canCreateKnowledge = window.KRWMP_PRIVILEGES.can('knowledge_portal', 'create');
      canUpdateKnowledge = window.KRWMP_PRIVILEGES.can('knowledge_portal', 'update');
      qs('btn-open-create')?.classList.toggle('hidden', !canCreateKnowledge);
      await loadAll();
      qs('btn-refresh-knowledge').addEventListener('click', loadAll);
      qs('btn-apply-filters').addEventListener('click', loadAll);
      qs('btn-open-create').addEventListener('click', openCreate);
      qs('btn-close-modal').addEventListener('click', () => qs('knowledge-modal').close());
      qs('btn-cancel-form').addEventListener('click', () => qs('knowledge-modal').close());
      qs('knowledgeFilesInput').addEventListener('change', handleFileSelection);
      qs('knowledge-form').addEventListener('submit', save);
    } catch (error) {
      qs('knowledge-list').innerHTML = `<div class="krwmp-empty-state text-red-300">${esc(error.message)}</div>`;
      const saveButton = qs('btn-save-resource');
      if (saveButton) saveButton.disabled = false;
    }
  });
})();
