# glitch-dashboard

A rotating, full-viewport dashboard for a dedicated monitor.

## Run

Requires Python 3.11 or newer. No Python packages or frontend build required.

```sh
make run
```

Open **http://localhost:8080**. Settings (bottom right) controls screen duration
and fade, slide, or instant transitions. Defaults: 30 seconds, soft fade.
Controls appear when hovering over or focusing the footer, and on small screens.

Keyboard: **← / →** switch panels, **Space** pauses/resumes, **F** toggles
fullscreen, **S** opens settings. Fullscreen requires a user gesture; use the
browser's kiosk mode for automatic fullscreen on a dedicated display.

## Panels

- **Headlines:** New York Times homepage RSS. Three headlines per news visit,
  advancing through up to 24 distinct story representatives. Related companions
  are filtered out, preserving the first article in NYT's feed order. Click a
  headline to open its newspaper page.
- **Newspaper:** A warm paper layout for each selected story, with a bold serif
  headline, large image, short description, byline, publication date, and photo
  credit. A link opens the original NYT article. The RSS source does not supply
  full article bodies; descriptions are displayed as supplied, with no invented
  article text or generated bullet summaries. Stories with missing or failed
  images use a text-focused layout.
- **Weather:** Philadelphia current conditions, Fahrenheit first with Celsius
  alongside; feels-like temperature and a five-day forecast in both units.
  Data from [Open-Meteo](https://open-meteo.com/).
- **Quotes:** Random quotes from `https://darrelld.com/quote/json/random`.

Each rotation shows **headline overview → its three newspaper pages → weather →
quote**, then advances to the next batch of headlines. Every screen uses the
configured duration (30 seconds by default). The edition's stories stay together
while new feed data is held for the next overview, so a refresh does not replace
an article midway through display. Newspaper navigation jumps to the first story
in the current batch; arrow keys step through individual pages.

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

News selection uses `news.py`, a standard-library implementation of weighted
TF-IDF/cosine similarity over titles and descriptions, plus headline word overlap
and corroborating NYT subject/person tags. It selects one representative per
**inferred homepage story group**, not one per editorial section (World, US,
etc.). Broad categories or a shared politician alone do not collapse stories.
Filtering happens before the 24-story limit and never pads a short list with
related companions. Each feed refresh recalculates the selection.

This is a heuristic: differently worded coverage without useful tags can escape
filtering, while strongly overlapping unrelated stories can be filtered. RSS does
not provide the homepage's actual package IDs, so an exact match to its visible
groups is not guaranteed. The rule thresholds live in `news.py` for refinement.

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
make check  # tests, JavaScript syntax, and edition sequencing (requires Node.js)
```

Automated checks cover feed adapters, cache TTL, outage retention, cooldown, and
recovery, companion filtering, unrelated-story retention, newspaper metadata,
and edition sequencing across refreshes. Live page and
all three API feeds were smoke-tested locally. Browser
visual QA, physical monitor/casting behavior, and a Docker image build have not
been performed. No deployment has been made.
