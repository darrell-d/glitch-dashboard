"""Local dashboard server and cached, fixed-upstream feed adapters."""

import argparse
import json
import math
import os
import threading
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).parent
NYT_URL = "https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml"
QUOTE_URL = "https://darrelld.com/quote/json/random"


def fetch(url):
    request = urllib.request.Request(url, headers={"User-Agent": "glitch-dashboard/0.1"})
    with urllib.request.urlopen(request, timeout=8) as response:
        data = response.read(2_000_001)
    if len(data) > 2_000_000:
        raise ValueError("Feed exceeds size limit")
    return data


def parse_news(raw):
    root = ET.fromstring(raw)
    items = []
    for item in root.findall("./channel/item"):
        title = (item.findtext("title") or "").strip()
        link = (item.findtext("link") or "").strip()
        if title and urllib.parse.urlparse(link).scheme == "https":
            items.append({"title": title, "url": link, "published": item.findtext("pubDate")})
    if not items:
        raise ValueError("No headlines in feed")
    return {"source": "The New York Times", "items": items[:24]}


def parse_quote(raw):
    item = json.loads(raw)
    if not isinstance(item.get("quote"), str) or not item["quote"].strip():
        raise ValueError("Quote missing")
    return {"text": item["quote"].strip(), "author": item.get("source") or "Unknown"}


def weather_url(latitude, longitude, timezone_name):
    query = urllib.parse.urlencode({
        "latitude": latitude, "longitude": longitude,
        "current": "temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m",
        "daily": "weather_code,temperature_2m_max,temperature_2m_min",
        "temperature_unit": "fahrenheit", "wind_speed_unit": "mph",
        "timezone": timezone_name, "forecast_days": 5,
    })
    return "https://api.open-meteo.com/v1/forecast?" + query


def parse_weather(raw):
    data = json.loads(raw)
    current, daily = data["current"], data["daily"]
    for key in ("temperature_2m", "apparent_temperature", "relative_humidity_2m", "weather_code", "wind_speed_10m"):
        if not isinstance(current[key], (float, int)) or not math.isfinite(current[key]):
            raise ValueError("Missing current weather")
    if not daily["time"] or any(len(daily[key]) != len(daily["time"]) for key in (
        "temperature_2m_max", "temperature_2m_min", "weather_code"
    )):
        raise ValueError("Incomplete forecast")
    return {"current": current, "daily": daily}


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


def make_feeds(config):
    url = weather_url(config["latitude"], config["longitude"], config["timezone"])
    return {
        "news": Feed(lambda: parse_news(fetch(NYT_URL)), 600),
        "weather": Feed(lambda: parse_weather(fetch(url)), 600),
        "quote": Feed(lambda: parse_quote(fetch(QUOTE_URL)), 90),
    }


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, feeds, config, **kwargs):
        self.feeds, self.config = feeds, config
        super().__init__(*args, directory=str(ROOT / "public"), **kwargs)

    def do_GET(self):
        path = urllib.parse.urlparse(self.path).path
        if path == "/api/config":
            self.send_json(self.config)
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
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        super().end_headers()

    def list_directory(self, path):
        self.send_error(404)
        return None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8080)
    args = parser.parse_args()
    config = {
        "location": os.environ.get("WEATHER_LOCATION", "Philadelphia"),
        "latitude": float(os.environ.get("WEATHER_LATITUDE", "39.9526")),
        "longitude": float(os.environ.get("WEATHER_LONGITUDE", "-75.1652")),
        "timezone": os.environ.get("DASHBOARD_TIMEZONE", "America/New_York"),
    }
    if not (-90 <= config["latitude"] <= 90 and -180 <= config["longitude"] <= 180):
        parser.error("Weather coordinates out of range")
    feeds = make_feeds(config)
    server = ThreadingHTTPServer((args.host, args.port), partial(Handler, feeds=feeds, config=config))
    # Warm each feed independently so one slow upstream does not block the rest.
    with ThreadPoolExecutor(max_workers=3) as pool:
        for feed in feeds.values():
            pool.submit(feed.get)
        print(f"glitch-dashboard: http://{args.host}:{args.port}", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
        finally:
            server.server_close()


if __name__ == "__main__":
    main()
