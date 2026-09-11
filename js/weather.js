const form = document.querySelector('#searchForm');
const input = document.querySelector('#cityInput');
const error = document.querySelector('#error');
let map;

const weatherCodes = {
	0: ['☀️', 'Clear sky'], 1: ['🌤️', 'Mainly clear'], 2: ['⛅', 'Partly cloudy'],
	3: ['☁️', 'Overcast'], 45: ['🌫️', 'Foggy'], 48: ['🌫️', 'Foggy'],
	51: ['🌦️', 'Light drizzle'], 61: ['🌧️', 'Rainy'], 71: ['🌨️', 'Snowy'],
	80: ['🌦️', 'Rain showers'], 95: ['⛈️', 'Thunderstorm']
};

function updateMap(latitude, longitude) {
	if (!window.maplibregl) {
		document.querySelector('#mapStatus').textContent = 'Map unavailable';
		return;
	}
	if (!map) {
		map = new maplibregl.Map({
			container: 'map', style: 'https://tiles.openfreemap.org/styles/liberty',
			center: [longitude, latitude], zoom: 11.5, pitch: 45, bearing: -12,
			cooperativeGestures: true
		});
		map.addControl(new maplibregl.NavigationControl(), 'top-right');
	} else {
		map.flyTo({ center: [longitude, latitude], zoom: 11.5, pitch: 45, speed: .8 });
	}
	document.querySelector('#mapStatus').textContent = 'Live · tilted 3D view';
}

function updateExtras(hourly, current) {
	const rainBar = document.querySelector('#rainBar');
	const startIndex = Math.max(0, hourly.time.findIndex(time => new Date(time) >= new Date(current.time)));
	rainBar.innerHTML = hourly.time.slice(startIndex, startIndex + 6).map((time, index) => {
		const chance = hourly.precipitation_probability[startIndex + index] || 0;
		return `<div class="rain-hour"><div class="rain-column"><i class="${chance ? '' : 'dry'}" style="height:${Math.max(5, chance * .54)}px" title="${chance}% chance"></i></div>${new Date(time).toLocaleTimeString([], { hour: 'numeric' })}<br>${chance}%</div>`;
	}).join('');
	const chilly = current.temperature_2m < 12;
	const wet = current.weather_code >= 51 && current.weather_code <= 99;
	document.querySelector('#clothing').textContent = wet ? 'Bring a cute raincoat and shoes that can handle puddles.' : chilly ? 'Layer up with a soft cardigan and keep your toes cozy.' : 'Light layers, comfy shoes, and your favorite sunny-day accessory.';
	document.querySelector('#activity').textContent = wet ? 'Café date, museum wander, or a cozy creative afternoon.' : 'Perfect for a park stroll, picnic, or little photo walk.';
	const uv = Math.round(current.uv_index || 0);
	const uvAdvice = uv >= 6 ? `UV ${uv}: sunglasses and sunscreen are a good idea.` : uv >= 3 ? `UV ${uv}: a little sunscreen will keep the day comfy.` : `UV ${uv}: gentle sunshine, no special sun prep needed.`;
	document.querySelector('#comfort').textContent = uvAdvice;
}

async function getWeather(city) {
	error.textContent = '';
	try {
		const geo = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`).then(response => response.json());
		if (!geo.results?.length) throw new Error('City not found.');
		const place = geo.results[0];
		const data = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code,uv_index&hourly=precipitation_probability&forecast_days=1&temperature_unit=celsius&wind_speed_unit=kmh`).then(response => response.json());
		const current = data.current;
		const [icon, condition] = weatherCodes[current.weather_code] || ['🌦️', 'Mixed weather'];
		document.querySelector('#city').textContent = `${place.name}, ${place.country_code}`;
		document.querySelector('#temperature').textContent = Math.round(current.temperature_2m);
		document.querySelector('#humidity').textContent = current.relative_humidity_2m;
		document.querySelector('#wind').textContent = Math.round(current.wind_speed_10m);
		document.querySelector('#feelsLike').textContent = Math.round(current.apparent_temperature);
		document.querySelector('#icon').textContent = icon;
		document.querySelector('#condition').textContent = condition;
		updateExtras(data.hourly, current);
		updateMap(place.latitude, place.longitude);
	} catch (caughtError) {
		error.textContent = caughtError.message || 'Unable to load weather.';
	}
}

form.addEventListener('submit', event => {
	event.preventDefault();
	if (input.value.trim()) getWeather(input.value.trim());
});
getWeather('London');
