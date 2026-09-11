# Cloudy with a Chance of Cute

A playful, pink weather dashboard with hyper-local rain timing, smart outfit
suggestions, an activity planner, a 5-day outlook, and a live tilted 3D map
with animated rain radar.

No build step, no dependencies, no API keys — just open it and check the sky.

## Run locally

Open `index.html` in a browser, or serve the folder with any static file server:

```powershell
python -m http.server 8000
```

Then visit `http://localhost:8000/`.

## Features

- Search weather by city, with recent searches remembered for autocomplete.
- See the next six hours of precipitation probability, hour by hour.
- Get clothing advice tuned to temperature, rain, and wind.
- Get an indoor or outdoor activity idea for the actual conditions.
- See feels-like temperature plus a UV- and humidity-aware comfort check.
- Browse a 5-day outlook with highs, lows, and rain chances.
- Switch between °C and °F at any time — everything re-renders instantly.
- Pick a light, dark, or auto (system) pink theme.
- Explore the location in a MapLibre GL 3D map.
- Watch animated RainViewer radar sweep across the map, with play/pause.
- Click anywhere on the map or use browser location to pin a forecast spot —
  pinned spots get a real place name when one is available.
- Your last spot, units, and theme are remembered between visits.
- Responsive layout, keyboard-friendly controls, and reduced-motion support.

## Data and services

- Weather and geocoding: [Open-Meteo](https://open-meteo.com/)
- Pinned-spot place names: [BigDataCloud free reverse geocoding](https://www.bigdatacloud.com/)
- Map rendering: [MapLibre GL JS](https://maplibre.org/maplibre-gl-js/docs/)
- Map tiles and style: [OpenFreeMap](https://openfreemap.org/)
- Radar tiles: [RainViewer](https://www.rainviewer.com/api.html)

The app uses CDN-hosted MapLibre assets and public APIs, so an internet
connection is required for live data and the map. No API keys are needed.

## Privacy notes

- Your location is only requested when you press **◎ Use my location**, and it
  is sent to Open-Meteo (forecast) and BigDataCloud (place name) solely to
  build that forecast.
- Your last spot, recent searches, units, and theme are stored in the browser's
  `localStorage` on your device only. Clear site data to forget everything.

## Project structure

```text
index.html              Entry page and accessible markup
css/weather.css         Pink visual system, themes, and responsive layout
js/weather.js           Weather fetching, advice, outlook, and map behavior
assets/favicon.svg      Cute tab icon
assets/sparkle.svg      Local decorative background asset
site.webmanifest        Installable-app metadata
.github/workflows/ci.yml  Syntax + reference checks for the vanilla stack
```

## Development

This is intentionally a dependency-free static site. CI runs two lightweight
checks on every push and pull request:

1. `node --check js/weather.js` — JavaScript syntax.
2. A small script asserting every local `src`/`href` in `index.html` exists
   and every `$('#id')` lookup in `js/weather.js` matches an element id.

Formatting follows `.editorconfig` (2 spaces, LF, UTF-8).

## License

MIT — see [LICENSE](LICENSE).
