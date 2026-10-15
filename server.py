"""Local dashboard server and cached, fixed-upstream feed adapters."""

import argparse
import html
import json
import random
import re
import math
import os
import subprocess
import threading
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from sources import SOURCES, load_source, parse_news

ROOT = Path(__file__).parent
QUOTE_URL = "https://darrelld.com/quote/json/random"
GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search"
RAINVIEWER_URL = "https://api.rainviewer.com/public/weather-maps.json"
AIR_QUALITY_URL = "https://air-quality-api.open-meteo.com/v1/air-quality"
NWS_ALERTS_URL = "https://api.weather.gov/alerts/active"
ALERT_SEVERITY = ("Extreme", "Severe", "Moderate", "Minor")
DEFAULT_POSTAL_CODE = "19103"
CITY_CATALOG = ROOT / "data" / "us-major-cities.json"
SETTINGS_PATH = Path(os.environ.get("DASHBOARD_SETTINGS", ROOT / "data" / "settings.json"))
# Seconds each kind of screen stays up; editable from Settings and shared by every display.
SCREEN_DURATIONS = {"article": 30, "weather": 30, "radar": 30, "markets": 60, "quote": 30, "gallery": 300, "picture": 20}
DURATION_LIMITS = (5, 3600)
NASA_IOTD_URL = "https://www.nasa.gov/feeds/iotd-feed/"
NASA_IMAGES_URL = "https://images-api.nasa.gov"
# Specific subjects keep random archive picks on striking imagery rather than launch-pad snapshots.
NASA_ARCHIVE_TOPICS = ("nebula", "galaxy", "star cluster", "supernova", "planetary nebula", "Jupiter",
                       "Saturn", "Mars surface", "aurora", "Moon surface", "comet", "Earth at night")


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
        "current": "temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,is_day,uv_index",
        "hourly": "temperature_2m,weather_code,precipitation_probability,is_day",
        "daily": "weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset",
        "temperature_unit": "fahrenheit", "wind_speed_unit": "mph",
        "timezone": timezone_name, "forecast_days": 5, "forecast_hours": 12,
    })
    return "https://api.open-meteo.com/v1/forecast?" + query


def air_quality_url(latitude, longitude):
    query = urllib.parse.urlencode({
        "latitude": latitude, "longitude": longitude, "current": "us_aqi,pm2_5", "timezone": "auto",
    })
    return f"{AIR_QUALITY_URL}?{query}"


def alerts_url(latitude, longitude):
    return f"{NWS_ALERTS_URL}?point={latitude:.4f},{longitude:.4f}"


