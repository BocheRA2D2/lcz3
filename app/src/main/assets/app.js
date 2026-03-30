/* =========================================================
   LCZ3 Dashboard – app.js
   Huawei P30 Pro Fullscreen Dashboard
   ========================================================= */

'use strict';

// ─── CONFIG ──────────────────────────────────────────────
const OWM_KEY = '1a2bd67974b9a6025c9e245b42a4c530';
const WEATHER_REFRESH_MS = 10 * 60 * 1000; // 10 min
const BATTERY_REFRESH_MS = 30 * 1000;       // 30 s
const DOUBLE_TAP_MS = 400;                  // double-tap window

// ─── STATE ───────────────────────────────────────────────
const state = {
  theme: 'dark',
  autoPause: true,
  editMode: false,
  tripRunning: false,
  tripElapsed: 0,        // ms accumulated
  tripStart: null,       // timestamp when last started
  lastClockTap: 0,
  geo: null,             // { lat, lon }
  weatherInterval: null,
  batteryInterval: null,
  batteryObj: null,
};

// ─── DAYS / MONTHS IN PL ─────────────────────────────────
const DAYS_PL = ['Niedziela','Poniedziałek','Wtorek','Środa','Czwartek','Piątek','Sobota'];
const MONTHS_PL = ['01','02','03','04','05','06','07','08','09','10','11','12'];

// ─── WEATHER ICONS MAP ───────────────────────────────────
const WX_ICONS = {
  '01d':'☀️','01n':'🌙',
  '02d':'🌤','02n':'🌤',
  '03d':'🌥','03n':'🌥',
  '04d':'☁️','04n':'☁️',
  '09d':'🌧','09n':'🌧',
  '10d':'🌦','10n':'🌦',
  '11d':'⛈','11n':'⛈',
  '13d':'❄️','13n':'❄️',
  '50d':'🌫','50n':'🌫',
};

