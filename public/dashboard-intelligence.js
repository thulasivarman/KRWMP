const { apiRequest: api, escapeHtml: esc, showStatus } = window.KRWMP_UTILS;

const statusBox = document.getElementById('statusBox');
const healthPanel = document.getElementById('healthPanel');
const kpiGrid = document.getElementById('kpiGrid');
const hotspotPanel = document.getElementById('hotspotPanel');
const recurrencePanel = document.getElementById('recurrencePanel');
const effectivenessPanel = document.getElementById('effectivenessPanel');
const refreshBtn = document.getElementById('refreshBtn');

function show(message, error = false) { showStatus(statusBox, message, error); }
function pct(value) { return `${Number(value || 0).toFixed(1)}%`; }
function num(value, decimals = 0) { return Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: decimals, minimumFractionDigits: decimals }); }

function kpiCard(title, value, helper, tone = 'info') {
  return `<article class="krwmp-card p-4"><p class="form-helper">${esc(title)}</p><div class="mt-2 text-3xl font-bold text-slate-100">${esc(value)}</div><p class="mt-2 text-xs text-slate-400">${esc(helper)}</p><span class="mt-3 inline-flex krwmp-badge krwmp-badge-${tone}">${esc(tone.toUpperCase())}</span></article>`;
}

function renderHealth(data) {
  const h = data.watershed_health || {};
  const components = h.components || {};
  healthPanel.innerHTML = `
    <div class="krwmp-cluster-between gap-4">
      <div><h2 class="form-section-heading">Watershed Health Score</h2><p class="form-helper">Composite score based on complaint pressure, recurrence, water quality, intervention success and response conversion.</p></div>
      <div class="text-right"><div class="text-5xl font-bold text-emerald-300">${esc(h.watershed_health_score ?? 0)}/100</div><div class="form-helper">${esc(h.health_class || '-')}</div></div>
    </div>
    <div class="grid grid-cols-1 md:grid-cols-5 gap-3 mt-4">
      ${kpiCard('Complaint Pressure', num(components.complaint_pressure_score), 'Lower is better', 'info')}
      ${kpiCard('Pollution Recurrence', num(components.pollution_recurrence_pressure_score), 'Lower is better', 'warning')}
      ${kpiCard('Water Quality Pressure', num(components.water_quality_pressure_score), 'Lower is better', 'warning')}
      ${kpiCard('Intervention Success', num(components.intervention_success_score), 'Higher is better', 'success')}
      ${kpiCard('Complaint Conversion', num(components.complaint_conversion_score), 'Higher is better', 'success')}
    </div>`;
}

function renderKpis(data) {
  const c = data.complaint_conversion || {};
  const u = data.unresolved_hotspot_density || {};
  const r = data.pollution_recurrence || {};
  const e = data.intervention_effectiveness || {};
  kpiGrid.innerHTML = [
    kpiCard('Complaint-to-Intervention Conversion', pct(c.conversion_rate_percent), `${num(c.converted_complaints)} converted from ${num(c.verified_complaints)} verified complaints`, 'success'),
    kpiCard('Unresolved Hotspot Density', num(u.unresolved_density_per_km2, 4), `${num(u.unresolved_cases)} unresolved cases per basin area`, 'warning'),
    kpiCard('Pollution Recurrence Index', pct(r.recurrence_index_percent), `${num(r.recurring_sources)} recurring sources from ${num(r.total_sources)} sources`, 'danger'),
    kpiCard('Intervention Effectiveness', num(e.average_effectiveness_score, 1), `${num(e.effective_count)} effective, ${num(e.moderate_count)} moderate, ${num(e.weak_count)} weak`, 'info'),
  ].join('');
}

function renderHotspots(data) {
  const rows = data.unresolved_hotspot_density?.hotspots || [];
  hotspotPanel.innerHTML = `<h2 class="form-section-heading">Unresolved Hotspots</h2>${rows.length ? rows.map(row => `<div class="krwmp-card p-3 text-sm"><strong>Cluster ${esc(row.cluster_id)}</strong><div class="form-helper">${esc(row.case_count)} cases · ${esc(row.latitude?.toFixed ? row.latitude.toFixed(5) : row.latitude)}, ${esc(row.longitude?.toFixed ? row.longitude.toFixed(5) : row.longitude)}</div></div>`).join('') : '<div class="krwmp-empty-state">No unresolved hotspot clusters found.</div>'}`;
}

function renderRecurrence(data) {
  const rows = data.pollution_recurrence?.recurring_sources_list || [];
  recurrencePanel.innerHTML = `<h2 class="form-section-heading">Recurring Pollution Sources</h2>${rows.length ? rows.slice(0, 10).map(row => `<div class="krwmp-card p-3 text-sm"><strong>${esc(row.source_code || '-')} - ${esc(row.source_name || '-')}</strong><div class="form-helper">${esc(row.recurrence_class)} · ${esc(row.recurrence_count)} recurrence points · ${esc(row.status || '-')}</div></div>`).join('') : '<div class="krwmp-empty-state">No recurring pollution sources found.</div>'}`;
}

function renderEffectiveness(data) {
  const rows = data.intervention_effectiveness?.interventions || [];
  effectivenessPanel.innerHTML = `<h2 class="form-section-heading">Intervention Effectiveness</h2>${rows.length ? `<div class="overflow-x-auto"><table class="krwmp-table"><thead><tr><th>Intervention</th><th>Status</th><th>Progress</th><th>Score</th><th>Class</th></tr></thead><tbody>${rows.slice(0, 20).map(row => `<tr><td>${esc(row.intervention_code || '-')} - ${esc(row.intervention_title || '-')}</td><td>${esc(row.status || '-')}</td><td>${esc(row.progress_percent || 0)}%</td><td>${esc(row.effectiveness_score || 0)}</td><td>${esc(row.effectiveness_class || '-')}</td></tr>`).join('')}</tbody></table></div>` : '<div class="krwmp-empty-state">No interventions available for scoring.</div>'}`;
}

async function loadDashboard() {
  healthPanel.innerHTML = '<div class="krwmp-loading-state">Loading intelligence KPIs...</div>';
  kpiGrid.innerHTML = '';
  try {
    const data = await api('/api/dashboard-intelligence/summary');
    const intelligence = data.intelligence || {};
    renderHealth(intelligence);
    renderKpis(intelligence);
    renderHotspots(intelligence);
    renderRecurrence(intelligence);
    renderEffectiveness(intelligence);
    show(`Dashboard intelligence updated at ${new Date(intelligence.generated_at || Date.now()).toLocaleString()}`);
  } catch (error) {
    show(error.message, true);
    healthPanel.innerHTML = `<div class="krwmp-empty-state">Unable to load intelligence dashboard: ${esc(error.message)}</div>`;
  }
}

(async () => {
  if (window.KRWMP_ENGINE) await window.KRWMP_ENGINE.assembleInterfaceContext('/sidebar.html', 'sidebar');
  await window.KRWMP_PRIVILEGES.protectPage('dashboard_view', 'view');
  refreshBtn?.addEventListener('click', loadDashboard);
  await loadDashboard();
})().catch(error => show(error.message, true));
