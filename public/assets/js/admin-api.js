/**
 * KRWMP Admin API Client
 * Centralizes all admin API requests.
 */

window.KRWMP_ADMIN_API = {
    async request(url, options = {}) {
        const response = await fetch(url, {
            headers: {
                'Content-Type': 'application/json',
                ...(options.headers || {})
            },
            ...options
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok || data.success === false) {
            throw new Error(data.message || 'Request failed.');
        }

        return data;
    },

    async getUsers() {
        return this.request('/api/admin/users');
    },

    async registerUser(payload) {
        return this.request('/api/admin/register', {
            method: 'POST',
            body: JSON.stringify(payload)
        });
    },

    async updateUser(payload) {
        return this.request('/api/admin/user/update', {
            method: 'POST',
            body: JSON.stringify(payload)
        });
    },

    async deleteUser(targetIdentifier) {
        return this.request('/api/admin/user/delete', {
            method: 'POST',
            body: JSON.stringify({ targetIdentifier })
        });
    },

    async assignRole(targetUserIdentifier, newRoleId) {
        return this.request('/api/admin/assign-role', {
            method: 'POST',
            body: JSON.stringify({ targetUserIdentifier, newRoleId })
        });
    },

    async resetPassword(payload) {
        return this.request('/api/admin/reset-password', {
            method: 'POST',
            body: JSON.stringify(payload)
        });
    }
};
