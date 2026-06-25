/**
 * KRWMP Admin API Client
 * Centralizes all admin API requests.
 */
window.KRWMP_ADMIN_API = {
    async request(url, options = {}) {
        return window.KRWMP_UTILS.apiRequest(url, options);
    },

    selectedValues(selectId) {
        const select = document.getElementById(selectId);
        if (!select) return [];
        return Array.from(select.selectedOptions || []).map(option => option.value).filter(Boolean);
    },

    attachJurisdictions(payload, selectId) {
        const copy = Object.assign({}, payload || {});
        const selected = this.selectedValues(selectId);
        if (document.getElementById(selectId)) copy.jurisdiction_ids = selected;
        return copy;
    },

    async getUsers() { return this.request('/api/admin/users'); },
    async registerUser(payload) { return this.request('/api/admin/register', { method: 'POST', body: this.attachJurisdictions(payload, 'regJurisdictionIds') }); },
    async updateUser(payload) { return this.request('/api/admin/user/update', { method: 'POST', body: this.attachJurisdictions(payload, 'editJurisdictionIds') }); },
    async deleteUser(targetIdentifier) { return this.request('/api/admin/user/delete', { method: 'POST', body: { targetIdentifier } }); },
    async assignRole(targetUserIdentifier, roleIds) { return this.request('/api/admin/assign-role', { method: 'POST', body: { targetUserIdentifier, role_ids: roleIds } }); },
    async resetPassword(payload) { return this.request('/api/admin/reset-password', { method: 'POST', body: payload }); },
    async createRole(payload) { return this.request('/api/admin/roles', { method: 'POST', body: payload }); },
    async updateRole(id, payload) { return this.request('/api/admin/roles/' + id, { method: 'PUT', body: payload }); },
    async deleteRole(id) { return this.request('/api/admin/roles/' + id, { method: 'DELETE' }); },
    async savePrivilege(payload) { return this.request('/api/admin/role-privileges', { method: 'POST', body: payload }); },

    async getJurisdictionDistricts() { return this.request('/api/admin/jurisdiction-builder/districts'); },
    async getJurisdictionDsds(iddistrict) { return this.request('/api/admin/jurisdiction-builder/dsds' + (iddistrict ? '?iddistrict=' + encodeURIComponent(iddistrict) : '')); },
    async getJurisdictionGnds(params = {}) {
        const query = new URLSearchParams();
        if (params.iddistrict) query.set('iddistrict', params.iddistrict);
        if (params.iddsd) query.set('iddsd', params.iddsd);
        if (params.q) query.set('q', params.q);
        return this.request('/api/admin/jurisdiction-builder/gnds' + (query.toString() ? '?' + query.toString() : ''));
    },
    async createJurisdictionFromGnds(payload) { return this.request('/api/admin/jurisdiction-builder/custom', { method: 'POST', body: payload }); },

    async getInstitutions() { return this.request('/api/interventions/lookups/institutions'); },
    async createInstitution(payload) { return this.request('/api/interventions/lookups/institutions', { method: 'POST', body: payload }); },
    async updateInstitution(id, payload) { return this.request('/api/interventions/lookups/institutions/' + id, { method: 'PUT', body: payload }); },
    async deleteInstitution(id) { return this.request('/api/interventions/lookups/institutions/' + id, { method: 'DELETE' }); }
};