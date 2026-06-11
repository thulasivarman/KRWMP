window.renderCommunity = function(report) {
  document.getElementById('reportTitle').textContent = 'Community Complaints Report';
  document.getElementById('secondarySummaryTitle').textContent = 'Severity Summary';
  const s = report.summary || {};
  document.getElementById('summaryGrid').innerHTML = [card('Total', s.total), card('Submitted', s.submitted), card('Under Review', s.under_review), card('Verified', s.verified), card('Resolved', s.resolved), card('High Severity', s.high_severity)].join('');
  renderList('statusSummary', report.byStatus || [], 'status');
  renderList('secondarySummary', report.bySeverity || [], 'severity_level');
  const personKey = 'submitter_' + 'name';
  document.getElementById('reportTableHead').innerHTML = '<tr><th class="border p-2 text-left">Code</th><th class="border p-2 text-left">Title</th><th class="border p-2 text-left">DSD/GND</th><th class="border p-2 text-left">Reported By</th><th class="border p-2 text-left">Location</th><th class="border p-2 text-left">Category</th><th class="border p-2 text-left">Status</th><th class="border p-2 text-left">Severity</th><th class="border p-2 text-left">Solution</th></tr>';
  document.getElementById('reportTableBody').innerHTML = (report.records || []).map(r => `<tr><td class="border p-2">${esc(r.report_code)}</td><td class="border p-2">${esc(r.issue_title)}</td><td class="border p-2">${esc(r.dsd_name || '-')} / ${esc(r.gnd_name || '-')}</td><td class="border p-2">${esc(r[personKey] || '-')}</td><td class="border p-2">${esc(r.location_description || '')}<br><span class="text-slate-500">${esc(r.latitude || '-')}, ${esc(r.longitude || '-')}</span></td><td class="border p-2">${esc(r.category_name || '-')}</td><td class="border p-2">${esc(r.status || '-')}</td><td class="border p-2">${esc(r.severity_level || '-')}</td><td class="border p-2">${esc(r.solution_title || '-')}</td></tr>`).join('') || '<tr><td colspan="9" class="border p-3 text-center text-slate-500">No records found.</td></tr>';
};
