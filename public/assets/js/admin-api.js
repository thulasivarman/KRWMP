/**
 * KRWMP Admin API Client
 * Centralizes all admin API requests.
 */
window.KRWMP_ADMIN_API = {
    getSessionIdentifier() {
        try {
            const user = JSON.parse(localStorage.getItem('krwmp_user') || '{}');
            return String(user.identifier || user.username || '').trim().toLowerCase();
        } catch (error) {
            return '';
        }
    },

    async request(url, options = {}) {
        const sessionIdentifier = this.getSessionIdentifier();
        const response = await fetch(url, {
            headers: {
                'Content-Type': 'application/json',
                ...(sessionIdentifier ? { 'x-krwmp-user': sessionIdentifier } : {}),
                ...(options.headers || {})
            },
            ...options
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || data.success === false) throw new Error(data.message || 'Request failed.');
        return data;
    },

    async getUsers() { return this.request('/api/admin/users'); },
    async registerUser(payload) { return this.request('/api/admin/register', { method: 'POST', body: JSON.stringify(payload) }); },
    async updateUser(payload) { return this.request('/api/admin/user/update', { method: 'POST', body: JSON.stringify(payload) }); },
    async deleteUser(targetIdentifier) { return this.request('/api/admin/user/delete', { method: 'POST', body: JSON.stringify({ targetIdentifier }) }); },
    async assignRole(targetUserIdentifier, roleIds) { return this.request('/api/admin/assign-role', { method: 'POST', body: JSON.stringify({ targetUserIdentifier, role_ids: roleIds }) }); },
    async resetPassword(payload) { return this.request('/api/admin/reset-password', { method: 'POST', body: JSON.stringify(payload) }); },
    async createRole(payload) { return this.request('/api/admin/roles', { method: 'POST', body: JSON.stringify(payload) }); },
    async updateRole(id, payload) { return this.request(`/api/admin/roles/${id}`, { method: 'PUT', body: JSON.stringify(payload) }); },
    async deleteRole(id) { return this.request(`/api/admin/roles/${id}`, { method: 'DELETE' }); },
    async savePrivilege(payload) { return this.request('/api/admin/role-privileges', { method: 'POST', body: JSON.stringify(payload) }); },

    async getInstitutions() { return this.request('/api/interventions/lookups/institutions'); },
    async createInstitution(payload) { return this.request('/api/interventions/lookups/institutions', { method: 'POST', body: JSON.stringify(payload) }); },
    async updateInstitution(id, payload) { return this.request(`/api/interventions/lookups/institutions/${id}`, { method: 'PUT', body: JSON.stringify(payload) }); },
    async deleteInstitution(id) { return this.request(`/api/interventions/lookups/institutions/${id}`, { method: 'DELETE' }); }
};