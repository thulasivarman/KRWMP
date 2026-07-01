(function () {
  const api = () => window.KRWMP_UTILS?.apiRequest;
  const esc = (value) => window.KRWMP_UTILS?.escapeHtml ? window.KRWMP_UTILS.escapeHtml(value) : String(value ?? '');

  const PRESSURE_ACTIONS = {
    Critical: 'Immediate field verification and intervention escalation',
    High: 'Prioritize investigation and assign responsible intervention',
    Moderate: 'Monitor trend and verify recurring pressure sources',
    Low: 'Routine monitoring',
    'Very Low': 'Maintain baseline monitoring'
  };

  function queryString() {
    const query = new URLSearchParams();
    const level = document.getElementById('pollutionPressureLevelFilter')?.value;
    const component = document.getElementById('pollutionComponentFilter')?.value;
    const minIntensity = document.getElementById('pollutionMinIntensityFilter')?.value;
    if (level) query.set('pressure_level', level);
    if (component) query.set('component_code', component);
    if (minIntensity) query.set('min_intensity', minIntensity);
    return query.toString() ? '?' + query.toString() : '';
  }

  function polar(cx, cy, r, angle) {
    const rad = (angle - 90) * Math.PI / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  }

  function slicePath(cx, cy, r, startAngle, endAngle) {
    const start = polar(cx, cy, r, endAngle);
    const end = polar(cx, cy, r, startAngle);
    const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';
    return ['M', cx, cy, 'L', start.x, start.y, 'A', r, r, 0, largeArcFlag, 0, end.x, end.y, 'Z'].join(' ');
  }

  function renderPie(rows) {
    const chart = document.getElementById('pollutionPressurePie');
    const legend = document.getElementById('pollutionPressureLegend');
    if (!chart || !legend) return;

    const total = rows.reduce((sum, row) => sum + Number(row.gn_count || 0), 0);
    if (!total) {
      chart.innerHTML = '<div class="text-slate-500 text-sm">No GN pressure data available.</div>';
      legend.innerHTML = '';
      return;
    }

    let angle = 0;
    const slices = rows.map((row) => {
      const value = Number(row.gn_count || 0);
      const nextAngle = angle + (value / total) * 360;
      const path = slicePath(100, 100, 85, angle, nextAngle);
      angle = nextAngle;
      const color = esc(row.color_code || '#64748b');
      return '<path d="' + path + '" fill="' + color + '"><title>' + esc(row.pressure_level) + ': ' + value + ' GN</title></path>';
    }).join('');

    chart.innerHTML = '<svg viewBox="0 0 200 200" class="w-64 h-64 max-w-full mx-auto" role="img" aria-label="Pollution pressure distribution by GN">' + slices + '<circle cx="100" cy="100" r="42" fill="#020617"></circle><text x="100" y="96" text-anchor="middle" fill="#e2e8f0" font-size="22" font-weight="700">' + total + '</text><text x="100" y="116" text-anchor="middle" fill="#94a3b8" font-size="10">GN divisions</text></svg>';

    legend.innerHTML = rows.map((row) => {
      const count = Number(row.gn_count || 0);
      const percent = total ? Math.round((count / total) * 100) : 0;
      const color = esc(row.color_code || '#64748b');
      return '<div class="flex items-center justify-between gap-3"><div class="flex items-center gap-2"><span class="inline-block h-3 w-3 rounded-full" style="background-color:' + color + '"></span>' + esc(row.pressure_level) + '</div><strong class="text-slate-200">' + count + ' GN (' + percent + '%)</strong></div>';
    }).join('');
  }

  function renderCriticalGNs(rows) {
    const body = document.getElementById('criticalGnTableBody');
    const count = document.getElementById('criticalGnCount');
    if (!body) return;
    if (count) count.textContent = rows.length + ' priority records';

    body.innerHTML = rows.length ? rows.map((row) => {
      const level = row.pressure_level || '-';
      return '<tr>' +
        '<td class="border border-slate-800 p-2 text-slate-200">' + esc(row.gn_name || '-') + '</td>' +
        '<td class="border border-slate-800 p-2 text-slate-200">' + esc(level) + '</td>' +
        '<td class="border border-slate-800 p-2 text-right text-slate-200 font-semibold">' + esc(row.pressure_score || 0) + '</td>' +
        '<td class="border border-slate-800 p-2 text-slate-400">' + esc(PRESSURE_ACTIONS[level] || 'Review pressure sources and assign action') + '</td>' +
        '</tr>';
    }).join('') : '<tr><td colspan="4" class="border border-slate-800 p-3 text-center text-slate-500">No high or critical GN records available.</td></tr>';
  }

  async function load() {
    const request = api();
    if (!request) return;
    try {
      const query = queryString();
      const [summaryResponse, criticalResponse] = await Promise.all([
        request('/api/analytics/pollution-pressure/dashboard-summary' + query),
        request('/api/analytics/pollution-pressure/critical-gns?limit=10')
      ]);
      renderPie(summaryResponse.data || []);
      renderCriticalGNs(criticalResponse.data || []);
    } catch (error) {
      const chart = document.getElementById('pollutionPressurePie');
      if (chart) chart.innerHTML = '<div class="text-red-400 text-sm">Unable to load pollution pressure dashboard.</div>';
      console.error('Pollution pressure dashboard failed:', error);
    }
  }

  window.KRWMP_POLLUTION_DASHBOARD = { load };

  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('pollutionDashboardRefreshBtn')?.addEventListener('click', load);
    ['pollutionPressureLevelFilter', 'pollutionComponentFilter', 'pollutionMinIntensityFilter'].forEach((id) => {
      document.getElementById(id)?.addEventListener('change', load);
    });
    setTimeout(load, 500);
  });
})();
