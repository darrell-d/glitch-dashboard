"""Local dashboard server and cached, fixed-upstream feed adapters."""

import argparse
import json
import math
import os
import subprocess
import threading
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from sources import SOURCES, load_source, parse_news

ROOT = Path(__file__).parent
QUOTE_URL = "https://darrelld.com/quote/json/random"
GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search"
RAINVIEWER_URL = "https://api.rainviewer.com/public/weather-maps.json"
DEFAULT_POSTAL_CODE = "19103"
CITY_CATALOG = ROOT / "data" / "us-major-cities.json"


def fetch(url):
    if url == "https://www.politico.com/rss/politicopicks.xml":
        # This public feed accepts the installed curl transport but rejects urllib.
        data = subprocess.run(["curl", "--fail", "--silent", "--show-error", "--location",
                               "--proto", "=https", "--proto-redir", "=https",
                               "--max-time", "8", "--max-filesize", "2000000", url],
                              capture_output=True, check=True, timeout=10).stdout
        if len(data) > 2_000_000:
            raise ValueError("Feed exceeds size limit")
        return data
    request = urllib.request.Request(url, headers={"User-Agent": "glitch-dashboard/0.2 (lain@precursordigital.com)"})
    with urllib.request.urlopen(request, timeout=8) as response:
        data = response.read(2_000_001)
    if len(data) > 2_000_000:
        raise ValueError("Feed exceeds size limit")
    return data


def fetch_head(url):
    request = urllib.request.Request(url, headers={"User-Agent": "glitch-dashboard/0.2 (lain@precursordigital.com)"})
    with urllib.request.urlopen(request, timeout=8) as response:
        data = b""
        # CNN embeds substantial scripts before its public social metadata.
        # Stop after the useful tags rather than downloading the article body.
        while len(data) < 1_000_000:
            chunk = response.read(min(128_000, 1_000_000 - len(data)))
            if not chunk:
                break
            data += chunk
            if b"og:image" in data and b"og:description" in data:
                break
        return data


def parse_quote(raw):
    item = json.loads(raw)
    if not isinstance(item.get("quote"), str) or not item["quote"].strip():
        raise ValueError("Quote missing")
    return {"text": item["quote"].strip(), "author": item.get("source") or "Unknown"}


def weather_url(latitude, longitude, timezone_name):
    query = urllib.parse.urlencode({
        "latitude": latitude, "longitude": longitude,
        "current": "temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,is_day",
        "hourly": "temperature_2m,weather_code,precipitation_probability,is_day",
        "daily": "weather_code,temperature_2m_max,temperature_2m_min",
        "temperature_unit": "fahrenheit", "wind_speed_unit": "mph",
        "timezone": timezone_name, "forecast_days": 5, "forecast_hours": 12,
    })
    return "https://api.open-meteo.com/v1/forecast?" + query


def normalize_postal_code(value):
    value = (value or "").strip()
    if len(value) == 10 and value[5] == "-" and value[:5].isdigit() and value[6:].isdigit():
        value = value[:5]
    if len(value) != 5 or not value.isdigit():
        raise ValueError("Postal code must be five digits")
    return value


def location_url(postal_code):
    query = urllib.parse.urlencode({
        "name": normalize_postal_code(postal_code), "count": 5,
        "language": "en", "format": "json", "countryCode": "US",
    })
    return f"{GEOCODING_URL}?{query}"


def parse_location(raw, postal_code):
    postal_code = normalize_postal_code(postal_code)
    results = json.loads(raw).get("results") or []
    match = next((item for item in results if postal_code in item.get("postcodes", [])), None)
    if not match:
        raise ValueError("Postal code was not found")
    latitude, longitude = match.get("latitude"), match.get("longitude")
    if not isinstance(latitude, (float, int)) or not isinstance(longitude, (float, int)):
        raise ValueError("Location coordinates are missing")
    return {
        "postal_code": postal_code, "location": match["name"],
        "region": match.get("admin1") or "", "latitude": latitude,
        "longitude": longitude, "timezone": match.get("timezone") or "UTC",
    }


def parse_radar(raw):
    data = json.loads(raw)
    host = data.get("host", "")
    if host != "https://tilecache.rainviewer.com":
        raise ValueError("Unexpected radar tile host")
    frames = data.get("radar", {}).get("past", [])[-4:]
    parsed = [{"time": frame["time"], "path": frame["path"]} for frame in frames
              if isinstance(frame.get("time"), int) and frame.get("path", "").startswith("/v2/radar/")]
    if not parsed:
        raise ValueError("Radar frames are missing")
    return {"host": host, "frames": parsed}


def load_major_cities(path=CITY_CATALOG):
    data = json.loads(Path(path).read_text())
    cities = data.get("cities")
    if not isinstance(cities, list) or not cities:
        raise ValueError("Major-city catalog is empty")
    return cities


