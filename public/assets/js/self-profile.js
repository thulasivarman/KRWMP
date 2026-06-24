const utils = window.KRWMP_UTILS;
let modalReady = false;
let picker = null;
let spatialDebounce = null;

function qs(id) {
  return document.getElementById(id);
}

function esc(value) {
  return utils.escapeHtml(value);
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      existing.addEventListener('load', resolve, { once: true });
      if (existing.dataset.loaded === 'true') resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => { script.dataset.loaded = 'true'; resolve(); };
    script.onerror = () => reject(new Error(`Unable to load ${src}`));
    document.head.appendChild(script);
  });
}

function loadCss(href) {
  if (document.querySelector(`link[href="${href}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  document.head.appendChild(link);
}

async function ensureMapAssets() {
  loadCss('https://unpkg.com/maplibre-gl@3.6.2/dist/maplibre-gl.css');
  if (!window.maplibregl) await loadScript('https://unpkg.com/maplibre-gl@3.6.2/dist/maplibre-gl.js');
  if (!window.KRWMPLocationPicker) await loadScript('/assets/js/location-picker.js');
}

function showStatus(message, error = false) {
  utils.showStatus(qs('krwmp-self-profile-status'), message, error);
}

function setSpatialText(dsd = '-', gnd = '-') {
  qs('krwmp-self-profile-dsd-text').textContent = dsd || '-';
  qs('krwmp-self-profile-gnd-text').textContent = gnd || '-';
}

function ensureModal() {
  if (modalReady && qs('krwmp-self-profile-modal')) return;
  const wrapper = document.createElement('div');
  wrapper.innerHTML = `
    <dialog id="krwmp-self-profile-modal" class="krwmp-modal krwmp-modal-xl">
      <header class="krwmp-modal-header">
        <div>
          <h2 class="krwmp-modal-title">My Profile</h2>
          <p class="form-helper mt-1">Update your contact details and select your location from the map. DSD and GND are detected automatically.</p>
        </div>
        <button type="button" id="krwmp-self-profile-close" class="krwmp-modal-close" aria-label="Close profile editor">&times;</button>
      </header>
      <form id="krwmp-self-profile-form" class="krwmp-modal-body grid grid-cols-1 md:grid-cols-2 gap-4" novalidate>
        <section id="krwmp-self-profile-status" class="hidden md:col-span-2 rounded-lg p-3 text-sm"></section>
        <input type="hidden" name="person_id">
        <input type="hidden" name="dsd">
        <input type="hidden" name="gnd">
        <input type="hidden" name="latitude" id="krwmpSelfProfileLatitude">
        <input type="hidden" name="longitude" id="krwmpSelfProfileLongitude">

        <label class="form-label">Full Name <span class="text-rose-400">*</span>
          <input name="name" required minlength="2" maxlength="255" class="form-input mt-1">
        </label>
        <label class="form-label">Preferred Name
          <input name="preferred_name" maxlength="150" class="form-input mt-1">
        </label>
        <label class="form-label">Email
          <input name="email" type="email" maxlength="150" class="form-input mt-1">
        </label>
        <label class="form-label">Phone Number
          <input name="phone_number" maxlength="30" class="form-input mt-1">
        </label>
        <label class="form-label md:col-span-2">Address
          <textarea name="address" maxlength="500" rows="3" class="form-textarea mt-1"></textarea>
        </label>

        <section id="krwmpSelfProfileLocationPicker" class="md:col-span-2 krwmp-map-panel">
          <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-3">
            <div>
              <h3 class="form-section-heading">Profile Location</h3>
              <p class="form-helper">Click the map or drag the marker. DSD and GND will be auto-captured from the selected point.</p>
            </div>
            <div class="flex gap-2">
              <button type="button" data-location-gps class="krwmp-btn krwmp-btn-secondary krwmp-btn-sm">Use Browser Location</button>
              <button type="button" data-location-clear class="krwmp-btn krwmp-btn-secondary krwmp-btn-sm">Clear</button>
            </div>
          </div>
          <div data-location-map class="krwmp-location-map h-72"></div>
          <div data-location-status class="krwmp-status-label mt-2">No location selected.</div>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3 border-t border-slate-800 pt-3">
            <div class="krwmp-identify-panel"><div class="krwmp-stat-label">DS Division</div><div id="krwmp-self-profile-dsd-text" class="text-slate-200 mt-1">Not detected</div></div>
            <div class="krwmp-identify-panel"><div class="krwmp-stat-label">GN Division</div><div id="krwmp-self-profile-gnd-text" class="text-slate-200 mt-1">Not detected</div></div>
          </div>
        </section>

        <section class="md:col-span-2 krwmp-card-muted p-4 grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
          <div><div class="krwmp-status-label">Login Identifier</div><div id="krwmp-self-profile-identifier" class="font-semibold text-slate-200">-</div></div>
          <div><div class="krwmp-status-label">User Group</div><div id="krwmp-self-profile-role" class="font-semibold text-slate-200">-</div></div>
          <div><div class="krwmp-status-label">Institution</div><div id="krwmp-self-profile-institution" class="font-semibold text-slate-200">-</div></div>
        </section>

        <footer class="md:col-span-2 krwmp-modal-actions px-0 pb-0">
          <button type="submit" class="krwmp-btn krwmp-btn-primary">Save Profile</button>
          <button type="button" id="krwmp-self-profile-cancel" class="krwmp-btn krwmp-btn-secondary">Cancel</button>
        </footer>
      </form>
    </dialog>`;
  document.body.appendChild(wrapper.firstElementChild);
  const close = () => qs('krwmp-self-profile-modal')?.close();
  qs('krwmp-self-profile-close')?.addEventListener('click', close);
  qs('krwmp-self-profile-cancel')?.addEventListener('click', close);
  qs('krwmp-self-profile-form')?.addEventListener('submit', saveProfile);
  modalReady = true;
}

async function identifyLocation(latitude, longitude) {
  clearTimeout(spatialDebounce);
  return new Promise(resolve => {
    spatialDebounce = setTimeout(async () => {
      const form = qs('krwmp-self-profile-form');
      try {
        const data = await utils.apiRequest(`/api/spatial/identify?lat=${encodeURIComponent(latitude)}&lng=${encodeURIComponent(longitude)}`);
        const dsd = data.dsd?.dsd_name || data.dsd?.name || '';
        const gnd = data.gnd?.gnd_name || data.gnd?.name || '';
        form.elements.dsd.value = dsd;
        form.elements.gnd.value = gnd;
        setSpatialText(dsd || 'Not detected', gnd || 'Not detected');
        resolve(data);
      } catch (error) {
        form.elements.dsd.value = '';
        form.elements.gnd.value = '';
        setSpatialText('Not detected', 'Not detected');
        showStatus(error.message || 'Unable to identify DSD/GND from the selected point.', true);
        resolve(null);
      }
    }, 250);
  });
}

function initPicker() {
  const form = qs('krwmp-self-profile-form');
  if (picker) {
    picker.refresh();
    return;
  }
  picker = new window.KRWMPLocationPicker({
    containerId: 'krwmpSelfProfileLocationPicker',
    latitudeInput: '#krwmpSelfProfileLatitude',
    longitudeInput: '#krwmpSelfProfileLongitude',
    onChange: ({ latitude, longitude, cleared }) => {
      if (cleared) {
        form.elements.dsd.value = '';
        form.elements.gnd.value = '';
        setSpatialText('Not detected', 'Not detected');
        return;
      }
      identifyLocation(latitude, longitude);
    }
  });
}

async function open() {
  ensureModal();
  const modal = qs('krwmp-self-profile-modal');
  const form = qs('krwmp-self-profile-form');
  qs('krwmp-self-profile-status')?.classList.add('hidden');
  form.reset();
  setSpatialText('Not detected', 'Not detected');
  modal.showModal();
  try {
    await ensureMapAssets();
    const data = await utils.apiRequest('/api/me/profile');
    const user = data.profile?.user || {};
    const person = data.profile?.person || {};
    form.elements.person_id.value = person.id || '';
    form.elements.name.value = person.full_name || user.name || '';
    form.elements.preferred_name.value = person.preferred_name || '';
    form.elements.email.value = person.email || user.email || '';
    form.elements.phone_number.value = person.phone_number || user.phone_number || '';
    form.elements.address.value = person.address || '';
    form.elements.dsd.value = person.dsd || '';
    form.elements.gnd.value = person.gnd || '';
    form.elements.latitude.value = person.latitude || '';
    form.elements.longitude.value = person.longitude || '';
    qs('krwmp-self-profile-identifier').textContent = user.identifier || '-';
    qs('krwmp-self-profile-role').textContent = user.role_name || '-';
    qs('krwmp-self-profile-institution').textContent = user.institution_name || '-';
    setSpatialText(person.dsd || 'Not detected', person.gnd || 'Not detected');
    initPicker();
    setTimeout(() => {
      picker.refresh();
      if (person.latitude && person.longitude) picker.setLocation(person.latitude, person.longitude, false);
    }, 250);
  } catch (error) {
    showStatus(error.message || 'Unable to load profile.', true);
  }
}

async function saveProfile(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const submit = form.querySelector('button[type="submit"]');
  const payload = Object.fromEntries(new FormData(form).entries());
  if (!String(payload.name || '').trim()) return showStatus('Full name is required.', true);
  submit.disabled = true;
  submit.textContent = 'Saving...';
  try {
    const data = await utils.apiRequest('/api/me/profile', { method: 'PUT', body: payload });
    const user = data.profile?.user || {};
    if (window.KRWMP_ENGINE) {
      window.KRWMP_ENGINE.Session.user = { ...window.KRWMP_ENGINE.Session.user, ...user };
      localStorage.setItem('krwmp_user', JSON.stringify(window.KRWMP_ENGINE.Session.user));
      window.KRWMP_ENGINE.syncProfileMetadata();
    }
    showStatus('Profile updated successfully.');
    setTimeout(() => qs('krwmp-self-profile-modal')?.close(), 700);
  } catch (error) {
    showStatus(error.message || 'Unable to update profile.', true);
  } finally {
    submit.disabled = false;
    submit.textContent = 'Save Profile';
  }
}

window.KRWMP_SELF_PROFILE = { open };
export { open };
