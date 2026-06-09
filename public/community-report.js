const statusBox = document.getElementById('statusBox');
const form = document.getElementById('communityReportForm');
const categorySelect = document.getElementById('categorySelect');

async function initializeCommunityReportSidebar() {
  if (window.KRWMP_ENGINE) {
    await window.KRWMP_ENGINE.assembleInterfaceContext('/sidebar.html', 'sidebar');
  }
  document.querySelector('.krwmp-panel-section')?.classList.add('hidden');
  document.getElementById('section-data-layers')?.classList.add('hidden');
  document.getElementById('section-raster-layers')?.classList.add('hidden');
}

function showStatus(message, error = false) {
  statusBox.className = `rounded-lg p-3 text-sm ${error ? 'bg-rose-500/10 text-rose-300 border border-rose-500/30' : 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30'}`;
  statusBox.textContent = message;
  statusBox.classList.remove('hidden');
}

async function loadCategories() {
  const response = await fetch('/api/issue-categories');
  const data = await response.json();
  categorySelect.innerHTML = '<option value="">Select issue category</option>';
  (data.categories || []).forEach(category => {
    const option = document.createElement('option');
    option.value = category.id;
    option.textContent = category.category_name;
    categorySelect.appendChild(option);
  });
}

document.getElementById('useLocationBtn').addEventListener('click', () => {
  if (!navigator.geolocation) return showStatus('Geolocation is not available in this browser.', true);
  navigator.geolocation.getCurrentPosition(position => {
    document.getElementById('latitudeInput').value = position.coords.latitude.toFixed(7);
    document.getElementById('longitudeInput').value = position.coords.longitude.toFixed(7);
    showStatus('Current location captured.');
  }, () => showStatus('Unable to capture location. Please enter coordinates manually.', true));
});

form.addEventListener('submit', async event => {
  event.preventDefault();
  const formData = new FormData(form);
  try {
    const response = await fetch('/api/community-reports', { method: 'POST', body: formData });
    const data = await response.json();
    if (!response.ok || data.success === false) throw new Error(data.message || 'Submission failed');
    form.reset();
    await loadCategories();
    showStatus(`Issue submitted successfully. Reference: ${data.report.report_code}`);
  } catch (error) {
    showStatus(error.message, true);
  }
});

(async () => {
  await initializeCommunityReportSidebar();
  await loadCategories();
})().catch(() => showStatus('Unable to load issue categories.', true));
