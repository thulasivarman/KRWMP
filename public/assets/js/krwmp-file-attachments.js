(function () {
    const utils = window.KRWMP_UTILS || {};
    const apiRequest = utils.apiRequest || utils.request;
    const escapeHtml = utils.escapeHtml || (value => String(value ?? ''));
    const escapeAttribute = utils.escapeAttribute || escapeHtml;

    if (!apiRequest) {
        console.warn('KRWMP file attachments require KRWMP_UTILS.apiRequest.');
    }

    function cleanText(value) {
        const text = String(value ?? '').trim();
        return text || '';
    }

    function normalizeUploadOptions(fileOrOptions, maybeOptions = {}) {
        if (fileOrOptions instanceof File) return { ...maybeOptions, file: fileOrOptions };
        return { ...(fileOrOptions || {}) };
    }

    function normalizeModuleKey(options = {}) {
        return cleanText(options.moduleKey || options.module_key || options.module);
    }

    function normalizeRecordId(options = {}) {
        return cleanText(options.recordId || options.record_id);
    }

    function fileSizeLabel(bytes) {
        const size = Number(bytes || 0);
        if (!Number.isFinite(size) || size <= 0) return '';
        if (size < 1024) return `${size} B`;
        if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
        return `${(size / (1024 * 1024)).toFixed(1)} MB`;
    }

    function fileDateLabel(value) {
        if (!value) return '';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '';
        return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    }

    function attachmentName(file = {}) {
        return cleanText(file.original_filename || file.filename || file.name) || 'Attachment';
    }

    function attachmentMeta(file = {}) {
        return [
            cleanText(file.attachment_role || file.role),
            cleanText(file.mime_type),
            fileSizeLabel(file.file_size_bytes || file.size),
            fileDateLabel(file.created_at),
        ].filter(Boolean).join(' · ');
    }

    async function uploadAttachment(fileOrOptions, maybeOptions = {}) {
        const options = normalizeUploadOptions(fileOrOptions, maybeOptions);
        const file = options.file;
        const moduleKey = normalizeModuleKey(options);

        if (!file) throw new Error('A file is required.');
        if (!moduleKey) throw new Error('moduleKey is required.');

        const presign = await apiRequest('/api/files/presign-upload', {
            method: 'POST',
            body: {
                module_key: moduleKey,
                record_id: normalizeRecordId(options) || undefined,
                record_kind: cleanText(options.recordKind || options.record_kind) || undefined,
                attachment_role: cleanText(options.attachmentRole || options.attachment_role || options.role) || 'attachment',
                original_filename: file.name,
                mime_type: file.type || cleanText(options.mimeType || options.mime_type) || 'application/octet-stream',
                file_size_bytes: file.size,
                checksum_sha256: cleanText(options.checksumSha256 || options.checksum_sha256) || undefined,
                metadata: options.metadata || {},
                visibility: cleanText(options.visibility) || 'module',
                expires_in: options.expiresIn || options.expires_in,
            },
        });

        if (!presign.upload?.url || !presign.attachment?.id) {
            throw new Error('Upload could not be prepared.');
        }

        await putFile(presign.upload, file, options.onProgress);

        const confirmed = await apiRequest('/api/files/confirm-upload', {
            method: 'POST',
            body: {
                file_id: presign.attachment.id,
                record_id: normalizeRecordId(options) || presign.attachment.record_id || undefined,
                record_kind: cleanText(options.recordKind || options.record_kind) || presign.attachment.record_kind || undefined,
                attachment_role: cleanText(options.attachmentRole || options.attachment_role || options.role) || presign.attachment.attachment_role || 'attachment',
                mime_type: file.type || presign.attachment.mime_type || 'application/octet-stream',
                file_size_bytes: file.size,
                checksum_sha256: cleanText(options.checksumSha256 || options.checksum_sha256) || undefined,
                metadata: options.metadata || {},
                visibility: cleanText(options.visibility) || presign.attachment.visibility || 'module',
            },
        });

        return {
            presign,
            attachment: confirmed.attachment,
            confirmed,
        };
    }

    function putFile(upload, file, onProgress) {
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open(upload.method || 'PUT', upload.url);
            for (const [key, value] of Object.entries(upload.headers || {})) {
                xhr.setRequestHeader(key, value);
            }
            xhr.upload.addEventListener('progress', event => {
                if (event.lengthComputable && typeof onProgress === 'function') {
                    onProgress(Math.round((event.loaded / event.total) * 100), event);
                }
            });
            xhr.addEventListener('load', () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    if (typeof onProgress === 'function') onProgress(100);
                    resolve();
                } else {
                    reject(new Error('File upload failed.'));
                }
            });
            xhr.addEventListener('error', () => reject(new Error('File upload failed.')));
            xhr.addEventListener('abort', () => reject(new Error('File upload was cancelled.')));
            xhr.send(file);
        });
    }

    async function listAttachments(options = {}) {
        const moduleKey = normalizeModuleKey(options);
        const recordId = normalizeRecordId(options);
        if (!moduleKey) throw new Error('moduleKey is required.');
        if (!recordId) throw new Error('recordId is required.');

        const params = new URLSearchParams();
        const role = cleanText(options.attachmentRole || options.attachment_role || options.role);
        if (role) params.set('attachment_role', role);
        if (options.status) params.set('status', options.status);
        if (options.limit) params.set('limit', options.limit);

        const suffix = params.toString() ? `?${params.toString()}` : '';
        const data = await apiRequest(`/api/files/${encodeURIComponent(moduleKey)}/${encodeURIComponent(recordId)}${suffix}`);
        return data.files || [];
    }

    async function deleteAttachment(fileIdOrOptions) {
        const fileId = cleanText(typeof fileIdOrOptions === 'object' ? fileIdOrOptions.fileId || fileIdOrOptions.file_id || fileIdOrOptions.id : fileIdOrOptions);
        if (!fileId) throw new Error('fileId is required.');
        return apiRequest(`/api/files/${encodeURIComponent(fileId)}`, { method: 'DELETE' });
    }

    async function downloadAttachment(fileId, options = {}) {
        const id = cleanText(fileId);
        if (!id) throw new Error('fileId is required.');
        const params = new URLSearchParams();
        if (options.expiresIn || options.expires_in) params.set('expires_in', options.expiresIn || options.expires_in);
        if (options.download === false) params.set('download', 'false');
        const suffix = params.toString() ? `?${params.toString()}` : '';
        const data = await apiRequest(`/api/files/${encodeURIComponent(id)}/download${suffix}`);
        if (!data.download?.url) throw new Error('Download URL could not be prepared.');
        return data;
    }

    function rowHtml(file, options = {}) {
        const id = cleanText(file.id);
        const name = attachmentName(file);
        const meta = attachmentMeta(file);
        const canDelete = options.canDelete !== false;
        const deleteButton = canDelete
            ? `<button type="button" data-attachment-action="delete" data-file-id="${escapeAttribute(id)}" class="rounded border border-rose-900/40 bg-rose-950/30 px-2.5 py-1 text-[10px] font-semibold text-rose-300 transition hover:bg-rose-900/50">Delete</button>`
            : '';

        return `
            <div class="flex items-center justify-between gap-3 border-b border-slate-800/50 py-3 last:border-b-0" data-file-id="${escapeAttribute(id)}">
                <div class="min-w-0">
                    <div class="truncate text-sm font-medium text-slate-200">${escapeHtml(name)}</div>
                    <div class="mt-1 truncate text-[11px] text-slate-500">${escapeHtml(meta || 'File attachment')}</div>
                </div>
                <div class="flex shrink-0 items-center gap-1.5">
                    <button type="button" data-attachment-action="download" data-file-id="${escapeAttribute(id)}" class="rounded border border-slate-700 bg-slate-800 px-2.5 py-1 text-[10px] font-semibold text-slate-200 transition hover:bg-slate-700">Download</button>
                    ${deleteButton}
                </div>
            </div>
        `;
    }

    function resolveContainer(container) {
        if (typeof container === 'string') return document.querySelector(container);
        return container || null;
    }

    function bindAttachmentActions(container, options = {}) {
        if (!container || container.dataset.krwmpAttachmentActions === 'true') return;
        container.dataset.krwmpAttachmentActions = 'true';
        container.addEventListener('click', async event => {
            const button = event.target.closest('[data-attachment-action]');
            if (!button || !container.contains(button)) return;
            const fileId = button.dataset.fileId;
            const action = button.dataset.attachmentAction;
            button.disabled = true;

            try {
                if (action === 'download') {
                    const result = await downloadAttachment(fileId, options.download || {});
                    window.open(result.download.url, '_blank', 'noopener');
                } else if (action === 'delete') {
                    const shouldDelete = options.confirmDelete === false || window.confirm(options.deleteMessage || 'Delete this attachment?');
                    if (shouldDelete) {
                        await deleteAttachment(fileId);
                        button.closest('[data-file-id]')?.remove();
                        if (typeof options.onDelete === 'function') options.onDelete(fileId);
                    }
                }
            } catch (error) {
                if (typeof options.onError === 'function') options.onError(error);
                else console.error(error);
            } finally {
                button.disabled = false;
            }
        });
    }

    function renderAttachmentList(containerOrFiles, filesOrOptions = [], maybeOptions = {}) {
        const optionsOnly = !Array.isArray(containerOrFiles) && typeof containerOrFiles === 'object' && !containerOrFiles.nodeType && !containerOrFiles.innerHTML;
        const options = optionsOnly ? containerOrFiles : maybeOptions;
        const container = optionsOnly
            ? resolveContainer(options.container)
            : Array.isArray(containerOrFiles)
                ? resolveContainer(maybeOptions.container)
                : resolveContainer(containerOrFiles);
        const files = optionsOnly
            ? options.files || []
            : Array.isArray(containerOrFiles)
                ? containerOrFiles
                : filesOrOptions;

        if (!container) return '';
        const rows = Array.isArray(files) ? files : [];
        if (!rows.length) {
            container.innerHTML = `<div class="rounded border border-slate-800 bg-slate-950/40 p-3 text-sm text-slate-500">${escapeHtml(options.emptyMessage || 'No attachments uploaded yet.')}</div>`;
            bindAttachmentActions(container, options);
            return container.innerHTML;
        }

        container.innerHTML = `<div class="rounded border border-slate-800 bg-slate-950/40 px-3">${rows.map(file => rowHtml(file, options)).join('')}</div>`;
        bindAttachmentActions(container, options);
        return container.innerHTML;
    }

    window.KRWMP_FILE_ATTACHMENTS = {
        uploadAttachment,
        listAttachments,
        deleteAttachment,
        renderAttachmentList,
        downloadAttachment,
    };
})();