// ─────────────────────────────────────────────────────────
// CLOCK
// ─────────────────────────────────────────────────────────
(function initClock() {
  const elTime = document.getElementById('clock-time');
  const elDate = document.getElementById('clock-date');

  // Double-tap detection for settings
  elTime.addEventListener('click', () => {
    const now = Date.now();
    if (now - state.lastClockTap < DOUBLE_TAP_MS) {
      openSettings();
      state.lastClockTap = 0;
    } else {
      state.lastClockTap = now;
    }
  });

  function pad(n) { return String(n).padStart(2, '0'); }

  function tick() {
    const d = new Date();
    const hh = pad(d.getHours());
    const mm = pad(d.getMinutes());
    elTime.textContent = `${hh}:${mm}`;

    const day = DAYS_PL[d.getDay()];
    const dd = pad(d.getDate());
    const mo = MONTHS_PL[d.getMonth()];
    const yy = d.getFullYear();
    elDate.textContent = `${day} ${dd}-${mo}-${yy}`;

    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
})();

// ─────────────────────────────────────────────────────────
// TRIP TIMER
// ─────────────────────────────────────────────────────────
const elTripDisplay = document.getElementById('trip-display');
const elTripBtn = document.getElementById('btn-trip');

function formatElapsed(ms) {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

let timerRAF = null;
function timerLoop() {
  if (!state.tripRunning) return;
  const now = Date.now();
  const total = state.tripElapsed + (now - state.tripStart);
  elTripDisplay.textContent = formatElapsed(total);
  timerRAF = requestAnimationFrame(timerLoop);
}

function toggleTrip() {
  if (!state.tripRunning) {
    // START
    state.tripRunning = true;
    state.tripStart = Date.now();
    elTripBtn.classList.remove('start');
    elTripBtn.classList.add('stop');
    elTripBtn.querySelector('.btn-icon').textContent = '■';
    elTripBtn.querySelector('.btn-text').textContent = 'STOP';
    timerRAF = requestAnimationFrame(timerLoop);
  } else {
    // STOP AND RESET
    state.tripElapsed = 0;
    state.tripRunning = false;
    if (timerRAF) cancelAnimationFrame(timerRAF);
    elTripDisplay.textContent = '00:00:00';
    elTripBtn.classList.remove('stop');
    elTripBtn.classList.add('start');
    elTripBtn.querySelector('.btn-icon').textContent = '▶';
    elTripBtn.querySelector('.btn-text').textContent = 'START';
  }
}

// Auto-pause on visibility change
document.addEventListener('visibilitychange', () => {
  if (!state.autoPause) return;
  if (document.hidden && state.tripRunning) {
    // Pause: accumulate elapsed
    state.tripElapsed += Date.now() - state.tripStart;
    state.tripRunning = false;
    if (timerRAF) cancelAnimationFrame(timerRAF);
    // Keep button showing "STOP" so user knows it was running
  } else if (!document.hidden && elTripBtn.classList.contains('stop')) {
    // Resume
    state.tripRunning = true;
    state.tripStart = Date.now();
    timerRAF = requestAnimationFrame(timerLoop);
  }
});

// ─────────────────────────────────────────────────────────
// BATTERY
// ─────────────────────────────────────────────────────────
const elBattFill = document.getElementById('battery-fill');
const elBattPct = document.getElementById('battery-pct');
const elBattStatus = document.getElementById('battery-status');

function updateBattery(bat) {
  const pct = Math.round(bat.level * 100);
  elBattPct.textContent = `${pct}%`;
  elBattFill.style.width = `${pct}%`;

  // Color
  let color;
  if (pct > 50) color = 'var(--battery-ok)';
  else if (pct > 20) color = 'var(--battery-mid)';
  else { color = 'var(--battery-low)'; elBattFill.classList.add('low'); }
  if (pct > 20) elBattFill.classList.remove('low');
  elBattFill.style.background = color;

  elBattStatus.textContent = bat.charging ? `⚡ Ładowanie (${pct}%)` : (pct < 10 ? '⚠ Niski poziom!' : 'Na baterii');
}

async function initBattery() {
  if (!navigator.getBattery) {
    elBattPct.textContent = 'N/A';
    elBattStatus.textContent = 'API niedostępne';
    return;
  }
  const bat = await navigator.getBattery();
  state.batteryObj = bat;
  updateBattery(bat);
  bat.addEventListener('levelchange', () => updateBattery(bat));
  bat.addEventListener('chargingchange', () => updateBattery(bat));
}
initBattery();

// ─────────────────────────────────────────────────────────
// WEATHER
// ─────────────────────────────────────────────────────────
const elWxIcon = document.getElementById('weather-icon');
const elWxTemp = document.getElementById('weather-temp');
const elWxDesc = document.getElementById('weather-desc');
const elFcIcon = document.getElementById('forecast-icon');
const elFcTemp = document.getElementById('forecast-temp');
const elFcDesc = document.getElementById('forecast-desc');
const elRefreshBtn = document.getElementById('btn-refresh');

function getWeatherIcon(code) {
  return WX_ICONS[code] || '🌡';
}

async function fetchWeather(lat, lon) {
  try {
    const base = `https://api.openweathermap.org/data/2.5/`;
    const params = `lat=${lat}&lon=${lon}&appid=${OWM_KEY}&units=metric&lang=pl`;

    const [curRes, fcRes] = await Promise.all([
      fetch(`${base}weather?${params}`),
      fetch(`${base}forecast?${params}&cnt=4`)
    ]);

    if (!curRes.ok || !fcRes.ok) throw new Error('API error');
    const cur = await curRes.json();
    const fc = await fcRes.json();

    // Current
    elWxIcon.textContent = getWeatherIcon(cur.weather[0].icon);
    elWxTemp.textContent = `${Math.round(cur.main.temp)}°C`;
    elWxDesc.textContent = cur.weather[0].description;

    // Forecast +1h (first slot is ~3h, close enough; OWM free tier gives 3h steps)
    const slot = fc.list[0];
    elFcIcon.textContent = getWeatherIcon(slot.weather[0].icon);
    elFcTemp.textContent = `${Math.round(slot.main.temp)}°C`;
    elFcDesc.textContent = slot.weather[0].description;

  } catch (e) {
    elWxDesc.textContent = 'Błąd pobierania pogody';
    elFcDesc.textContent = '—';
    console.error('Weather fetch error:', e);
  }
}

function refreshWeather() {
  if (!state.geo) { locateAndLoadWeather(); return; }
  elRefreshBtn.classList.add('spinning');
  fetchWeather(state.geo.lat, state.geo.lon)
    .finally(() => elRefreshBtn.classList.remove('spinning'));
}

function locateAndLoadWeather() {
  // Try saved position first
  const saved = localStorage.getItem('lcz3_geo');
  if (saved) {
    state.geo = JSON.parse(saved);
    refreshWeather();
    return;
  }
  if (!navigator.geolocation) {
    elWxDesc.textContent = 'Geolokalizacja niedostępna';
    return;
  }
  navigator.geolocation.getCurrentPosition(
    pos => {
      state.geo = { lat: pos.coords.latitude, lon: pos.coords.longitude };
      localStorage.setItem('lcz3_geo', JSON.stringify(state.geo));
      refreshWeather();
    },
    () => { elWxDesc.textContent = 'Brak dostępu do lokalizacji'; }
  );
}

function startWeatherTimer() {
  locateAndLoadWeather();
  if (state.weatherInterval) clearInterval(state.weatherInterval);
  state.weatherInterval = setInterval(refreshWeather, WEATHER_REFRESH_MS);
}
startWeatherTimer();

// ─────────────────────────────────────────────────────────
// SETTINGS MENU
// ─────────────────────────────────────────────────────────
const overlay = document.getElementById('settings-overlay');

function openSettings() {
  overlay.classList.remove('hidden');
  syncSettingsUI();
}
function closeSettings() {
  overlay.classList.add('hidden');
}
// Close on backdrop click
overlay.addEventListener('click', e => {
  if (e.target === overlay) closeSettings();
});

function syncSettingsUI() {
  const body = document.getElementById('app-body');
  document.getElementById('chk-autopause').checked = state.autoPause;
  ['dark','light','fancy'].forEach(t => {
    document.getElementById(`btn-${t}`).classList.toggle('active', body.classList.contains(`theme-${t}`));
  });
}

// ─────────────────────────────────────────────────────────
// THEME
// ─────────────────────────────────────────────────────────
function setTheme(name) {
  const body = document.getElementById('app-body');
  body.classList.remove('theme-dark','theme-light','theme-fancy');
  body.classList.add(`theme-${name}`);
  state.theme = name;
  localStorage.setItem('lcz3_theme', name);
  syncSettingsUI();
}

// ─────────────────────────────────────────────────────────
// AUTO-PAUSE
// ─────────────────────────────────────────────────────────
function setAutoPause(val) {
  state.autoPause = val;
  localStorage.setItem('lcz3_autopause', String(val));
}

// ─────────────────────────────────────────────────────────
// ORIENTATION
// ─────────────────────────────────────────────────────────
function setOrientation(dir) {
  if (screen.orientation && screen.orientation.lock) {
    const lockType = dir === 'portrait' ? 'portrait-primary' : 'landscape-primary';
    screen.orientation.lock(lockType).catch(() => {
      alert('Zablokuj orientację w ustawieniach Androida lub włącz pełny ekran.');
    });
  } else {
    alert('Twoja przeglądarka nie obsługuje blokady orientacji.');
  }
  // Highlight active btn
  ['portrait','landscape'].forEach(d => {
    document.getElementById(`btn-${d}`).classList.toggle('active', d === dir);
  });
  localStorage.setItem('lcz3_orientation', dir);
}

// ─────────────────────────────────────────────────────────
// FULLSCREEN
// ─────────────────────────────────────────────────────────
function requestFullscreen() {
  const el = document.documentElement;
  if (el.requestFullscreen) el.requestFullscreen();
  else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
  closeSettings();
}

// ─────────────────────────────────────────────────────────
// EDIT MODE (Drag & Resize with Pointer Events)
// ─────────────────────────────────────────────────────────
const editBar = document.getElementById('edit-bar');
const btnEdit = document.getElementById('btn-edit');
const btnSave = document.getElementById('btn-save');

// Add resize and font handles to all widgets
document.querySelectorAll('.widget').forEach(w => {
  const rh = document.createElement('div');
  rh.className = 'resize-handle';
  rh.textContent = '⤡';
  w.appendChild(rh);

  const fontPlus = document.createElement('div');
  fontPlus.className = 'font-handle plus';
  fontPlus.textContent = '+';
  fontPlus.onclick = (e) => {
    if (!state.editMode) return;
    e.stopPropagation();
    let currentScale = parseFloat(w.style.getPropertyValue('--font-scale')) || 1;
    w.style.setProperty('--font-scale', (currentScale + 0.1).toFixed(2));
  };
  w.appendChild(fontPlus);

  const fontMinus = document.createElement('div');
  fontMinus.className = 'font-handle minus';
  fontMinus.textContent = '−'; // minus sign
  fontMinus.onclick = (e) => {
    if (!state.editMode) return;
    e.stopPropagation();
    let currentScale = parseFloat(w.style.getPropertyValue('--font-scale')) || 1;
    w.style.setProperty('--font-scale', Math.max(0.2, currentScale - 0.1).toFixed(2));
  };
  w.appendChild(fontMinus);
});

function toggleEditMode() {
  state.editMode = !state.editMode;
  const body = document.getElementById('app-body');
  body.classList.toggle('edit-mode', state.editMode);
  editBar.classList.toggle('hidden', !state.editMode);
  btnEdit.textContent = state.editMode ? '✏ Wyjdź z edycji' : '✏ Tryb edycji';
  btnSave.style.display = state.editMode ? 'block' : 'none';

  if (state.editMode) {
    enableDragResize();
    // Make dashboard position:relative so absolute widgets work
    document.getElementById('dashboard').style.position = 'relative';
    // Convert grid to absolute positions
    convertToAbsolute();
  } else {
    disableDragResize();
  }
}

function convertToAbsolute() {
  const db = document.getElementById('dashboard');
  const saved = loadLayoutData();
  document.querySelectorAll('.widget').forEach(w => {
    const id = w.dataset.id;
    if (saved && saved[id]) {
      applyPos(w, saved[id]);
    } else {
      const rect = w.getBoundingClientRect();
      const dbRect = db.getBoundingClientRect();
      w.style.position = 'absolute';
      w.style.left = (rect.left - dbRect.left) + 'px';
      w.style.top = (rect.top - dbRect.top) + 'px';
      w.style.width = rect.width + 'px';
      w.style.height = 'auto';
    }
  });
}

function applyPos(w, p) {
  w.style.position = 'absolute';
  w.style.left = p.left;
  w.style.top = p.top;
  w.style.width = p.width;
  if (p.height) w.style.height = p.height;
  if (p.scale !== undefined) w.style.setProperty('--font-scale', p.scale);
}

function disableDragResize() {
  document.querySelectorAll('.widget').forEach(w => {
    const id = w.dataset.id;
    const saved = loadLayoutData();
    if (!saved || !saved[id]) {
      // Restore normal flow
      w.style.position = '';
      w.style.left = '';
      w.style.top = '';
      w.style.width = '';
      w.style.height = '';
    }
  });
  // Remove all pointer listeners (re-attach next time)
}

// ---- Drag ----
let dragEl = null, dragOffX = 0, dragOffY = 0;

function enableDragResize() {
  document.querySelectorAll('.widget').forEach(w => {
    const handle = w.querySelector('.edit-handle');
    const rh = w.querySelector('.resize-handle');

    handle.addEventListener('pointerdown', startDrag);
    rh.addEventListener('pointerdown', startResize);
  });
}

function startDrag(e) {
  if (!state.editMode) return;
  e.stopPropagation();
  dragEl = e.target.closest('.widget');
  const rect = dragEl.getBoundingClientRect();
  const db = document.getElementById('dashboard').getBoundingClientRect();
  dragEl.style.position = 'absolute';
  dragEl.style.left = (rect.left - db.left) + 'px';
  dragEl.style.top = (rect.top - db.top) + 'px';
  dragEl.style.width = rect.width + 'px';
  dragOffX = e.clientX - rect.left;
  dragOffY = e.clientY - rect.top;
  dragEl.setPointerCapture(e.pointerId);
  dragEl.addEventListener('pointermove', onDragMove);
  dragEl.addEventListener('pointerup', onDragEnd);
  dragEl.style.zIndex = 10;
  dragEl.style.transition = 'none';
}

function onDragMove(e) {
  if (!dragEl) return;
  const db = document.getElementById('dashboard').getBoundingClientRect();
  let x = e.clientX - db.left - dragOffX;
  let y = e.clientY - db.top - dragOffY;
  // Clamp within dashboard
  x = Math.max(0, Math.min(db.width - dragEl.offsetWidth, x));
  y = Math.max(0, Math.min(db.height - dragEl.offsetHeight, y));
  dragEl.style.left = x + 'px';
  dragEl.style.top = y + 'px';
}

function onDragEnd(e) {
  if (!dragEl) return;
  dragEl.style.zIndex = '';
  dragEl.style.transition = '';
  dragEl.removeEventListener('pointermove', onDragMove);
  dragEl.removeEventListener('pointerup', onDragEnd);
  dragEl = null;
}

// ---- Resize ----
let resizeEl = null, resizeStartW = 0, resizeStartH = 0, resizeStartX = 0, resizeStartY = 0;

function startResize(e) {
  if (!state.editMode) return;
  e.stopPropagation();
  resizeEl = e.target.closest('.widget');
  resizeStartW = resizeEl.offsetWidth;
  resizeStartH = resizeEl.offsetHeight;
  resizeStartX = e.clientX;
  resizeStartY = e.clientY;
  resizeEl.setPointerCapture(e.pointerId);
  resizeEl.addEventListener('pointermove', onResizeMove);
  resizeEl.addEventListener('pointerup', onResizeEnd);
  resizeEl.style.transition = 'none';
  resizeEl.style.overflow = 'hidden';
}

function onResizeMove(e) {
  if (!resizeEl) return;
  const db = document.getElementById('dashboard').getBoundingClientRect();
  const newW = Math.max(120, resizeStartW + (e.clientX - resizeStartX));
  const newH = Math.max(80, resizeStartH + (e.clientY - resizeStartY));
  resizeEl.style.width = Math.min(newW, db.width - parseInt(resizeEl.style.left || 0)) + 'px';
  resizeEl.style.height = newH + 'px';
}

function onResizeEnd(e) {
  if (!resizeEl) return;
  resizeEl.style.transition = '';
  resizeEl.style.overflow = '';
  resizeEl.removeEventListener('pointermove', onResizeMove);
  resizeEl.removeEventListener('pointerup', onResizeEnd);
  resizeEl = null;
}

// ─────────────────────────────────────────────────────────
// LAYOUT SAVE / LOAD
// ─────────────────────────────────────────────────────────
function saveLayout() {
  const layout = {};
  document.querySelectorAll('.widget').forEach(w => {
    layout[w.dataset.id] = {
      left: w.style.left,
      top: w.style.top,
      width: w.style.width,
      height: w.style.height,
      scale: w.style.getPropertyValue('--font-scale') || 1
    };
  });
  localStorage.setItem('lcz3_layout', JSON.stringify(layout));
  // Visual feedback
  const bar = document.getElementById('edit-bar');
  const orig = bar.querySelector('span').textContent;
  bar.querySelector('span').textContent = '✅ Układ zapisany!';
  setTimeout(() => bar.querySelector('span').textContent = orig, 1500);
}

function loadLayoutData() {
  const raw = localStorage.getItem('lcz3_layout');
  const defaultLayout = {"clock":{"left":"14px","top":"14px","width":"364px","height":"67px","scale":1.39},"timer":{"left":"14px","top":"95px","width":"364px","height":"108px","scale":1.81},"battery":{"left":"14px","top":"217px","width":"364px","height":"108px","scale":2.5},"weather":{"left":"14px","top":"339px","width":"182px","height":"101px","scale":1.7},"forecast":{"left":"213px","top":"337px","width":"140px","height":"101px","scale":1.84},"map":{"left":"8px","top":"464px","width":"365px","height":"283px","scale":1}};
  return raw ? JSON.parse(raw) : defaultLayout;
}

function applyStoredLayout() {
  const saved = loadLayoutData();
  if (!saved) return;
  document.getElementById('dashboard').style.position = 'relative';
  document.querySelectorAll('.widget').forEach(w => {
    const id = w.dataset.id;
    if (saved[id] && saved[id].left) applyPos(w, saved[id]);
  });
}

function resetLayout() {
  localStorage.removeItem('lcz3_layout');
  document.querySelectorAll('.widget').forEach(w => {
    w.style.position = '';
    w.style.left = ''; w.style.top = '';
    w.style.width = ''; w.style.height = '';
  });
  document.getElementById('dashboard').style.position = '';
  if (state.editMode) toggleEditMode();
  closeSettings();
  location.reload();
}

// ─────────────────────────────────────────────────────────
// MAP INITIALIZATION
// ─────────────────────────────────────────────────────────
let lMap = null;
let lMarker = null;

function initMapWidget() {
  const mapContainer = document.getElementById('map-container');
  if (!mapContainer || typeof L === 'undefined') return;

  // Domyślna lokalizacja startowa (Środek Polski jak GPS nie działa)
  const defaultPos = [52.069167, 19.480556];
  
  lMap = L.map('map-container', {
    zoomControl: false, // minimalistyczny interfejs
    attributionControl: false
  }).setView(defaultPos, 14);

  // Wymuszenie odświeżenia rozmiaru w przypadku zmian układu
  setTimeout(() => lMap.invalidateSize(), 500);

  // Mroczny motyw mapy (CartoDB Dark Matter - darmowy)
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap'
  }).addTo(lMap);

  lMarker = L.circleMarker(defaultPos, {
    color: '#000',
    weight: 2,
    fillColor: '#00d4aa', // Kolor akcentu
    fillOpacity: 1,
    radius: 7
  }).addTo(lMap);

  // Nasłuchiwanie zmian na zewnątrz
  window.addEventListener('resize', () => {
    lMap.invalidateSize();
  });

  // Śledzenie GPS
  if ('geolocation' in navigator) {
    navigator.geolocation.watchPosition(pos => {
      const latlng = [pos.coords.latitude, pos.coords.longitude];
      lMarker.setLatLng(latlng);
      lMap.setView(latlng);
    }, err => {
      console.warn('GPS Error mapping:', err);
    }, {
      enableHighAccuracy: true,
      maximumAge: 10000,
      timeout: 10000
    });
  }
}

// ─────────────────────────────────────────────────────────
// INIT – Load saved preferences
// ─────────────────────────────────────────────────────────
(function init() {
  // Theme
  const savedTheme = localStorage.getItem('lcz3_theme') || 'dark';
  setTheme(savedTheme);

  // Auto-pause
  const ap = localStorage.getItem('lcz3_autopause');
  if (ap !== null) state.autoPause = ap === 'true';

  // Layout
  applyStoredLayout();

  // Inicjalizacja Nowej Mapy
  initMapWidget();

  // Wake lock (keep screen on – best effort)
  if ('wakeLock' in navigator) {
    const acquireWakeLock = async () => {
      try {
        await navigator.wakeLock.request('screen');
      } catch (e) { /* not critical */ }
    };
    acquireWakeLock();
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) acquireWakeLock();
    });
  }
})();
