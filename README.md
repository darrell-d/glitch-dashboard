# glitch-dashboard

A rotating, full-viewport dashboard for a dedicated monitor.

## Run

Requires Python 3.11 or newer. No Python packages or frontend build required.

```sh
make run
```

Open **http://localhost:8080**. Settings (bottom right) controls panel duration
and fade, slide, or instant transitions. Defaults: 30 seconds, soft fade.
Controls appear when hovering over or focusing the footer, and on small screens.

Keyboard: **← / →** switch panels, **Space** pauses/resumes, **F** toggles
fullscreen, **S** opens settings. Fullscreen requires a user gesture; use the
browser's kiosk mode for automatic fullscreen on a dedicated display.

## Panels

- **Headlines:** New York Times homepage RSS. Three headlines per news visit,
  advancing through up to 24 stories. Links open the original articles.
- **Weather:** Philadelphia current conditions, Fahrenheit first with Celsius
  alongside; feels-like temperature and a five-day forecast in both units.
  Data from [Open-Meteo](https://open-meteo.com/).
- **Quotes:** Random quotes from `https://darrelld.com/quote/json/random`.

The confirmed `_glitch` routes also include `/quote/json` (daily),
`/quote/json/reminder/random` (reminder-enabled quotes), and equivalent `/quotes/`
paths. The separate `/api/quotes/` endpoint returned HTTP 500 during kickoff;
this app does not depend on it or modify that service.

## Display and data

The browser uses the full viewport, scales text with display size, and honors
reduced-motion preferences. Native CSS handles transitions; fullPage.js and its
license are not needed for this version. Fonts use Google Fonts with system and
Georgia fallbacks when unavailable.

The Python server serves the page and fetches fixed upstream URLs, avoiding
cross-origin feed restrictions. News/weather are cached for 10 minutes and
quotes for 90 seconds. Requests time out after 8 seconds, and failed feeds retry
after a 30-second cooldown. Browsers poll independently of panel rotation.
Last good content is retained in memory and browser storage, marked as cached
when refresh fails. There is no fabricated sample content. A complete initial
outage shows an unavailable state while other panels continue rotating.

## Configuration

Server environment variables (defaults shown):

```sh
WEATHER_LOCATION=Philadelphia \
WEATHER_LATITUDE=39.9526 \
WEATHER_LONGITUDE=-75.1652 \
DASHBOARD_TIMEZONE=America/New_York \
python3 server.py
```

The timezone controls the dashboard clock and weather forecast. Display settings
are browser-local; server configuration applies to all connected browsers.

For another device on a trusted LAN, run `python3 server.py --host 0.0.0.0` and
open `http://<server-lan-ip>:8080` from that device. The display device only needs
a modern browser; the Python server can run elsewhere. Chromecast compatibility
depends on its browser/casting mode and has not been tested. A Pi with Chromium
kiosk mode can display the same URL.

This is a local/LAN server with no authentication or TLS. Public hosting needs
a separate deployment decision and suitable HTTPS/authentication configuration.

## Docker

```sh
docker compose up --build
```

Compose binds localhost port 8080 by default. It accepts the same environment
variables; intentionally change the port binding if LAN access is needed.

## Checks

```sh
make test   # standard-library unit tests
make check  # tests plus JavaScript syntax check (requires Node.js)
```

Automated checks cover feed adapters, cache TTL, outage retention, cooldown, and
recovery. Live page and all three API feeds were smoke-tested locally. Browser
visual QA, physical monitor/casting behavior, and a Docker image build have not
been performed. No deployment has been made.
