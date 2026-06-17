window.KRWMP_PRIVILEGES = {
  loaded: false,
  rows: [],
  map: {},

  getUser() {
    const sessionUser = window.KRWMP_ENGINE?.Session?.user || null;
    if (sessionUser) return sessionUser;
    return JSON.parse(localStorage.getItem('krwmp_user') || 'null');
  },

  isMasterAdmin() {
    const user = this.getUser() || {};
    const identifier = String(user.identifier || user.username || user.name || '').toLowerCase();
    const role = String(user.role_name || user.role || '').toLowerCase();
    return identifier === 'thulasi' || role === 'admin';
  },

  async load() {
    if (this.loaded) return this;
    if (this.isMasterAdmin()) {
      this.map = { system_admin: { view: true, create: true, update: true, delete: true } };
      this.loaded = true;
      return this;
    }
    const data = await window.KRWMP_UTILS.apiRequest('/api/me/privileges');
    this.rows = data.privileges || [];
    this.map = {};
    this.rows.forEach(p => {
      if (!this.map[p.privilege_key]) this.map[p.privilege_key] = { view: false, create: false, update: false, delete: false };
      this.map[p.privilege_key].view = this.map[p.privilege_key].view || !!p.can_view;
      this.map[p.privilege_key].create = this.map[p.privilege_key].create || !!p.can_create;
      this.map[p.privilege_key].update = this.map[p.privilege_key].update || !!p.can_update;
      this.map[p.privilege_key].delete = this.map[p.privilege_key].delete || !!p.can_delete;
    });
    this.loaded = true;
    return this;
  },

  can(key, action = 'view') {
    if (this.isMasterAdmin()) return true;
    return !!this.map[key]?.[action];
  },

  async applyVisibility() {
    await this.load();
    if (this.isMasterAdmin()) {
      document.querySelectorAll('.hidden-admin, [data-admin-only], #section-data-layers, #section-user-management').forEach(el => el.classList.remove('hidden'));
      return;
    }
    const sectionRules = [
      ['#section-data-layers', [['vector_layers', 'view'], ['raster_layers', 'view']]],
      ['#section-user-management', [['user_management_settings', 'view'], ['institution_management', 'view']]]
    ];
    sectionRules.forEach(([selector, allowed]) => {
      document.querySelectorAll(selector).forEach(el => {
        el.classList.toggle('hidden', !allowed.some(([key, action]) => this.can(key, action)));
      });
    });
    const rules = [
      ['a[href="/admin.html"]', 'user_management_settings', 'view'],
      ['a[href="/privilege-group-management.html"]', 'user_management_settings', 'view'],
      ['a[href="/admin-institutions.html"]', 'institution_management', 'view'],
      ['a[href="/admin-vector-layers.html"]', 'vector_layers', 'view'],
      ['a[href="/admin-raster-layers.html"]', 'raster_layers', 'view'],
      ['a[href="/admin-solution-library.html"]', 'community_issues_review', 'view'],
      ['a[href="/admin-community-issues.html"]', 'community_issues_review', 'view'],
      ['a[href="/vwmc-management.html"]', 'vwmc_view', 'view'],
      ['a[href="/intervention-registry.html"]', 'intervention_registry_view', 'view'],
      ['a[href="/intervention-library.html"]', 'intervention_library_manage', 'view'],
      ['a[href="/reports.html"]', 'reports_export', 'view'],
      ['a[href="/knowledge.html"]', 'knowledge_portal', 'view'],
      ['a[href="/water-quality-records.html"]', 'water_quality_records', 'view'],
      ['a[href="/pollution-sources.html"]', 'pollution_sources_management', 'view'],
      ['a[href="/volunteer-organisations.html"]', 'volunteer_organisation_management', 'view'],
      ['a[href="/community-report.html"]', 'map_view', 'view'],
      ['#floating-data-layers-btn', 'map_view', 'view'],
      ['#floating-raster-layers-btn', 'map_view', 'view'],
      ['#basemap-selector', 'map_view', 'view']
    ];
    rules.forEach(([selector, key, action]) => {
      document.querySelectorAll(selector).forEach(el => {
        if (!this.can(key, action)) el.classList.add('hidden');
      });
    });
  },

  async protectPage(key, action = 'view') {
    await this.load();
    if (!this.can(key, action)) {
      document.body.innerHTML = '<main class="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-8"><div class="bg-slate-900 border border-slate-800 rounded-xl p-6 max-w-md text-center"><h1 class="text-lg font-bold text-rose-300">Access Denied</h1><p class="text-sm text-slate-400 mt-2">You do not have the required privilege to access this page.</p><a href="/map.html" class="inline-block mt-4 bg-emerald-600 hover:bg-emerald-500 px-4 py-2 rounded text-sm font-bold">Back to Map</a></div></main>';
      throw new Error('Access denied');
    }
  }
};

window.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => window.KRWMP_PRIVILEGES.applyVisibility().catch(console.warn), 300);
});
