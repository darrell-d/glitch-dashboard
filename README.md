# glitch-dashboard

**The Daily**: a rotating, full-viewport dashboard for a dedicated monitor.

The longer-term magic-mirror experience and screen architecture are documented in
[VISION.md](VISION.md).

## Run

Requires Python 3.11 or newer and curl (for POLITICO's public feed).
No third-party Python packages or frontend build required. Docker includes curl.

```sh
make run
```

Open **http://localhost:8080**. Settings (bottom right) controls fade, slide, or
instant transitions and the weather icon style; its **Screen times** tab sets how many
seconds each kind of screen stays up. Screen times are saved on the server in
`data/settings.json` (git-ignored; override the path with `DASHBOARD_SETTINGS`) and
shared by every display, which picks up changes within a minute. Defaults: stories,
radar, and quote 30 seconds, weather and markets 60, photo wall 300, pictures 20; soft fade, a Meteocons style that changes each calendar week, and ZIP
code 19103. Changing the ZIP updates weather, clock timezone, and regional radar.
Controls appear when hovering over or focusing the footer, and on small screens.

Keyboard: **← / →** switch panels, **Space** pauses/resumes, **F** toggles
fullscreen, **S** opens settings, **M** turns video sound on or off (remembered on that browser;
browsers keep video muted until you first click or press a key). Fullscreen requires a user gesture; use the
browser's kiosk mode for automatic fullscreen on a dedicated display.

## Panels

- **Stories:** Four distinct stories per publisher from the sources below,
  shown individually in a warm newspaper layout. Related companions are filtered
  within each source, preserving publisher feed order. Each page has a bold serif
  headline, short description, byline, publication date, and photo credit. On a
  16:9 monitor, the square photo fills the entire viewport height, uncropped and
  in full color, with a cream newspaper column beside it. The dashboard header
  and footer do not consume photo space. Portrait layouts stack the photo and
  story. Non-square photos sit uncropped over a blurred enlarged copy of the
  same image, replacing empty letterbox bands. The masthead reads "The Daily"
  in Jacquard 24, with Georgia as the local fallback. Story counts and outbound
  article links are omitted from the display. Only short descriptions are shown, with no invented
  article text or generated bullet summaries. Stories with missing or failed
  images use a text-focused layout.
- **Weather:** The "Felt" design: a two-column screen on a green felt ground. The left column
  has the date and time, city, a large Fahrenheit temperature with a day/night-aware
  condition icon, the condition, and Feels / Humidity / Celsius. The right column has a
  12-hour temperature curve (relative: warmest hour at the top) with icons, hours, and rain
  chance, and a five-day ledger whose bars place each day's low→high on the week's shared
  range. The design is laid out at 1440×900 and scaled to fill any screen; wider screens
  give the forecast column more room. Current, hourly, and daily conditions use
  Meteocons; Fill, Flat, Line, and Monochrome rotate weekly or can be fixed in
  Settings. The monochrome color is also configurable, with a light sage default
  chosen for the dark green display. The pinned SVG assets are served locally
  for display reliability.
  A framed ticker at the bottom left slides up through items every four seconds: active
  warnings first (National Weather Service alerts such as heat, cold, fire, tornado, and
  hurricane; UV index 6+), then air quality (always shown, with an EPA-colored level icon),
  the next sunrise, sunset, or moonrise in time order (always), wind speed and direction (always),
  and the moon phase with when it next rises (always). Moonrise and phase use
  a local astronomical calculation; sunrise and sunset come from Open-Meteo.
  Data and icon attribution is in Settings instead of on the weather screen.
- **Regional radar:** A full-screen map centered on the selected ZIP, with four
  recent precipitation frames animated over OpenStreetMap and current temperatures
  over a restrained set of major cities selected by population and capital status.
  Six hourly WeatherAPI.com forecast frames follow the observed radar, with a distinct
  forecast label and color key while the base map remains fixed.
  Provider details remain in Settings so the
  map itself stays visually quiet. Missing radar data does not stop the rest of the rotation.
- **Quotes:** Random quotes from `https://darrelld.com/quote/json/random`, set in
  an editorial lockup with a vertical accent rule and the author below a fine rule.
- **Featured media:** Wikimedia Commons pictures of the day join the existing NASA
  picture pool. One public-domain historical political cartoon from the Library of
  Congress and one Commons media-of-the-day video are shuffled into each edition.
  Video is shown full-screen over a blurred poster fill, autoplayed muted for kiosk
  reliability, and advances to the next screen when playback ends.

Each rotation keeps **three individual story pages → weather → radar → markets → quote → photo wall**
as its core sequence, with daily pictures and one featured video shuffled into separate gaps, then
advances to the next batch of stories. There is no headline list. Every screen uses the
screen time configured for its type in Settings. The edition's stories stay together
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
No numeric countdown is shown on any screen; a Ⅱ marks paused rotation.

## Daily pictures and media

Three photos are shuffled into random gaps in each batch, never back to back, each
shown uncropped with its title, description, and credit. The day's pool is the five newest
[NASA Image of the Day](https://www.nasa.gov/feeds/iotd-feed/) entries (one new image
each weekday, resized with `?w=2048` instead of the multi-megabyte originals) plus five
random public-domain images from the [NASA Image and Video Library](https://images.nasa.gov/),
picked once per day from astronomy and planetary topics with filters that skip catalog
codes, ground operations, and thin descriptions, plus five official
[Wikimedia Commons pictures of the day](https://commons.wikimedia.org/wiki/Commons:Picture_of_the_day).
One historical, public-domain political cartoon from the Library of Congress
[American Cartoon Prints](https://www.loc.gov/collections/american-cartoon-prints/) collection
appears per edition using the same full-screen blurred-backdrop treatment. Its catalog page changes
daily and the browser cycles through that page's cartoons before repeating.
The official Commons media-of-the-day feed supplies direct video transcodes and posters;
one video appears per edition, controls its own duration, and shows a shrinking remaining-time bar. No API key is needed. Reuters and the
Guardian were considered: Reuters prohibits automated collection, and the Guardian's free
API tier excludes current photo galleries.

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
| The Philadelphia Inquirer | News section RSS (the main feed mixes in AP wire filler) |
| Billy Penn | Main RSS |
| WHYY | Philadelphia section RSS (the main feed includes newscasts and TV listings) |
| The Onion | Public WordPress API with featured photos (newest four) |
| Al Jazeera | All-news RSS; photos and missing details come from each story's public page metadata |
| St. Lucia Times | Main RSS with embedded story photos |
| The Voice St. Lucia | Main RSS with photos from public article metadata |
| BBC News | Main RSS with display-sized BBC image variants |

"Top four" means the first four distinct stories in publisher feed/endpoint order
(preferring stories with photos when the feed has any),
which may differ from homepage placement. The related-story filter runs before
the four-story limit. Fewer are shown if there are insufficient distinct stories.
Publishers are interleaved by rank: each first story, then each second story, up
to 72 total. Cross-publisher coverage is retained to preserve four per source.
Weather, radar, an S&P 500 heatmap, quote, and a photo wall remain between batches of three stories.
The heatmap is TradingView's free embeddable Stock Heatmap widget (sector groups, tiles
sized by market value and colored by daily change); it loads its own data in the browser.
The photo wall shows every current story photo in three uncropped rows drifting
in alternating directions at standard, faster, and slower speeds; it is
skipped when fewer than six stories have photos. Each batch
takes the first three stories not yet shown this cycle, so a newly published
story joins the next batch; once all have been shown, the cycle restarts.

`sources.py` configures the endpoints. CNN's legacy RSS contains old 2023 stories
and is not used. WSJ's automated homepage access is blocked, so World News is
the initial selection. Only public previews are used; no article bodies or
paywall bypass. Each publisher has an independent ten-minute cache and failure
state. **Settings → News sources** shows counts, cached status, and availability.
Story freshness labels reflect their source. Initial news loading can take up
to 25 seconds; weather and quotes load independently. NYT-only browser news
caches are discarded on upgrade.

The reusable live adapter check is cataloged in `../tooling/glitch-dashboard/TOOLS.md`:

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

The Python server serves the page and fetches allowlisted upstream services, avoiding
cross-origin feed restrictions. News/weather are cached for 10 minutes and
quotes for 90 seconds; radar metadata and nearby city temperatures are cached for five
minutes, and ZIP lookups for 24 hours. Requests time out after 8 seconds, and failed feeds retry
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

The default ZIP can be changed for new browsers with one server environment variable:

```sh
DASHBOARD_ZIP=19103 \
python3 server.py
```

Each browser can override that default in Settings. The ZIP is resolved through
Open-Meteo to obtain the display name, coordinates, and timezone; the saved setting
then drives the dashboard clock, forecast, and map center.

The server listens on all interfaces (`0.0.0.0`) by default, so other devices on the
same network can open `http://<server-lan-ip>:8080`; use `--host 127.0.0.1` to keep it
on this machine only. The display device only needs
a modern browser; the Python server can run elsewhere. Chromecast compatibility
depends on its browser/casting mode and has not been tested. A Pi with Chromium
kiosk mode can display the same URL.

This is a local/LAN server with no authentication or TLS: anyone on the network can view
it and change the shared screen times in Settings. Public hosting needs
a separate deployment decision and suitable HTTPS/authentication configuration.

## Docker

```sh
docker compose up --build
```

Compose publishes port 8080 on all interfaces for LAN access. It accepts the same
environment variables; change the binding to `127.0.0.1:8080:8080` to keep it local.

## Checks

```sh
make test   # standard-library unit tests
make check  # tests, JS syntax, edition sequencing, app navigation (requires Node.js)
```

Automated checks cover feed adapters, ZIP resolution, radar frame validation and
projection, cache TTL, outage retention, cooldown, and
recovery, companion filtering, unrelated-story retention, newspaper metadata,
edition sequencing across refreshes, actual application rotation/navigation,
direct story links, and failed-image fallback using a minimal DOM harness.
These checks do not verify browser layout. The live APIs, full-screen radar layout,
animation, major-city labels, and ZIP change from 19103 to 10001 and back were
smoke-tested in Chrome. Physical monitor/casting behavior and a Docker image build
have not been tested. No deployment has been made.
