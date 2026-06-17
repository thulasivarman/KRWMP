class KRWMPLocationPicker {
  constructor(options = {}) {
    this.containerId = options.containerId;
    this.latitudeInput = document.querySelector(options.latitudeInput);
    this.longitudeInput = document.querySelector(options.longitudeInput);
    this.initialCenter = options.initialCenter || [80.2280810, 7.2334995];
    this.initialZoom = options.initialZoom || 11;
    this.onChange = typeof options.onChange === 'function' ? options.onChange : null;
    this.map = null;
    this.marker = null;
    this.statusElement = null;
    this.init();
  }

  init() {
    const container = document.getElementById(this.containerId);
    if (!container || !window.maplibregl) return;
    const mapNode = container.querySelector('[data-location-map]');
    this.statusElement = container.querySelector('[data-location-status]');
    const gpsButton = container.querySelector('[data-location-gps]');
    const clearButton = container.querySelector('[data-location-clear]');
    const lat = Number(this.latitudeInput?.value);
    const lng = Number(this.longitudeInput?.value);
    const hasPoint = Number.isFinite(lat) && Number.isFinite(lng);
    const center = hasPoint ? [lng, lat] : this.initialCenter;

    this.map = new maplibregl.Map({ container: mapNode, style: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json', center, zoom: hasPoint ? 13 : this.initialZoom });
    this.map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    this.marker = new maplibregl.Marker({ draggable: true, color: '#059669' }).setLngLat(center).addTo(this.map);
    if (!hasPoint) this.marker.getElement().style.display = 'none';
    this.map.on('click', event => this.setLocation(event.lngLat.lat, event.lngLat.lng, true));
    this.marker.on('dragend', () => { const p = this.marker.getLngLat(); this.setLocation(p.lat, p.lng, false); });
    gpsButton?.addEventListener('click', () => this.useBrowserLocation());
    clearButton?.addEventListener('click', () => this.clear());
    setTimeout(() => this.map.resize(), 250);
  }

  setLocation(latitude, longitude, fly = true) {
    const lat = Number(latitude);
    const lng = Number(longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) { this.setStatus('Invalid map location.', true); return; }
    const fixedLat = lat.toFixed(7);
    const fixedLng = lng.toFixed(7);
    if (this.latitudeInput) this.latitudeInput.value = fixedLat;
    if (this.longitudeInput) this.longitudeInput.value = fixedLng;
    this.marker.setLngLat([lng, lat]);
    this.marker.getElement().style.display = 'block';
    if (fly) this.map.flyTo({ center: [lng, lat], zoom: Math.max(this.map.getZoom(), 13), essential: true });
    this.setStatus('Selected: ' + fixedLat + ', ' + fixedLng);
    if (this.onChange) this.onChange({ latitude: Number(fixedLat), longitude: Number(fixedLng) });
  }

  useBrowserLocation() {
    if (!navigator.geolocation) return this.setStatus('Browser location is not available.', true);
    this.setStatus('Reading browser location...');
    navigator.geolocation.getCurrentPosition(p => this.setLocation(p.coords.latitude, p.coords.longitude, true), () => this.setStatus('Unable to read browser location. Click the map instead.', true), { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
  }

  clear() {
    if (this.latitudeInput) this.latitudeInput.value = '';
    if (this.longitudeInput) this.longitudeInput.value = '';
    if (this.marker) this.marker.getElement().style.display = 'none';
    this.setStatus('Location cleared. Click the map to select a point.');
    if (this.onChange) this.onChange({ latitude: null, longitude: null, cleared: true });
  }

  setStatus(message, error = false) {
    if (!this.statusElement) return;
    this.statusElement.textContent = message;
    this.statusElement.className = 'krwmp-status-label mt-2 ' + (error ? 'text-rose-300' : '');
  }

  refresh() { if (this.map) setTimeout(() => this.map.resize(), 150); }
}

function hideVWMCManualSpatialFields() {
  if (!window.location.pathname.endsWith('/vwmc-management.html')) return;
  ['dsd_name', 'gnd_name', 'latitude', 'longitude'].forEach(name => {
    const field = document.querySelector('[name="' + name + '"]');
    if (!field) return;
    const wrapper = field.closest('label') || field;
    wrapper.classList.add('hidden');
  });
}

document.addEventListener('DOMContentLoaded', hideVWMCManualSpatialFields);
window.KRWMPLocationPicker = KRWMPLocationPicker;
