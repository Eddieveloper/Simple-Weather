const form = document.querySelector('#searchForm');
const input = document.querySelector('#cityInput');
const error = document.querySelector('#error');
const mapStatus = document.querySelector('#mapStatus');
const radarTime = document.querySelector('#radarTime');
let map;
let marker;

const MAP_ZOOM = 9.5;
const RADAR_MAX_ZOOM = 7; // RainViewer free tier only serves radar tiles up to z7

const weatherCodes = {
	0: ['☀️', 'Clear sky'], 1: ['🌤️', 'Mainly clear'], 2: ['⛅', 'Partly cloudy'],
	3: ['☁️', 'Overcast'], 45: ['🌫️', 'Foggy'], 48: ['🌫️', 'Foggy'],
	51: ['🌦️', 'Light drizzle'], 61: ['🌧️', 'Rainy'], 71: ['🌨️', 'Snowy'],
	80: ['🌦️', 'Rain showers'], 95: ['⛈️', 'Thunderstorm']
};

// Times from Open-Meteo (timezone=auto) are location-local ISO strings like "2026-09-11T17:00".
// Parse the hour straight from the string so cities render in their own local time,
// not the visitor's browser timezone.
function formatHour(isoTime) {
	const hour = Number(isoTime.slice(11, 13));
	const suffix = hour >= 12 ? 'PM' : 'AM';
	const twelve = hour % 12 === 0 ? 12 : hour % 12;
	return `${twelve} ${suffix}`;
}

function updateMap(latitude, longitude) {
	if (!window.maplibregl) {
		mapStatus.textContent = 'Map unavailable';
		return;
	}
	if (!map) {
		map = new maplibregl.Map({
			container: 'map', style: 'https://tiles.openfreemap.org/styles/liberty',
			center: [longitude, latitude], zoom: MAP_ZOOM, pitch: 45, bearing: -12,
			cooperativeGestures: true
		});
		map.addControl(new maplibregl.NavigationControl(), 'top-right');
		map.on('click', event => loadWeatherAtLocation(event.lngLat.lat, event.lngLat.lng, 'Pinned spot'));
		map.once('load', addRadarLayer);
	} else {
		map.flyTo({ center: [longitude, latitude], zoom: MAP_ZOOM, pitch: 45, speed: .8 });
	}
	if (marker) marker.setLngLat([longitude, latitude]);
	else marker = new maplibregl.Marker({ color: '#c2437f' }).setLngLat([longitude, latitude]).addTo(map);
	mapStatus.textContent = 'Live · tilted 3D view';
}

