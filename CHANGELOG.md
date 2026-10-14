# Changelog

## Unreleased

### Features

- Follow observed radar with six hourly WeatherAPI.com precipitation forecast frames,
  switching the status label and color key while keeping the same base map and city layer.
- Add a full-screen regional map with four animated RainViewer precipitation
  frames and major-city temperatures, with provider attribution available in Settings.
- Replace fixed weather coordinates with a browser-saved US ZIP setting that
  drives the resolved place name, timezone, forecast, and radar center.
- Document the long-term magic-mirror vision, including unattended operation,
  full-resolution presentation, generative-art screens, and an extensible screen lifecycle.
- Add regional animated radar and surrounding-city temperatures to the planned
  magic-mirror screen collection.
- Replace the local weather symbols with animated Meteocons and rotate among
  Fill, Flat, Line, and Monochrome each week, with persistent style and
  monochrome-color controls in Settings.
- Rename the masthead The Daily with Jacquard 24 typography and remove the
  global header, story count, outbound article link, and visible section labels.
- Fill photo letterboxing with a blurred enlarged copy of the uncropped image.
- Remove navigation dots from every screen; retain automatic rotation, keyboard
  navigation, and display controls.
- Restyle quote screens around a vertical editorial rule and grouped author line;
  remove the detached quotation-mark glyph.
- Add condition-driven central weather artwork and forecast icons, including
  day/night-aware clear skies; move weather attribution into Settings.
- Add a compact moon-phase disc, phase name, and illuminated percentage to weather,
  calculated locally without another runtime API dependency.
- Add a secondary 12-hour forecast with local time, condition icon, temperature,
  and precipitation probability while retaining current temperature as the focus.
- Remove weather provider/Outside labels and quote collection/source links.
- Add CNN, Kotaku, WSJ World News, The Atlantic, POLITICO, WIRED, Ars Technica,
  TechCrunch, and The New Yorker alongside NYT, selecting four stories each.
- Interleave publishers, label stories by source, and show source health in
  Settings; support RSS, Atom, featured media, and public CNN preview metadata.
- Start directly with individual news stories and remove the headline list from
  rotation and navigation.
- Fill story screens with a full-height uncropped square photo beside a cream
  newspaper column, matching the approved photo-led design.
- Add direct `/#article` access and story-local navigation, pause, fullscreen,
  and settings controls without reserving dashboard header/footer space.
- Add individual newspaper-style story screens with warm paper, bold serif
  headlines, large photos, short descriptions, bylines, dates, and photo credits.
- Rotate individual article pages, weather, and quote; keep stories stable during
  feed refreshes.
- Select one article per inferred homepage story group using dependency-free
  text similarity and NYT keyword metadata, retaining the first feed entry.
- Add regression coverage for report/explainer pairs, differently worded
  companion stories, duplicate URLs, and unrelated stories sharing names.
- Initialize the dashboard project and capture the three-panel MVP scope.
- Add full-viewport NYT headlines, Philadelphia weather, and darrelld.com quotes.
- Show Fahrenheit first with Celsius alongside, including a five-day forecast.
- Add configurable 30-second rotation, fade/slide/instant transitions, pause,
  fullscreen controls, keyboard navigation, and browser-local settings.
- Add local Python runtime, Docker/Compose configuration, and run instructions.

### Security

- Validate ZIP input and constrain discovered radar URLs to expected HTTPS hosts.
- Fetch only fixed upstream feeds on the server and render feed text safely.
- Bind localhost by default and keep license keys out of the application.

### Bugfixes

- Move the radar precipitation key to the bottom center to balance the map overlay.
- Remove the radar title block and on-map provider credit line so the weather map
  and temperature markers use the full visual field; retain provider details in Settings.
- Replace airport and reporting-station temperature cards with sparse, broadcast-style
  labels for major cities, prioritizing state capitals and population centers.
- Tighten the Fahrenheit/Celsius grouping to create breathing room above the
  hourly forecast, remove its redundant lower rule, and replace the crescent
  gradient with a clipped mask that has no false lit edge.
- Allow arrow-key story navigation while buttons have focus and revalidate
  static assets on refresh so local UI changes load consistently.
- Handle missing or failed story images with a text-focused newspaper layout.

### Performance

- Render only visible map tiles; cache ZIP resolutions for 24 hours and radar data
  for five minutes, batching nearby city temperatures into one Open-Meteo request.
- Cache publishers independently and fetch them concurrently, retaining healthy
  publishers when another source fails.

- Animate countdown progress with requestAnimationFrame instead of 250ms steps,
  while changing the numeric countdown only when its displayed value changes.

- Cache news/weather for ten minutes and quotes for 90 seconds; retain last good
  data during outages with visible cached status and retry cooldown.
- Keep the frontend buildless and avoid third-party Python packages; use curl
  for POLITICO public feed compatibility.
