# Changelog

## Unreleased

### Features

- Rename the masthead The Daily with italic Bodoni typography and remove the
  global header, story count, outbound article link, and visible section labels.
- Fill photo letterboxing with a blurred enlarged copy of the uncropped image.
- Add an individual accessible dot for every story plus weather/quote dots.
- Add condition-driven central weather artwork and forecast icons, including
  day/night-aware clear skies; move weather attribution into Settings.
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

- Fetch only fixed upstream feeds on the server and render feed text safely.
- Bind localhost by default and keep license keys out of the application.

### Bugfixes

- Allow arrow-key story navigation while buttons have focus and revalidate
  static assets on refresh so local UI changes load consistently.
- Handle missing or failed story images with a text-focused newspaper layout.

### Performance

- Cache publishers independently and fetch them concurrently, retaining healthy
  publishers when another source fails.

- Animate countdown progress with requestAnimationFrame instead of 250ms steps,
  while changing the numeric countdown only when its displayed value changes.

- Cache news/weather for ten minutes and quotes for 90 seconds; retain last good
  data during outages with visible cached status and retry cooldown.
- Keep the frontend buildless and avoid third-party Python packages; use curl
  for POLITICO public feed compatibility.