async function addRadarLayer() {
	try {
		const radar = await fetch('https://api.rainviewer.com/public/weather-maps.json').then(response => response.json());
		const frames = radar?.radar?.past || []; // free tier: past frames only, no nowcast/forecast
		if (!frames.length || map.getSource('rain-radar')) return;
		const latest = frames[frames.length - 1];
		map.addSource('rain-radar', {
			type: 'raster',
			tiles: [`https://tilecache.rainviewer.com${latest.path}/512/{z}/{x}/{y}/2/1_1.png`],
			tileSize: 512,
			maxzoom: RADAR_MAX_ZOOM, // overzoom past z7 instead of requesting unsupported tiles
			attribution: 'RainViewer'
		});
		map.addLayer({ id: 'rain-radar-layer', type: 'raster', source: 'rain-radar', paint: { 'raster-opacity': .6, 'raster-fade-duration': 0 } });
		const stamp = new Date(latest.time * 1000);
		radarTime.textContent = `updated ${stamp.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
	} catch (caughtError) {
		mapStatus.textContent = '3D map live · radar unavailable';
		radarTime.textContent = 'unavailable';
	}
}

function updateExtras(hourly, current) {
	const times = hourly?.time || [];
	const chances = hourly?.precipitation_probability || [];
	const amounts = hourly?.precipitation || [];
	// Both arrays share the same location-local ISO format, so a plain string
	// comparison reliably finds the first hour at/after the current time.
	let start = times.findIndex(time => time >= current.time);
	if (start < 0) start = 0;

	const rainBar = document.querySelector('#rainBar');
	const summary = document.querySelector('#rainSummary');
	const hours = times.slice(start, start + 6);

	if (!hours.length) {
		rainBar.innerHTML = '';
		summary.textContent = 'Hourly rain data unavailable.';
	} else {
		rainBar.innerHTML = hours.map((time, index) => {
			const chance = Number(chances[start + index] ?? 0);
			const mm = Number(amounts[start + index] ?? 0);
			const height = Math.max(6, Math.round((chance / 100) * 104));
			const label = index === 0 ? 'Now' : formatHour(time);
			return `<div class="rain-col${index === 0 ? ' is-now' : ''}">`
				+ `<span class="rain-pct">${chance}%</span>`
				+ `<div class="rain-track"><i class="${chance > 0 ? '' : 'dry'}" style="height:${height}px"></i></div>`
				+ `<span class="rain-hour">${label}</span>`
				+ `<span class="rain-mm">${mm.toFixed(1)} mm</span></div>`;
		}).join('');

		let peak = 0;
		let peakIndex = 0;
		let total = 0;
		hours.forEach((time, index) => {
			const chance = Number(chances[start + index] ?? 0);
			total += Number(amounts[start + index] ?? 0);
			if (chance > peak) { peak = chance; peakIndex = index; }
		});
		if (peak <= 0) {
			summary.textContent = 'Dry for the next 6 hours.';
		} else {
			const peakLabel = peakIndex === 0 ? 'now' : formatHour(hours[peakIndex]);
			summary.textContent = `Peak ${peak}% ${peakLabel} · ${total.toFixed(1)} mm total`;
		}
	}

	const chilly = current.temperature_2m < 12;
	const wet = current.weather_code >= 51 && current.weather_code <= 99;
	document.querySelector('#clothing').textContent = wet ? 'Bring a cute raincoat and shoes that can handle puddles.' : chilly ? 'Layer up with a soft cardigan and keep your toes cozy.' : 'Light layers, comfy shoes, and your favorite sunny-day accessory.';

	document.querySelector('#activity').textContent = wet ? 'Café date, museum wander, or a cozy creative afternoon.' : 'Perfect for a park stroll, picnic, or little photo walk.';
	const uv = Math.round(current.uv_index || 0);
	const uvAdvice = uv >= 6 ? `UV ${uv}: sunglasses and sunscreen are a good idea.` : uv >= 3 ? `UV ${uv}: a little sunscreen will keep the day comfy.` : `UV ${uv}: gentle sunshine, no special sun prep needed.`;
	document.querySelector('#comfort').textContent = uvAdvice;
}

async function loadWeatherAtLocation(latitude, longitude, label) {
	error.textContent = '';
	try {
		const data = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code,uv_index&hourly=precipitation_probability,precipitation&forecast_days=2&timezone=auto&temperature_unit=celsius&wind_speed_unit=kmh`).then(response => response.json());
		renderWeather(data, label, latitude, longitude);
	} catch (caughtError) {
		error.textContent = caughtError.message || 'Unable to load weather.';
	}
}

function renderWeather(data, label, latitude, longitude) {
	const current = data.current;
	const [icon, condition] = weatherCodes[current.weather_code] || ['🌦️', 'Mixed weather'];
	document.querySelector('#city').textContent = label;
	document.querySelector('#temperature').textContent = Math.round(current.temperature_2m);
	document.querySelector('#humidity').textContent = current.relative_humidity_2m;
	document.querySelector('#wind').textContent = Math.round(current.wind_speed_10m);
	document.querySelector('#feelsLike').textContent = Math.round(current.apparent_temperature);
	document.querySelector('#icon').textContent = icon;
	document.querySelector('#condition').textContent = condition;
	updateExtras(data.hourly, current);
	updateMap(latitude, longitude);
}

async function getWeather(city) {
	error.textContent = '';
	try {
		const geo = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`).then(response => response.json());
		if (!geo.results?.length) throw new Error('City not found.');
		const place = geo.results[0];
		await loadWeatherAtLocation(place.latitude, place.longitude, `${place.name}, ${place.country_code}`);
	} catch (caughtError) {
		error.textContent = caughtError.message || 'Unable to load weather.';
	}
}

form.addEventListener('submit', event => {
	event.preventDefault();
	if (input.value.trim()) getWeather(input.value.trim());
});
document.querySelector('#locateButton').addEventListener('click', () => {
	if (!navigator.geolocation) {
		error.textContent = 'Location is not supported by this browser.';
		return;
	}
	error.textContent = 'Finding your spot...';
	navigator.geolocation.getCurrentPosition(
		position => loadWeatherAtLocation(position.coords.latitude, position.coords.longitude, 'My pinned spot'),
		() => { error.textContent = 'Location permission was unavailable. You can click the map instead.'; }
	);
});
getWeather('London');
