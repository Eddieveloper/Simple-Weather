'use strict';

/* ------------------------------------------------------------------ */
/* Tiny helpers                                                        */
/* ------------------------------------------------------------------ */

const $ = (selector) => document.querySelector(selector);
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

function readStorage(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : JSON.parse(value);
  } catch {
    return fallback;
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Private mode etc. — the app still works, it just forgets. */
  }
}

async function fetchJson(url, { timeoutMs = 12000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`The forecast service said “${response.status}”. Try again in a bit?`);
    return await response.json();
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('That took too long — check your connection and try again.');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------------------------------------------ */
/* Weather codes (WMO) + advice helpers                                */
/* ------------------------------------------------------------------ */

const weatherCodes = {
  0: ['☀️', 'Clear sky'],
  1: ['🌤️', 'Mainly clear'],
  2: ['⛅', 'Partly cloudy'],
  3: ['☁️', 'Overcast'],
  45: ['🌫️', 'Foggy'],
  48: ['🌫️', 'Icy fog'],
  51: ['🌦️', 'Light drizzle'],
  53: ['🌦️', 'Drizzle'],
  55: ['🌦️', 'Heavy drizzle'],
  56: ['🌧️', 'Freezing drizzle'],
  57: ['🌧️', 'Freezing drizzle'],
  61: ['🌧️', 'Light rain'],
  63: ['🌧️', 'Rainy'],
  65: ['🌧️', 'Heavy rain'],
  66: ['🌧️', 'Freezing rain'],
  67: ['🌧️', 'Freezing rain'],
  71: ['🌨️', 'Light snow'],
  73: ['🌨️', 'Snowy'],
  75: ['❄️', 'Heavy snow'],
  77: ['🌨️', 'Snow grains'],
  80: ['🌦️', 'Light showers'],
  81: ['🌧️', 'Rain showers'],
  82: ['⛈️', 'Violent showers'],
  85: ['🌨️', 'Snow showers'],
  86: ['🌨️', 'Snow showers'],
  95: ['⛈️', 'Thunderstorm'],
  96: ['⛈️', 'Storm with hail'],
  99: ['⛈️', 'Storm with hail'],
};

const SNOW_CODES = new Set([71, 73, 75, 77, 85, 86]);
const isWet = (code) => code >= 51;
const isStorm = (code) => code >= 95;
const isSnow = (code) => SNOW_CODES.has(code);

function clothingAdvice(tempC, code, windKmh) {
  let base;
  if (tempC < 0) base = 'Bundle up: heavy coat, scarf, gloves, and warm boots.';
  else if (tempC < 8) base = 'Cozy layers plus a warm coat — and don’t forget a hat.';
  else if (tempC < 14) base = 'Layer up with a soft cardigan or a light jacket.';
  else if (tempC < 20) base = 'Light layers and comfy shoes, plus a jacket for later just in case.';
  else if (tempC < 27) base = 'Breezy fabrics, comfy shoes, and your favorite sunny-day accessory.';
  else base = 'Keep it light and breathable, and carry some water.';
  if (isWet(code)) base += ' Bring a cute raincoat and shoes that can handle puddles.';
  else if (windKmh >= 25) base += ' It’s gusty, so add a wind-resistant layer.';
  return base;
}

function activityAdvice(code, tempC) {
  if (isStorm(code)) return 'Stormy skies — café date, museum wander, or a cozy creative afternoon indoors.';
  if (isSnow(code)) return 'Snow day! A bundled-up stroll, then hot cocoa to warm back up.';
  if (isWet(code)) return 'Damp outside — a perfect excuse for a café, bookshop, or movie afternoon.';
  if (tempC >= 30) return 'Hot one — plan shady or watery fun, and save errands for the cooler hours.';
  if (tempC < 5) return 'Crisp air — a brisk walk is lovely if you bundle up, or stay cozy inside.';
  return 'Lovely out — perfect for a park stroll, picnic, or little photo walk.';
}

function comfortAdvice(hourly, current, hourIndex) {
  const uv = Math.round(hourly.uv_index?.[hourIndex] ?? 0);
  let advice;
  if (uv >= 8) advice = `UV ${uv} (very high): sunscreen, sunglasses, and shade breaks, please.`;
  else if (uv >= 6) advice = `UV ${uv}: sunglasses and sunscreen are a good idea.`;
  else if (uv >= 3) advice = `UV ${uv}: a little sunscreen will keep the day comfy.`;
  else advice = `UV ${uv}: gentle sunshine, no special sun prep needed.`;
  if (current.relative_humidity_2m >= 85) advice += ' The air feels muggy — light fabrics help.';
  else if (current.relative_humidity_2m <= 30) advice += ' The air is dry — keep some water nearby.';
  return advice;
}

/* ------------------------------------------------------------------ */
/* Elements + state                                                    */
/* ------------------------------------------------------------------ */

const form = $('#searchForm');
const input = $('#cityInput');
const error = $('#error');
const searchButton = $('#searchButton');
const refreshButton = $('#refreshButton');
const recentList = $('#recentCities');
const weatherPanel = $('#weather');
const themeButton = $('#themeButton');
const unitButtons = [...document.querySelectorAll('[data-units]')];
const mapStatus = $('#mapStatus');
const radarToggle = $('#radarToggle');
const radarTime = $('#radarTime');

const state = {
  units: readStorage('sw:units', 'celsius'),
  theme: readStorage('sw:theme', 'auto'),
  recent: readStorage('sw:recent', []),
  lastPlace: readStorage('sw:lastPlace', null),
  data: null,
  label: '',
  lat: 0,
  lon: 0,
  updatedAt: null,
  radarFrames: [],
  radarIndex: 0,
  radarTimer: null,
  radarPlaying: !reducedMotion.matches,
};

let map;
let marker;

/* ------------------------------------------------------------------ */
/* Units (°C / °F)                                                     */
/* ------------------------------------------------------------------ */

const toTemp = (celsius) => (state.units === 'fahrenheit' ? (celsius * 9) / 5 + 32 : celsius);
const tempSuffix = () => (state.units === 'fahrenheit' ? '°F' : '°C');
const toWind = (kmh) => (state.units === 'fahrenheit' ? kmh * 0.621371 : kmh);
const windSuffix = () => (state.units === 'fahrenheit' ? 'mph' : 'km/h');

function applyUnits() {
  unitButtons.forEach((button) =>
    button.setAttribute('aria-pressed', String(button.dataset.units === state.units)),
  );
  $('#tempUnit').textContent = tempSuffix();
  $('#feelsUnit').textContent = tempSuffix();
  $('#windUnit').textContent = windSuffix();
  if (state.data) renderWeather();
}

unitButtons.forEach((button) =>
  button.addEventListener('click', () => {
    state.units = button.dataset.units;
    writeStorage('sw:units', state.units);
    applyUnits();
  }),
);

/* ------------------------------------------------------------------ */
/* Theme (auto / light / dark)                                         */
/* ------------------------------------------------------------------ */

const themeLabels = { auto: '◐ Auto', light: '☀︎ Light', dark: '☾ Dark' };

function applyTheme() {
  if (state.theme === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.dataset.theme = state.theme;
  themeButton.textContent = themeLabels[state.theme] ?? themeLabels.auto;
}

themeButton.addEventListener('click', () => {
  const order = ['auto', 'light', 'dark'];
  state.theme = order[(order.indexOf(state.theme) + 1) % order.length];
  writeStorage('sw:theme', state.theme);
  applyTheme();
});

/* ------------------------------------------------------------------ */
/* Loading + errors                                                    */
/* ------------------------------------------------------------------ */

function setLoading(isLoading) {
  searchButton.disabled = isLoading;
  refreshButton.disabled = isLoading;
  weatherPanel.setAttribute('aria-busy', String(isLoading));
  searchButton.textContent = isLoading ? 'Searching…' : 'Find my forecast';
  document.body.classList.toggle('is-loading', isLoading);
}

const showError = (message) => {
  error.textContent = message || '';
};

/* ------------------------------------------------------------------ */
/* Fetching + rendering                                                */
/* ------------------------------------------------------------------ */

const FORECAST_PARAMS = [
  'current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code',
  'hourly=precipitation_probability,uv_index',
  'daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
  'timezone=auto',
  'forecast_days=7',
  'temperature_unit=celsius',
  'wind_speed_unit=kmh',
].join('&');

function rememberSearch(city) {
  const normalized = city.trim();
  if (!normalized) return;
  state.recent = [
    normalized,
    ...state.recent.filter((entry) => entry.toLowerCase() !== normalized.toLowerCase()),
  ].slice(0, 6);
  writeStorage('sw:recent', state.recent);
  renderRecent();
}

function renderRecent() {
  recentList.innerHTML = '';
  state.recent.forEach((city) => {
    const option = document.createElement('option');
    option.value = city;
    recentList.appendChild(option);
  });
}

async function getWeather(city) {
  showError('');
  setLoading(true);
  try {
    const geo = await fetchJson(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`,
    );
    if (!geo.results?.length) throw new Error(`Hmm, “${city}” didn’t match anywhere. Try another spelling?`);
    const place = geo.results[0];
    const label = [place.name, place.admin1, place.country_code].filter(Boolean).join(', ');
    rememberSearch(city);
    await loadWeatherAtLocation(place.latitude, place.longitude, label, city);
  } catch (fetchError) {
    showError(fetchError.message || 'Unable to load weather.');
  } finally {
    setLoading(false);
  }
}

async function loadWeatherAtLocation(latitude, longitude, label, query = '') {
  showError('');
  setLoading(true);
  try {
    const data = await fetchJson(
      `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&${FORECAST_PARAMS}`,
    );
    if (!data.current) throw new Error('The forecast came back empty. Please try again.');
    state.data = data;
    state.label = label;
    state.lat = latitude;
    state.lon = longitude;
    state.updatedAt = new Date();
    state.lastPlace = { label, latitude, longitude, query };
    writeStorage('sw:lastPlace', state.lastPlace);
    renderWeather();
    updateMap(latitude, longitude);
  } catch (fetchError) {
    showError(fetchError.message || 'Unable to load weather.');
  } finally {
    setLoading(false);
  }
}

/** Index of the first hourly slot at/after the current observation. */
function currentHourIndex(hourly, currentTime) {
  const now = new Date(currentTime).getTime();
  const index = hourly.time.findIndex((time) => new Date(time).getTime() >= now);
  if (index !== -1) return index;
  return Math.max(0, hourly.time.length - 6);
}

function renderWeather() {
  const { data, label } = state;
  const current = data.current;
  const [icon, condition] = weatherCodes[current.weather_code] ?? ['🌦️', 'Mixed weather'];

  $('#city').textContent = label;
  $('#temperature').textContent = Math.round(toTemp(current.temperature_2m));
  $('#humidity').textContent = current.relative_humidity_2m;
  $('#wind').textContent = Math.round(toWind(current.wind_speed_10m));
  $('#feelsLike').textContent = Math.round(toTemp(current.apparent_temperature));
  $('#icon').textContent = icon;
  $('#condition').textContent = condition;
  $('#updated').textContent = state.updatedAt
    ? `Updated ${state.updatedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
    : '';

  const hourIndex = currentHourIndex(data.hourly, current.time);
  renderRain(data.hourly, hourIndex);
  $('#clothing').textContent = clothingAdvice(
    current.temperature_2m,
    current.weather_code,
    current.wind_speed_10m,
  );
  $('#activity').textContent = activityAdvice(current.weather_code, current.temperature_2m);
  $('#comfort').textContent = comfortAdvice(data.hourly, current, hourIndex);
  renderDaily(data.daily);
}

function renderRain(hourly, startIndex) {
  const rainBar = $('#rainBar');
  rainBar.innerHTML = '';
  let peak = 0;
  hourly.time.slice(startIndex, startIndex + 6).forEach((time, offset) => {
    const chance = hourly.precipitation_probability[startIndex + offset] ?? 0;
    peak = Math.max(peak, chance);
    const cell = document.createElement('div');
    cell.className = 'rain-hour';
    const column = document.createElement('div');
    column.className = 'rain-column';
    const bar = document.createElement('i');
    if (chance === 0) bar.classList.add('dry');
    bar.style.height = `${Math.max(5, chance * 0.54)}px`;
    bar.title = `${chance}% chance of precipitation`;
    column.appendChild(bar);
    const hourLabel = document.createElement('div');
    hourLabel.textContent = new Date(time).toLocaleTimeString([], { hour: 'numeric' });
    const chanceLabel = document.createElement('div');
    chanceLabel.textContent = `${chance}%`;
    cell.append(column, hourLabel, chanceLabel);
    rainBar.appendChild(cell);
  });
  rainBar.setAttribute('aria-label', `Chance of rain over the next 6 hours, peaking at ${peak} percent.`);
}

function renderDaily(daily) {
  const container = $('#daily');
  container.innerHTML = '';
  if (!daily?.time) return;
  daily.time.slice(0, 5).forEach((date, index) => {
    const [icon, condition] = weatherCodes[daily.weather_code[index]] ?? ['🌦️', 'Mixed weather'];
    const card = document.createElement('div');
    card.className = 'day';
    card.title = condition;
    const name = document.createElement('strong');
    name.textContent =
      index === 0 ? 'Today' : new Date(`${date}T12:00:00`).toLocaleDateString([], { weekday: 'short' });
    const picture = document.createElement('div');
    picture.className = 'day-icon';
    picture.textContent = icon;
    picture.setAttribute('aria-hidden', 'true');
    const temps = document.createElement('div');
    temps.className = 'day-temps';
    temps.textContent = `${Math.round(toTemp(daily.temperature_2m_max[index]))}° / ${Math.round(
      toTemp(daily.temperature_2m_min[index]),
    )}°`;
    const rain = document.createElement('div');
    rain.textContent = `☔ ${daily.precipitation_probability_max?.[index] ?? 0}%`;
    card.append(name, picture, temps, rain);
    container.appendChild(card);
  });
}

/** Best-effort place name for pinned / geolocated spots. */
async function reverseLabel(latitude, longitude, fallback) {
  try {
    const place = await fetchJson(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`,
      { timeoutMs: 8000 },
    );
    const name = place.city || place.locality;
    if (!name) return fallback;
    const region = place.principalSubdivision && place.principalSubdivision !== name
      ? `, ${place.principalSubdivision}`
      : '';
    return `${name}${region}`;
  } catch {
    return fallback;
  }
}

/* ------------------------------------------------------------------ */
/* Map + animated radar                                                */
/* ------------------------------------------------------------------ */

const RADAR_SOURCE_ID = 'rain-radar';
const RADAR_LAYER_ID = 'rain-radar-layer';
const RADAR_FRAME_MS = 1200;

function updateMap(latitude, longitude) {
  if (!window.maplibregl) {
    mapStatus.textContent = 'Map unavailable';
    return;
  }
  if (!map) {
    try {
      map = new maplibregl.Map({
        container: 'map',
        style: 'https://tiles.openfreemap.org/styles/liberty',
        center: [longitude, latitude],
        zoom: 11.5,
        pitch: 45,
        bearing: -12,
        cooperativeGestures: true,
      });
    } catch {
      mapStatus.textContent = 'Map unavailable in this browser';
      return;
    }
    map.addControl(new maplibregl.NavigationControl(), 'top-right');
    map.on('click', async (event) => {
      const label = await reverseLabel(event.lngLat.lat, event.lngLat.lng, 'Pinned spot');
      loadWeatherAtLocation(event.lngLat.lat, event.lngLat.lng, label);
    });
    map.once('load', addRadarLayer);
  } else {
    const move = reducedMotion.matches ? 'jumpTo' : 'flyTo';
    if (map.loaded()) map[move]({ center: [longitude, latitude], zoom: 11.5, pitch: 45, speed: 0.8 });
    else map.once('load', () => map[move]({ center: [longitude, latitude], zoom: 11.5, pitch: 45 }));
  }
  if (marker) marker.setLngLat([longitude, latitude]);
  else marker = new maplibregl.Marker({ color: '#d65e96' }).setLngLat([longitude, latitude]).addTo(map);
  mapStatus.textContent = 'Live · tilted 3D view';
}

async function addRadarLayer() {
  try {
    const radar = await fetchJson('https://api.rainviewer.com/public/weather-maps.json');
    const past = radar.radar?.past ?? [];
    const future = radar.radar?.nowcast ?? [];
    if (!past.length && !future.length) throw new Error('No radar frames');
    const host = radar.host ?? 'https://tilecache.rainviewer.com';
    state.radarFrames = [...past, ...future].map((frame) => ({
      time: frame.time * 1000,
      url: `${host}${frame.path}/256/{z}/{x}/{y}/2/1_1.png`,
    }));
    // Start on the most recent observed frame, then sweep into the nowcast.
    state.radarIndex = Math.max(0, past.length - 1);
    showRadarFrame(state.radarIndex);
    radarToggle.hidden = false;
    updateRadarToggle();
    if (state.radarPlaying) startRadarLoop();
  } catch {
    mapStatus.textContent = '3D map live · radar unavailable';
    radarToggle.hidden = true;
  }
}

function showRadarFrame(index) {
  if (!map?.isStyleLoaded() || !state.radarFrames.length) return;
  const frame = state.radarFrames[index];
  try {
    if (map.getLayer(RADAR_LAYER_ID)) map.removeLayer(RADAR_LAYER_ID);
    if (map.getSource(RADAR_SOURCE_ID)) map.removeSource(RADAR_SOURCE_ID);
    map.addSource(RADAR_SOURCE_ID, {
      type: 'raster',
      tiles: [frame.url],
      tileSize: 256,
      attribution: 'RainViewer',
    });
    map.addLayer({
      id: RADAR_LAYER_ID,
      type: 'raster',
      source: RADAR_SOURCE_ID,
      paint: { 'raster-opacity': 0.58, 'raster-fade-duration': 0 },
    });
    radarTime.textContent = `Radar ${new Date(frame.time).toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit',
    })}`;
  } catch {
    /* The style can be mid-update; the next tick retries. */
  }
}

function startRadarLoop() {
  stopRadarLoop();
  state.radarTimer = setInterval(() => {
    state.radarIndex = (state.radarIndex + 1) % state.radarFrames.length;
    showRadarFrame(state.radarIndex);
  }, RADAR_FRAME_MS);
}

function stopRadarLoop() {
  if (state.radarTimer) {
    clearInterval(state.radarTimer);
    state.radarTimer = null;
  }
}

function updateRadarToggle() {
  radarToggle.setAttribute('aria-pressed', String(state.radarPlaying));
  radarToggle.textContent = state.radarPlaying ? '⏸ Pause radar' : '▶ Play radar';
}

radarToggle.addEventListener('click', () => {
  state.radarPlaying = !state.radarPlaying;
  if (state.radarPlaying && state.radarFrames.length) startRadarLoop();
  else stopRadarLoop();
  updateRadarToggle();
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) stopRadarLoop();
  else if (state.radarPlaying && state.radarFrames.length) startRadarLoop();
});

/* ------------------------------------------------------------------ */
/* Events + boot                                                       */
/* ------------------------------------------------------------------ */

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const city = input.value.trim();
  if (city) getWeather(city);
  else showError('Type a city name first ♡');
});

refreshButton.addEventListener('click', () => {
  if (state.lastPlace) {
    loadWeatherAtLocation(state.lastPlace.latitude, state.lastPlace.longitude, state.lastPlace.label);
  } else if (input.value.trim()) {
    getWeather(input.value.trim());
  }
});

$('#locateButton').addEventListener('click', async () => {
  if (!navigator.geolocation) {
    showError('Location is not supported by this browser.');
    return;
  }
  showError('Finding your spot…');
  navigator.geolocation.getCurrentPosition(
    async (position) => {
      const { latitude, longitude } = position.coords;
      const label = await reverseLabel(latitude, longitude, 'My pinned spot');
      loadWeatherAtLocation(latitude, longitude, label);
    },
    () => {
      showError('Location permission was unavailable. You can click the map instead.');
    },
    { timeout: 10000 },
  );
});

applyTheme();
applyUnits();
renderRecent();
updateRadarToggle();
radarToggle.hidden = true;

if (state.lastPlace && Number.isFinite(state.lastPlace.latitude)) {
  if (state.lastPlace.query) input.value = state.lastPlace.query;
  loadWeatherAtLocation(state.lastPlace.latitude, state.lastPlace.longitude, state.lastPlace.label);
} else {
  getWeather('London');
}
