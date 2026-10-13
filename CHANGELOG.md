# Changelog

## Unreleased

### Features

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

### Performance

- Cache news/weather for ten minutes and quotes for 90 seconds; retain last good
  data during outages with visible cached status and retry cooldown.
- Keep the frontend buildless and the Python server dependency-free.
