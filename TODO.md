# TODO

- [x] Rename masthead to The Daily and set it in Jacquard 24.
- [x] Add blurred photo fill behind uncropped story images.
- [x] Remove all navigation dots; retain rotation, keyboard navigation, and controls.
- [x] Restyle quotes as an editorial rule lockup without a quotation-mark glyph.
- [x] Remove app header, article counts/links, and redundant source/collection labels.
- [x] Add day/night-aware current weather artwork and five forecast icons.
- [x] Add a secondary moon-phase and illumination readout to weather.
- [x] Add a compact next-12-hours forecast beneath current conditions.
- [x] Polish hourly spacing/dividers and correct crescent phase masking.
- [x] Use Meteocons with weekly style rotation, a settings override, and a configurable monochrome color.
- [ ] Add air quality, smoke, pollen, and other local weather-event data after choosing a layout.
- [ ] Add a full-screen Philadelphia regional map with animated precipitation radar and surrounding-city temperatures.

- [ ] Replace the fixed panel sequence with an extensible screen registry and lifecycle hooks.
- [ ] Add `/Users/darrelldefreitas/code/gen_art/LawnMower` as an autonomous full-screen web screen.
- [ ] Add a high-resolution Mandelbrot or related mathematical generative-art screen.
- [ ] Add reusable full-viewport treatments for art that does not match the display aspect ratio.
- [ ] Harden startup, recovery, resource cleanup, and diagnostics for unattended operation.

- [x] Add nine requested sources alongside NYT, capped at four stories each.
- [x] Add publisher labels, interleaving, independent caches, and source health.
- [x] Support RSS/Atom, CNN preview metadata, and TechCrunch featured photos.
- [x] Verify all ten publisher adapters live and save a reusable diagnostic.
- [ ] Refine WSJ's initial World News selection if broader coverage is wanted.

- [x] Remove headline overview from rotation and start directly with stories.
- [x] Animate countdown progress per display frame with pause/resume coverage.

- [x] Philadelphia weather; Fahrenheit first, Celsius alongside.
- [x] NYT homepage headlines for the first version.
- [x] 30-second rotation with selectable fade, slide, and instant transitions.
- [x] Local Python server with fixed-upstream feed fetching and caching.
- [x] Verify `/quote/json/random` and its quote/source/body schema.
- [x] Build full-viewport news, weather, and quote panels.
- [x] Add timeout, retry, cached-data, and unavailable states.
- [x] Add run instructions and focused automated checks.
- [x] Filter related news companions; retain one article per inferred homepage
  story group, preserving feed priority.
- [x] Keep headline overview and add newspaper pages with a large photo,
  headline, short description, byline, credit, and original article link.
- [x] Rotate through the overview's stories before weather/quote; keep the
  current edition stable during feed refreshes.
- [x] Implement the approved full-height square-photo newspaper design, with
  full-color uncropped images, cream text column, and portrait fallback.
- [x] Add direct story link, in-story controls, fresh asset loading, and tests
  exercising actual app rotation and navigation.
- [ ] Refine similarity thresholds against additional real news examples.
- [ ] Refine news categories and sources with the user.
- [ ] Refine visual styling with the user.
- [ ] Select the monitor host and confirm resolution/orientation.
- [ ] Test in the target browser/device (including casting if selected).
- [ ] Decide hosting and unattended startup once the display device is selected.
