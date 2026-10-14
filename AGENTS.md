# glitch-dashboard

Personal monitor dashboard: Python standard-library server plus buildless HTML,
CSS, and JavaScript. curl is required for POLITICO (included in Docker).
`make run`, `make test`, and `make check` are entrypoints.

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
- Display name is "The Daily", in italic Bodoni Moda with local serif fallbacks.
  Do not add a glitch effect. Keep article counts and outbound article links off
  the display. Non-square photos use a blurred copy behind the uncropped original.
- No global app header, visible section names, or navigation dots anywhere.
  Keep automatic rotation, keyboard navigation, and display controls.
- Weather uses local SVG artwork based on WMO condition and `is_day`, plus five
  forecast icons. No provider/Outside labels on the screen; attribution in Settings.
- Quote pages show quote/author without collection labels or darrelld.com links.
- Display loading, unavailable, and stale states honestly; do not present sample
  content as live data.
- Keep upstream refresh intervals independent from panel rotation.
- Confirmed defaults: Philadelphia, Fahrenheit first with Celsius alongside,
  NYT homepage headlines, and 30-second panel rotation.
- Keep source/category expansion easy; detailed news preferences are deferred.
- `sources.py` configures NYT, CNN, Kotaku, WSJ, The Atlantic, POLITICO, WIRED,
  Ars Technica, TechCrunch, and The New Yorker. Cap each source at four distinct
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
