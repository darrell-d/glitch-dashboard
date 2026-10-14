# glitch-dashboard

**The Daily**: a rotating, full-viewport dashboard for a dedicated monitor.

## Run

Requires Python 3.11 or newer and curl (for POLITICO's public feed).
No third-party Python packages or frontend build required. Docker includes curl.

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

- **Stories:** Four distinct stories per publisher from the ten sources below,
  shown individually in a warm newspaper layout. Related companions are filtered
  within each source, preserving publisher feed order. Each page has a bold serif
  headline, short description, byline, publication date, and photo credit. On a
  16:9 monitor, the square photo fills the entire viewport height, uncropped and
  in full color, with a cream newspaper column beside it. The dashboard header
  and footer do not consume photo space. Portrait layouts stack the photo and
  story. Non-square photos sit uncropped over a blurred enlarged copy of the
  same image, replacing empty letterbox bands. The masthead reads "The Daily"
  in italic Bodoni Moda, with Didot/Georgia fallbacks. Story counts and outbound
  article links are omitted from the display. Only short descriptions are shown, with no invented
  article text or generated bullet summaries. Stories with missing or failed
  images use a text-focused layout.
- **Weather:** Philadelphia current conditions, Fahrenheit first with Celsius
  alongside; feels-like temperature and a five-day forecast in both units. A
  large condition illustration fills the center, with day/night-aware sun/moon,
  clouds, rain, fog, snow, or storms. Each forecast day has a simpler icon.
  Local SVG assets need no image service or extra runtime library. Data provider
  attribution is in Settings instead of on the weather screen.
- **Quotes:** Random quotes from `https://darrelld.com/quote/json/random`.

Each rotation shows **three individual story pages → weather → quote**, then
advances to the next batch of stories. There is no headline list. Every screen uses the
configured duration (30 seconds by default). The edition's stories stay together
while new feed data is held for the next batch, so a refresh does not replace
an article midway through display. There are no navigation dots or visible section
labels. Arrow keys step through individual pages.

Open **http://localhost:8080/#article** to jump directly to the first story as
soon as feed data is available. Story controls appear when hovering or focusing
the paper column (always visible on touch devices): previous/next,
pause, fullscreen, and settings. Keyboard arrows also work when a story button
has focus. Static assets revalidate on refresh to pick up local changes.
The countdown bar animates with display frames for smooth movement; pause and
resume preserve elapsed time. Feed polling is independent of the animation.

## News sources

| Publisher | Selection |
| --- | --- |
| The New York Times | Homepage RSS |
| CNN | CNN Lite headlines and public article photo/description metadata |
| Kotaku | Main RSS |
| The Wall Street Journal | World News RSS, labeled in the display |
| The Atlantic | All-content Atom feed |
| POLITICO | Politico Picks RSS |
| WIRED | Main RSS |
| Ars Technica | Main RSS |
| TechCrunch | Public WordPress API with excerpts and featured photos |
| The New Yorker | Everything RSS |

"Top four" means the first four distinct stories in publisher feed/endpoint order,
which may differ from homepage placement. The related-story filter runs before
the four-story limit. Fewer are shown if there are insufficient distinct stories.
Publishers are interleaved by rank: each first story, then each second story, up
to 40 total. Cross-publisher coverage is retained to preserve four per source.
Weather and quote remain between batches of three stories.

`sources.py` configures the endpoints. CNN's legacy RSS contains old 2023 stories
and is not used. WSJ's automated homepage access is blocked, so World News is
the initial selection. Only public previews are used; no article bodies or
paywall bypass. Each publisher has an independent ten-minute cache and failure
state. **Settings → News sources** shows counts, cached status, and availability.
Story freshness labels reflect their source. Initial news loading can take up
to 25 seconds; weather and quotes load independently. NYT-only browser news
caches are discarded on upgrade.

All ten adapters were checked live with four stories, photos, and descriptions
each. The reusable check is cataloged in `../tooling/glitch-dashboard/TOOLS.md`:

```sh
python3 ../tooling/glitch-dashboard/check-news-sources.py --live
```

The confirmed `_glitch` routes also include `/quote/json` (daily),
`/quote/json/reminder/random` (reminder-enabled quotes), and equivalent `/quotes/`
paths. The separate `/api/quotes/` endpoint returned HTTP 500 during kickoff;
this app does not depend on it or modify that service.

## Display and data

The browser uses the full viewport, scales text with display size, and honors
reduced-motion preferences. Native CSS handles transitions; fullPage.js and its
license are not needed for this version. Fonts use Google Fonts with system and
Georgia fallbacks when unavailable.
There is no app-wide brand/header bar. Weather keeps its local date/time next to
the location; quote collection labels and outbound source links are removed.
Weather conditions come from the provider's WMO code and `is_day` flag; an older
cached response without `is_day` falls back to the configured timezone's hour.

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
Filtering happens before each source's four-story limit and never pads a short list with
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
make check  # tests, JS syntax, edition sequencing, app navigation (requires Node.js)
```

Automated checks cover feed adapters, cache TTL, outage retention, cooldown, and
recovery, companion filtering, unrelated-story retention, newspaper metadata,
edition sequencing across refreshes, actual application rotation/navigation,
direct story links, and failed-image fallback using a minimal DOM harness.
These checks do not verify browser layout. Live page and
all three API feeds were smoke-tested locally. Browser
visual QA, physical monitor/casting behavior, and a Docker image build have not
been performed. No deployment has been made.
