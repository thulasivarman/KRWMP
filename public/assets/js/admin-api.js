/**
 * KRWMP Admin API Client
 * Centralizes all admin API requests.
 */
window.KRWMP_ADMIN_API = {
    async request(url, options = {}) {
        return window.KRWMP_UTILS.apiRequest(url, options);
    },

    async getUsers() { return this.request('/api/admin/users'); },
    async registerUser(payload) { return this.request('/api/admin/register', { method: 'POST', body: payload }); },
    async updateUser(payload) { return this.request('/api/admin/user/update', { method: 'POST', body: payload }); },
    async deleteUser(targetIdentifier) { return this.request('/api/admin/user/delete', { method: 'POST', body: { targetIdentifier } }); },
    async assignRole(targetUserIdentifier, roleIds) { return this.request('/api/admin/assign-role', { method: 'POST', body: { targetUserIdentifier, role_ids: roleIds } }); },
    async resetPassword(payload) { return this.request('/api/admin/reset-password', { method: 'POST', body: payload }); },
    async createRole(payload) { return this.request('/api/admin/roles', { method: 'POST', body: payload }); },
    async updateRole(id, payload) { return this.request(`/api/admin/roles/${id}`, { method: 'PUT', body: payload }); },
    async deleteRole(id) { return this.request(`/api/admin/roles/${id}`, { method: 'DELETE' }); },
    async savePrivilege(payload) { return this.request('/api/admin/role-privileges', { method: 'POST', body: payload }); },

    async getInstitutions() { return this.request('/api/interventions/lookups/institutions'); },
    async createInstitution(payload) { return this.request('/api/interventions/lookups/institutions', { method: 'POST', body: payload }); },
    async updateInstitution(id, payload) { return this.request(`/api/interventions/lookups/institutions/${id}`, { method: 'PUT', body: payload }); },
    async deleteInstitution(id) { return this.request(`/api/interventions/lookups/institutions/${id}`, { method: 'DELETE' }); }
};
