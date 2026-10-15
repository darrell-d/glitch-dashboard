# Magic Mirror Dashboard Vision

## Purpose

This project is a home dashboard designed for a display mounted behind a magic
mirror. It should feel like an ambient household object rather than an app that
expects regular interaction.

The display rotates between useful information and visual experiences:

- Information such as news and weather.
- Reflective content such as quotes.
- Generative art, including Mandelbrot sets and other mathematically generated
  sequences.
- Existing art projects presented as full-screen web experiences, beginning with
  `/Users/darrelldefreitas/code/gen_art/LawnMower`.

The screen collection should grow over time without requiring the rotation system
to be redesigned for every addition.

## Experience Principles

### Full-screen first

Every screen should use the entire available viewport and make effective use of
the display's native resolution. The composition should remain intentional across
the eventual monitor resolution, orientation, and device pixel ratio.

Black letterbox bars should be avoided. When source material does not match the
display aspect ratio, choose an appropriate treatment for that screen:

- Scale or crop when losing edge content is acceptable.
- Preserve the primary image and extend it with a blurred or otherwise derived
  background when cropping is undesirable.
- Regenerate procedural visuals for the actual viewport dimensions.
- Extend colors, textures, or patterns into unused space.

Canvas and WebGL work should size its backing buffer for the physical display,
including `devicePixelRatio`, while keeping controls and type sized in CSS pixels.

### Ambient and unattended

Normal operation must not require clicks, taps, or keyboard input. The dashboard
should start, load, recover, and continue rotating on its own. Controls and
settings are maintenance tools rather than part of the primary experience.

Individual screens should fail independently. Network-backed screens should use
cached data or a clear fallback without stopping local art and quote screens.
Long-running operation should tolerate refreshes, transient network failures, and
the selected display device restarting.

### Information and delight

The rotation should balance practical information with art and surprise. News
and weather provide quick context. Quotes, generative art, and visual experiments
keep the mirror from feeling like a conventional status dashboard.

Each screen should have one clear visual focus and remain readable from a distance.
Persistent navigation and application chrome should stay out of the composition.

## Screen Families

### Information

- News stories.
- Current, hourly, and multi-day weather.
- A regional weather map with animated precipitation radar and current
  temperatures for surrounding cities.
- Weather-related conditions such as air quality, smoke, pollen, and advisories.
- Future household information that benefits from passive viewing.

### Art and reflection

- Quotes.
- Mandelbrot and related fractal explorations.
- Mathematical sequences and algorithmic animation.
- Existing generative-art projects such as LawnMower.
- Curated full-screen pictures and video from NASA and Wikimedia Commons.
- Future experiments that can render autonomously in a browser.

## Extensible Screen Model

New screens should be registered through a small, explicit interface instead of
being wired into the rotation with one-off conditionals. A screen definition is
expected to provide:

- A stable identifier and display name.
- Its render target or module.
- Rotation duration, with a dashboard default.
- Activation and deactivation hooks so expensive animation stops when hidden.
- Optional refresh behavior for network data.
- A loading, unavailable, or fallback state.
- Display capabilities such as Canvas, WebGL, embedded local page, or DOM content.

The rotation engine should own scheduling, transitions, pause/resume, visibility,
and failure isolation. Each screen should own its data and rendering lifecycle.
Screens that animate should use `requestAnimationFrame`, react to viewport changes,
and release timers, observers, and graphics resources when deactivated.

Existing art projects should preferably expose a self-contained web entry point.
Integration may use an isolated embedded page initially, followed by a native
screen module when tighter lifecycle or performance control is worthwhile.

## Unattended Operation Requirements

- Start automatically on the eventual display device and enter kiosk or equivalent
  full-screen mode without routine user input.
- Resume rotation after reloads and recover from individual screen failures.
- Avoid memory growth across repeated rotations.
- Keep network refresh schedules separate from screen timing.
- Pause costly animation and rendering while a screen is hidden.
- Keep assets local when practical and pin external dependencies.
- Provide maintenance settings without exposing permanent on-screen controls.
- Support remote or simple local diagnostics once the display hardware is chosen.

## Planned Direction

1. Evolve the weighted random scheduler into a screen registry with explicit lifecycle
   hooks. Per-screen timing, weights, recurrence limits, and non-repeating content pools
   are complete.
2. Audit LawnMower and expose it as an autonomous, full-screen dashboard screen.
3. Add the first native generative-art screen, likely a high-resolution Mandelbrot
   renderer.
4. Add more mathematical and procedural screens behind the same interface.
5. Add a US pollen provider to the existing weather-event ticker; NWS alerts, air quality,
   UV, sky events, wind, and moon details are complete.
6. Add a full-screen regional radar screen centered on the browser-configured ZIP,
   with a time legend and nearby reporting-area temperature labels. (Complete.)
7. Harden startup, recovery, caching, and diagnostics for unattended use.
8. Optimize rendering and kiosk setup for the selected monitor and playback device.

## Open Decisions

- Monitor resolution, orientation, refresh rate, and overscan behavior.
- Playback device and browser, such as Raspberry Pi or a casting device.
- Desired balance and timing between information screens and art screens.
- Whether brightness or palette should adapt by time of day.
- Whether any future presence sensor or remote control should influence rotation.
- Pollen provider for the selected location; the current Open-Meteo pollen forecast is
  limited to Europe.