def finite(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def parse_air_quality(raw):
    current = json.loads(raw).get("current") or {}
    if not finite(current.get("us_aqi")):
        raise ValueError("Air quality index missing")
    return {"us_aqi": round(current["us_aqi"]),
            "pm2_5": current["pm2_5"] if finite(current.get("pm2_5")) else None}


def parse_alerts(raw, limit=6):
    alerts, seen = [], set()
    for feature in json.loads(raw).get("features") or []:
        item = feature.get("properties") or {}
        event = item.get("event")
        if (not isinstance(event, str) or item.get("status") != "Actual"
                or item.get("messageType") == "Cancel" or event in seen):
            continue
        seen.add(event)
        alerts.append({"event": event.strip(), "severity": item.get("severity") or "Unknown",
                       "headline": item.get("headline") or "", "onset": item.get("onset"),
                       "ends": item.get("ends") or item.get("expires")})
    rank = {name: index for index, name in enumerate(ALERT_SEVERITY)}
    return sorted(alerts, key=lambda alert: rank.get(alert["severity"], len(rank)))[:limit]


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
    if any(len(daily.get(key) or []) != len(daily["time"]) for key in ("sunrise", "sunset")):
        daily = {key: value for key, value in daily.items() if key not in ("sunrise", "sunset")}
    if len(hourly["time"]) < 12 or any(len(hourly[key]) != len(hourly["time"]) for key in (
        "temperature_2m", "weather_code", "precipitation_probability", "is_day"
    )):
        raise ValueError("Incomplete hourly forecast")
    offset = data.get("utc_offset_seconds")
    return {"current": current, "hourly": hourly, "daily": daily,
            "utc_offset_seconds": offset if finite(offset) else None}


class WeatherFeed:
    """Forecast plus independently cached, optional air-quality and alert feeds."""

    def __init__(self, forecast, extras):
        self.forecast, self.extras = forecast, extras

    def get(self):
        result = self.forecast.get()
        if result["data"]:
            result = {**result, "data": {**result["data"],
                                         **{name: feed.get()["data"] for name, feed in self.extras.items()}}}
        return result


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
            if postal_code not in self.weather:
                self.weather[postal_code] = WeatherFeed(Feed(lambda: self._load_weather(postal_code), 600), {
                    "air_quality": Feed(lambda: self._load_extra(postal_code, air_quality_url, parse_air_quality), 1800),
                    "alerts": Feed(lambda: self._load_extra(postal_code, alerts_url, parse_alerts), 300),
                })
            return self.weather[postal_code]

    def _load_weather(self, postal_code):
        location = self._resolved(postal_code)
        return parse_weather(self.fetcher(weather_url(
            location["latitude"], location["longitude"], location["timezone"])))

    def _load_extra(self, postal_code, url, parse):
        location = self._resolved(postal_code)
        return parse(self.fetcher(url(location["latitude"], location["longitude"])))

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


def plain(value):
    return " ".join(html.unescape(re.sub(r"<[^>]+>", " ", value or "")).split())


def description_text(value):
    """Plain description without sentences that only point to a web address."""
    sentences = re.split(r"(?<=[.!?])\s+", plain(value))
    return " ".join(sentence for sentence in sentences if not re.search(r"https?://|www\.", sentence))


def parse_nasa_iotd(raw, limit=5):
    """Newest NASA Images of the Day (one per weekday), resized by NASA's image service."""
    photos = []
    for item in ET.fromstring(raw).findall("./channel/item"):
        enclosure = item.find("enclosure")
        url = enclosure.get("url", "") if enclosure is not None else ""
        if not url.startswith("https://") or not enclosure.get("type", "").startswith("image/"):
            continue
        published = item.findtext("pubDate") or ""
        photos.append({"url": f"{url}?w=2048", "title": plain(item.findtext("title")),
                       "description": description_text(item.findtext("description")), "credit": "NASA",
                       "kicker": "NASA Image of the Day", "published": published,
                       "page_url": item.findtext("link") or ""})
        if len(photos) == limit:
            break
    if not photos:
        raise ValueError("NASA Image of the Day feed has no images")
    return photos


CODE_TITLE = re.compile(r"^[A-Z0-9]{2,8}[-_ ][A-Za-z0-9-]+$")
# Ground operations and events are rarely striking on a wall display.
MUNDANE = re.compile(r"\b(payload|encapsulat\w*|field ?work|test(s|ing)?|ceremony|meeting|briefing|"
                     r"rollout|processing|technicians?|workers?|press|visitors?|experiments?)\b", re.I)


def pick_nasa_archive(fetcher, day, count=5, attempts=20):
    """A day's random picks from the NASA Image and Video Library (public domain), stable for that day."""
    chooser = random.Random(day.isoformat())
    picks, seen = [], set()
    for _ in range(attempts):
        if len(picks) == count:
            break
        topic = chooser.choice(NASA_ARCHIVE_TOPICS)
        query = lambda **extra: f"{NASA_IMAGES_URL}/search?" + urllib.parse.urlencode(
            {"q": topic, "media_type": "image", "page_size": 25, **extra})
        hits = json.loads(fetcher(query(page_size=1)))["collection"]["metadata"]["total_hits"]
        page = chooser.randint(1, max(1, min(hits, 10000) // 25))
        candidates = []
        for item in json.loads(fetcher(query(page=page)))["collection"]["items"]:
            data = (item.get("data") or [{}])[0]
            title, description = plain(data.get("title")), plain(data.get("description"))
            if (data.get("nasa_id") and data["nasa_id"] not in seen and len(description) >= 80
                    and not CODE_TITLE.match(title) and not MUNDANE.search(title)
                    and data.get("center") not in ("KSC", "HQ")):
                candidates.append(data)
        if not candidates:
            continue
        data = chooser.choice(candidates)
        seen.add(data["nasa_id"])
        assets = [entry["href"] for entry in json.loads(fetcher(
            f"{NASA_IMAGES_URL}/asset/{urllib.parse.quote(data['nasa_id'])}"))["collection"]["items"]]
        url = next((href for size in ("~large.", "~medium.") for href in assets if size in href), "")
        if not url:
            continue
        year = (data.get("date_created") or "")[:4]
        picks.append({"url": url.replace("http://", "https://", 1), "title": plain(data.get("title")),
                      "description": description_text(data.get("description")),
                      "credit": plain(data.get("photographer") or data.get("secondary_creator") or "")
                      or f"NASA/{data.get('center') or 'NASA'}",
                      "kicker": f"From the NASA archive{f' · {year}' if year else ''}",
                      "published": data.get("date_created"), "page_url": ""})
    return picks


def load_pictures(fetcher=None, now=None):
    """Five newest NASA Images of the Day plus five random archive images for today."""
    fetcher = fetcher or fetch
    photos = []
    try:
        photos += parse_nasa_iotd(fetcher(NASA_IOTD_URL))
    except Exception:
        pass  # The archive half can still supply the day's pictures.
    try:
        photos += pick_nasa_archive(fetcher, (now or datetime.now(timezone.utc)).date())
    except Exception:
        pass
    if not photos:
        raise ValueError("NASA pictures unavailable")
    return {"photos": photos}


def parse_screen_durations(value):
    if not isinstance(value, dict) or set(value) - set(SCREEN_DURATIONS):
        raise ValueError("Unknown screen")
    durations = dict(SCREEN_DURATIONS)
    for screen, seconds in value.items():
        if (not isinstance(seconds, int) or isinstance(seconds, bool)
                or not DURATION_LIMITS[0] <= seconds <= DURATION_LIMITS[1]):
            raise ValueError("Screen time must be 5-3600 whole seconds")
        durations[screen] = seconds
    return durations


class SettingsStore:
    """Dashboard-wide settings persisted as a small JSON file next to the server."""

    def __init__(self, path=SETTINGS_PATH):
        self.path, self.lock = Path(path), threading.Lock()

    def get(self):
        with self.lock:
            try:
                saved = json.loads(self.path.read_text())
                return {"screen_durations": parse_screen_durations(saved.get("screen_durations", {}))}
            except (OSError, ValueError, AttributeError):
                return {"screen_durations": dict(SCREEN_DURATIONS)}

    def save(self, value):
        settings = {"screen_durations": parse_screen_durations((value or {}).get("screen_durations"))}
        with self.lock:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            temporary = self.path.with_suffix(".tmp")
            temporary.write_text(json.dumps(settings, indent=2) + "\n")
            temporary.replace(self.path)
        return settings


def make_feeds():
    return {
        "news": NewsFeed({source["id"]: Feed(partial(load_source, source, fetch, fetch_head), 600) for source in SOURCES}),
        "quote": Feed(lambda: parse_quote(fetch(QUOTE_URL)), 90),
        # One new Image of the Day per weekday; archive picks change daily.
        "pictures": Feed(load_pictures, 6 * 3600),
    }


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, feeds, locations, default_postal_code, settings=None, **kwargs):
        self.feeds, self.locations, self.default_postal_code = feeds, locations, default_postal_code
        self.settings = settings or SettingsStore()
        super().__init__(*args, directory=str(ROOT / "public"), **kwargs)

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        query = urllib.parse.parse_qs(parsed.query)
        postal_code = query.get("postal_code", [self.default_postal_code])[0]
        if path == "/api/settings":
            self.send_json(self.settings.get())
            return
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

    def do_POST(self):
        if urllib.parse.urlparse(self.path).path != "/api/settings":
            self.send_json({"error": "Not found"}, 404)
            return
        # A JSON content type forces a CORS preflight, which this server never approves,
        # so other websites cannot change settings through the visitor's browser.
        length = int(self.headers.get("Content-Length") or 0)
        if self.headers.get_content_type() != "application/json" or not 0 < length <= 4096:
            self.send_json({"error": "Expected a small JSON body"}, 400)
            return
        try:
            settings = self.settings.save(json.loads(self.rfile.read(length)))
        except (ValueError, AttributeError) as error:
            self.send_json({"error": str(error)}, 400)
            return
        except OSError:
            self.send_json({"error": "Settings could not be saved"}, 500)
            return
        self.send_json(settings)

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