def map_point(latitude, longitude, zoom=8, tile_size=256):
    size = tile_size * (2 ** zoom)
    latitude = max(-85.05112878, min(85.05112878, latitude))
    sine = math.sin(math.radians(latitude))
    return ((longitude + 180) / 360 * size,
            (0.5 - math.log((1 + sine) / (1 - sine)) / (4 * math.pi)) * size)


def select_major_cities(cities, latitude, longitude, limit=6, width=1920, height=1080):
    center_x, center_y = map_point(latitude, longitude)
    candidates = []
    for city in cities:
        x, y = map_point(city["latitude"], city["longitude"])
        screen_x, screen_y = width / 2 + x - center_x, height / 2 + y - center_y
        distance = math.hypot(screen_x - width / 2, screen_y - height / 2)
        if 120 <= screen_x <= width - 90 and 130 <= screen_y <= height - 100 and distance >= 115:
            score = city["population"] + (500_000 if city.get("capital") else 0)
            candidates.append((score, city, screen_x, screen_y))
    selected = []
    for _, city, screen_x, screen_y in sorted(candidates, key=lambda item: -item[0]):
        if all(math.hypot(screen_x - item[1], screen_y - item[2]) >= 115 for item in selected):
            selected.append((city, screen_x, screen_y))
        if len(selected) == limit:
            break
    return [item[0] for item in selected]


def nearby_temperature_url(places):
    query = urllib.parse.urlencode({
        "latitude": ",".join(str(item["latitude"]) for item in places),
        "longitude": ",".join(str(item["longitude"]) for item in places),
        "current": "temperature_2m", "temperature_unit": "fahrenheit", "timezone": "auto",
    }, safe=",")
    return "https://api.open-meteo.com/v1/forecast?" + query


def add_temperatures(places, raw):
    data = json.loads(raw)
    responses = data if isinstance(data, list) else [data]
    result = []
    for place, response in zip(places, responses):
        temperature = response.get("current", {}).get("temperature_2m")
        if isinstance(temperature, (int, float)) and math.isfinite(temperature):
            result.append({**place, "temperature": temperature})
    return result


def parse_weather(raw):
    data = json.loads(raw)
    current, hourly, daily = data["current"], data["hourly"], data["daily"]
    for key in ("temperature_2m", "apparent_temperature", "relative_humidity_2m", "weather_code", "wind_speed_10m"):
        if not isinstance(current[key], (float, int)) or not math.isfinite(current[key]):
            raise ValueError("Missing current weather")
    if not daily["time"] or any(len(daily[key]) != len(daily["time"]) for key in (
        "temperature_2m_max", "temperature_2m_min", "weather_code"
    )):
        raise ValueError("Incomplete forecast")
    if len(hourly["time"]) < 12 or any(len(hourly[key]) != len(hourly["time"]) for key in (
        "temperature_2m", "weather_code", "precipitation_probability", "is_day"
    )):
        raise ValueError("Incomplete hourly forecast")
    return {"current": current, "hourly": hourly, "daily": daily}


class Feed:
    def __init__(self, loader, ttl):
        self.loader, self.ttl = loader, ttl
        self.lock = threading.Lock()
        self.value, self.updated, self.retry_after = None, 0, 0
        self.failed = False

    def get(self):
        with self.lock:
            now = time.time()
            if now >= self.retry_after and (self.failed or now - self.updated >= self.ttl):
                try:
                    value = self.loader()
                    self.value, self.updated, self.failed = value, time.time(), False
                except Exception:
                    # Retain last good data; do not expose upstream bodies/errors.
                    self.failed = True
                    self.retry_after = time.time() + 30
            return {
                "data": self.value,
                "updated_at": datetime.fromtimestamp(self.updated, timezone.utc).isoformat() if self.updated else None,
                "stale": self.failed or (bool(self.updated) and time.time() - self.updated >= self.ttl),
                "error": "Feed temporarily unavailable" if self.failed else None,
            }


class NewsFeed:
    def __init__(self, feeds, sources=SOURCES):
        self.feeds, self.sources = feeds, sources

    def get(self):
        with ThreadPoolExecutor(max_workers=len(self.sources)) as pool:
            results = list(pool.map(lambda source: self.feeds[source["id"]].get(), self.sources))
        statuses, groups = [], []
        for source, result in zip(self.sources, results):
            items = result["data"]["items"] if result["data"] else []
            statuses.append({"id": source["id"], "name": source["name"], "selection": source.get("selection", ""),
                             "count": len(items), "stale": result["stale"], "updated_at": result["updated_at"],
                             "available": bool(items)})
            groups.append([{**item, "source_updated_at": result["updated_at"], "source_stale": result["stale"]} for item in items])
        # Interleave publishers so four stories from one outlet never dominate a batch.
        items = [group[rank] for rank in range(4) for group in groups if rank < len(group)]
        updated = [result["updated_at"] for result in results if result["updated_at"]]
        return {"data": {"items": items, "sources": statuses} if items else None,
                "updated_at": max(updated) if updated else None,
                "stale": all(not status["available"] or status["stale"] for status in statuses),
                "error": None if items else "News sources temporarily unavailable"}


