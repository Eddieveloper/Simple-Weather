# Cloudy with a Chance of Cute

A playful, pink weather dashboard with hyper-local rain timing, smart outfit suggestions, an activity planner, and a live tilted 3D map.

## Run locally

No build step is required. Open `Weather.html` in a browser, or serve the folder with any static file server:

```powershell
python -m http.server 8000
```

Then visit `http://localhost:8000/Weather.html`.

## Features

- Search weather by city.
- See the next six hours of precipitation probability.
- Get a simple clothing recommendation based on temperature and weather code.
- Get an indoor or outdoor activity idea.
- See the feels-like temperature and a UV-aware comfort check.
- Explore the searched location in a MapLibre GL 3D map.
- View live RainViewer radar tiles on top of the map.
- Click anywhere on the map or use browser location to pin a forecast spot.
- Responsive layout for small screens.

## Data and services

- Weather and geocoding: [Open-Meteo](https://open-meteo.com/)
- Map rendering: [MapLibre GL JS](https://maplibre.org/maplibre-gl-js/docs/)
- Map tiles and style: [OpenFreeMap](https://openfreemap.org/)
- Radar tiles: [RainViewer](https://www.rainviewer.com/api.html)

The app uses CDN-hosted MapLibre assets and public APIs, so an internet connection is required for live data and the map. No API keys are needed for the current services.

## Project structure

```text
Weather.html       Entry page and accessible markup
css/weather.css    Pink visual system and responsive layout
js/weather.js      Weather fetching, recommendations, rain timeline, and map behavior
assets/sparkle.svg Local decorative background asset
```
