# glitch-dashboard

Personal monitor dashboard: Python standard-library server plus buildless HTML,
CSS, and JavaScript. `make run`, `make test`, and `make check` are entrypoints.

- Read `README.md`, `TODO.md`, and local `agent-notes/` before implementing.
- Keep the experience full-viewport and readable at a distance.
- Keep rotation timing and transition choice configurable.
- Rotation: three individual story pages, weather, quote, then the next batch.
  No headline overview/list. `public/edition.js` fixes the batch during display.
- Use requestAnimationFrame for smooth elapsed-time progress, preserving pause
  and resume. Keep upstream polling independent of that animation loop.
- Newspaper pages use RSS headlines, images/captions/credits, and short
  descriptions. Full article bodies are unavailable; the user chose this
  simplified format instead of bullet summaries and article text.
- Approved newspaper design: full-height, uncropped square photo on the left,
  cream newspaper column on the right. No dashboard chrome taking photo space.
  Use `/#article` for direct access; maintain story controls and portrait fallback.
- Display loading, unavailable, and stale states honestly; do not present sample
  content as live data.
- Keep upstream refresh intervals independent from panel rotation.
- Confirmed defaults: Philadelphia, Fahrenheit first with Celsius alongside,
  NYT homepage headlines, and 30-second panel rotation.
- Keep source/category expansion easy; detailed news preferences are deferred.
- News should keep one representative per inferred homepage story group, rather
  than one per editorial section. `news.py` filters companions in feed order;
  preserve tests for unrelated stories sharing a politician or broad subject.
- Use `/quote/json/random` for quotes; `/api/quotes/` is a different endpoint.
- Never store the fullPage.js license in source, documentation, or logs.
- No deployment or changes to darrelld.com are authorized by this kickoff.
- Do not commit `agent-notes/`.