class LocationFeeds:
    def __init__(self, fetcher=fetch, cities=None):
        self.fetcher = fetcher
        self.cities = cities if cities is not None else load_major_cities()
        self.lock = threading.Lock()
        self.locations = {}
        self.weather = {}
        self.radar = {}

    def _location_feed(self, postal_code):
        with self.lock:
            return self.locations.setdefault(postal_code, Feed(
                lambda: parse_location(self.fetcher(location_url(postal_code)), postal_code), 86400))

    def location(self, postal_code):
        postal_code = normalize_postal_code(postal_code)
        return self._location_feed(postal_code).get()

    def _resolved(self, postal_code):
        result = self.location(postal_code)
        if not result["data"]:
            raise ValueError("Location unavailable")
        return result["data"]

    def weather_feed(self, postal_code):
        postal_code = normalize_postal_code(postal_code)
        with self.lock:
            return self.weather.setdefault(postal_code, Feed(lambda: self._load_weather(postal_code), 600))

    def _load_weather(self, postal_code):
        location = self._resolved(postal_code)
        return parse_weather(self.fetcher(weather_url(
            location["latitude"], location["longitude"], location["timezone"])))

    def radar_feed(self, postal_code):
        postal_code = normalize_postal_code(postal_code)
        with self.lock:
            return self.radar.setdefault(postal_code, Feed(lambda: self._load_radar(postal_code), 300))

    def _load_radar(self, postal_code):
        location = self._resolved(postal_code)
        radar = parse_radar(self.fetcher(RAINVIEWER_URL))
        cities = select_major_cities(self.cities, location["latitude"], location["longitude"])
        if cities:
            cities = add_temperatures(cities, self.fetcher(nearby_temperature_url(cities)))
        return {**radar, "location": location, "cities": cities}


def make_feeds():
    return {
        "news": NewsFeed({source["id"]: Feed(partial(load_source, source, fetch, fetch_head), 600) for source in SOURCES}),
        "quote": Feed(lambda: parse_quote(fetch(QUOTE_URL)), 90),
    }


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, feeds, locations, default_postal_code, **kwargs):
        self.feeds, self.locations, self.default_postal_code = feeds, locations, default_postal_code
        super().__init__(*args, directory=str(ROOT / "public"), **kwargs)

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        query = urllib.parse.parse_qs(parsed.query)
        postal_code = query.get("postal_code", [self.default_postal_code])[0]
        if path == "/api/config":
            try:
                result = self.locations.location(postal_code)
            except ValueError as error:
                self.send_json({"error": str(error)}, 400)
                return
            self.send_json(result["data"] or {"error": result["error"]}, 200 if result["data"] else 404)
        elif path in ("/api/weather", "/api/radar"):
            try:
                feed = self.locations.weather_feed(postal_code) if path == "/api/weather" else self.locations.radar_feed(postal_code)
            except ValueError as error:
                self.send_json({"error": str(error)}, 400)
                return
            result = feed.get()
            self.send_json(result, 200 if result["data"] is not None else 503)
        elif path.startswith("/api/"):
            feed = self.feeds.get(path.removeprefix("/api/"))
            if not feed:
                self.send_json({"error": "Unknown feed"}, 404)
                return
            result = feed.get()
            self.send_json(result, 200 if result["data"] is not None else 503)
        else:
            super().do_GET()

    def send_json(self, value, status=200):
        body = json.dumps(value, allow_nan=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def end_headers(self):
        if not urllib.parse.urlparse(self.path).path.startswith("/api/"):
            self.send_header("Cache-Control", "no-cache")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "strict-origin-when-cross-origin")
        super().end_headers()

    def list_directory(self, path):
        self.send_error(404)
        return None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8080)
    args = parser.parse_args()
    try:
        default_postal_code = normalize_postal_code(os.environ.get("DASHBOARD_ZIP", DEFAULT_POSTAL_CODE))
    except ValueError as error:
        parser.error(str(error))
    feeds = make_feeds()
    locations = LocationFeeds()
    server = ThreadingHTTPServer((args.host, args.port), partial(
        Handler, feeds=feeds, locations=locations, default_postal_code=default_postal_code))
    # Warm each feed independently so one slow upstream does not block the rest.
    with ThreadPoolExecutor(max_workers=4) as pool:
        for feed in feeds.values():
            pool.submit(feed.get)
        pool.submit(locations.weather_feed(default_postal_code).get)
        pool.submit(locations.radar_feed(default_postal_code).get)
        print(f"glitch-dashboard: http://{args.host}:{args.port}", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
        finally:
            server.server_close()


if __name__ == "__main__":
    main()
