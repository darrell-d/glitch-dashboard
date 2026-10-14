.PHONY: run test check

run:
	python3 server.py

test:
	python3 -m unittest discover -s tests -v

check: test
	node --check public/app.js
	node --check public/edition.js
	node --check public/weather.js
	node --check public/moon.js
	node --test tests/test_edition.cjs tests/test_app.cjs tests/test_weather.cjs tests/test_moon.cjs
