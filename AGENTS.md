# glitch-dashboard

Personal monitor dashboard: Python standard-library server plus buildless HTML,
CSS, and JavaScript. curl is required for POLITICO (included in Docker).
`make run`, `make test`, and `make check` are entrypoints.

- Read `VISION.md`, `README.md`, `TODO.md`, and local `agent-notes/` before implementing.
- This is an unattended home magic-mirror display that balances information with
  generative art. New screens should follow the extensible, full-screen direction
  documented in `VISION.md`.
- Keep the experience full-viewport and readable at a distance.
- Keep rotation timing and transition choice configurable. Per-screen-type times live on the
  server (`/api/settings`, `data/settings.json`); other display options stay in the browser.
- NASA pictures: five newest Images of the Day plus five daily random NASA Image Library picks
  (`load_pictures`), three per batch in random non-adjacent gaps (`createEdition`). Do not
  scrape Reuters, NYT, or Bloomberg pages (automated collection prohibited or blocked); the
  Guardian's free API tier excludes current galleries.
- Rotation: three individual story pages, weather, regional radar, an S&P 500 market heatmap
  (TradingView's free embeddable widget, created once in `renderMarkets`), quote, a photo wall of
  current story images (three uncropped rows drifting in alternating directions at standard, faster, and slower speeds), then the next batch.
  No headline overview/list. `public/edition.js` fixes the batch during display;
  each batch takes unshown stories first so new stories appear in the next batch.
- Use requestAnimationFrame for smooth elapsed-time progress, preserving pause
  and resume. Keep upstream polling independent of that animation loop.
- Newspaper pages use RSS headlines, images/captions/credits, and short
  descriptions. Full article bodies are unavailable; the user chose this
  simplified format instead of bullet summaries and article text.
- Approved newspaper design: full-height, uncropped square photo on the left,
  cream newspaper column on the right. No dashboard chrome taking photo space.
  Use `/#article` for direct access; maintain story controls and portrait fallback.
- Display name is "The Daily", in Jacquard 24 with a local Georgia fallback.
  Do not add a glitch effect. Keep article counts and outbound article links off
  the display. Non-square photos use a blurred copy behind the uncropped original.
- No global app header, visible section names, or navigation dots anywhere.
  Keep automatic rotation, keyboard navigation, and display controls.
- Weather uses pinned local Meteocons SVG artwork based on WMO condition and
  `is_day`, plus hourly and five-day forecast icons. Fill, Flat, Line, and
  Monochrome rotate weekly unless Settings pins one style. Monochrome uses an
  adjustable saved color and must remain legible on the dark green background.
  No provider/Outside labels on the screen; attribution stays in Settings.
- Weather has a secondary variable slot under the conditions, kept visually subordinate
  to temperature and conditions. Wind is always one item in its upward-sliding carousel,
  alongside active alerts (NWS, US AQI > 100, UV 6+) and the current astronomy item:
  sunrise from 4:30 AM, sunset while the sun is up, tonight's moonrise, or the locally
  calculated moon phase. Logic is in `public/signals.js`.
  US pollen still lacks a provider.
- Weather includes a compact next-12-hours strip with time, condition, Fahrenheit
  temperature, and precipitation probability; keep the current reading dominant.
- Current wind uses Meteocons for both strength and eight-point compass direction:
  light winds rotate daily among calm/weak windsocks, wind spinner, and windmill;
  moderate winds use the moderate windsock; high winds use windsock or wind.
- Weather location is a browser-saved US ZIP code, defaulting to 19103. The server
  resolves it to coordinates and timezone; do not hardcode a city into display logic.
- Regional radar uses four recent RainViewer frames over visible OpenStreetMap tiles,
  centered on the selected ZIP, with major-city locations from a pinned GeoNames
  catalog and Open-Meteo temperatures. Prefer capitals and population centers while
  keeping labels sparse. Six hourly WeatherAPI.com precipitation forecast tiles follow
  the observed frames at source zoom 6, scaled over the same map. Keep provider details
  in Settings and tile requests limited to the viewport.
- Quote pages use the editorial-rule layout without a quotation-mark glyph,
  collection labels, or darrelld.com links.
- Display loading, unavailable, and stale states honestly; do not present sample
  content as live data.
- Keep upstream refresh intervals independent from panel rotation.
- Confirmed defaults: ZIP 19103, Fahrenheit first with Celsius alongside,
  NYT homepage headlines, and 30-second panels (markets 60, photo wall 300).
- Keep source/category expansion easy; detailed news preferences are deferred.
- `sources.py` configures NYT, CNN, Kotaku, WSJ, The Atlantic, POLITICO, WIRED,
  Ars Technica, TechCrunch, The New Yorker, and local Philadelphia Inquirer (News
  section), Billy Penn, WHYY (Philadelphia section), The Onion, and Al Jazeera. Cap each source at four distinct
  stories and interleave publishers; label the actual publisher.
- WSJ uses World News RSS and must be labeled accordingly. CNN uses current Lite
  links plus short public metadata; never use its stale legacy RSS. TechCrunch
  uses WordPress excerpts/featured media. Do not retrieve article bodies.
- Keep source caches and failures independent. Live adapter checks use
  `../tooling/glitch-dashboard/check-news-sources.py`; see its tooling catalog.
- News should keep one representative per inferred homepage story group, rather
  than one per editorial section. `news.py` filters companions in feed order;
  preserve tests for unrelated stories sharing a politician or broad subject.
- Use `/quote/json/random` for quotes; `/api/quotes/` is a different endpoint.
- Never store the fullPage.js license in source, documentation, or logs.
- No deployment or changes to darrelld.com are authorized by this kickoff.
- Do not commit `agent-notes/`.
