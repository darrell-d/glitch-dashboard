# Changelog

## Unreleased

### Features

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

- Animate countdown progress with requestAnimationFrame instead of 250ms steps,
  while changing the numeric countdown only when its displayed value changes.

- Cache news/weather for ten minutes and quotes for 90 seconds; retain last good
  data during outages with visible cached status and retry cooldown.
- Keep the frontend buildless and the Python server dependency-free.
