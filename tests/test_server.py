import json
import io
import unittest
from unittest.mock import Mock, patch

from server import (Feed, add_station_temperatures, fetch, fetch_head, location_url,
                    nearby_temperature_url, normalize_postal_code, parse_location,
                    parse_news, parse_quote, parse_radar, parse_stations, parse_weather,
                    select_surrounding_stations, weather_url)


class FeedTests(unittest.TestCase):
    def test_ttl_and_last_good_data_on_outage(self):
        loader = Mock(side_effect=[{"text": "real"}, OSError("upstream down"), {"text": "new"}])
        feed = Feed(loader, 60)
        with patch("server.time.time", return_value=1000):
            first = feed.get()
            self.assertFalse(first["stale"])
            self.assertEqual(feed.get(), first)
            self.assertEqual(loader.call_count, 1)
        with patch("server.time.time", return_value=1061):
            stale = feed.get()
            self.assertTrue(stale["stale"])
            self.assertEqual(stale["data"], first["data"])
            self.assertEqual(stale["updated_at"], first["updated_at"])
        with patch("server.time.time", return_value=1070):
            feed.get()
            self.assertEqual(loader.call_count, 2)
        with patch("server.time.time", return_value=1092):
            recovered = feed.get()
            self.assertFalse(recovered["stale"])
            self.assertEqual(recovered["data"], {"text": "new"})

    def test_first_failure_has_no_fabricated_content(self):
        feed = Feed(Mock(side_effect=OSError()), 60)
        self.assertEqual(feed.get(), {
            "data": None, "updated_at": None, "stale": True,
            "error": "Feed temporarily unavailable",
        })


class AdapterTests(unittest.TestCase):
    def test_cnn_metadata_can_be_after_large_head_scripts(self):
        raw = b"<head>" + b"x" * 320000 + b'<meta property="og:image" content="https://example.com/a.jpg"><meta property="og:description" content="Brief">' + b"x" * 1_000_000
        with patch("server.urllib.request.urlopen", return_value=io.BytesIO(raw)):
            metadata = fetch_head("https://www.cnn.com/report")
        self.assertIn(b"og:image", metadata)
        self.assertLess(len(metadata), 1_000_000)

    def test_politico_uses_bounded_public_curl_transport(self):
        with patch("server.subprocess.run", return_value=Mock(stdout=b"<rss/>")) as run:
            self.assertEqual(fetch("https://www.politico.com/rss/politicopicks.xml"), b"<rss/>")
        self.assertIn("--max-filesize", run.call_args.args[0])
        self.assertEqual(run.call_args.kwargs["timeout"], 10)

    def test_rss_entities_and_unsafe_links(self):
        result = parse_news(b'''<rss><channel>
          <item><title>A &amp; B</title><link>https://www.nytimes.com/a</link></item>
          <item><title>Unsafe</title><link>javascript:alert(1)</link></item>
        </channel></rss>''')
        self.assertEqual(len(result["items"]), 1)
        item = result["items"][0]
        self.assertEqual(item["title"], "A & B")
        self.assertEqual(item["url"], "https://www.nytimes.com/a")
        self.assertIsNone(item["published"])
        self.assertEqual(item["image_url"], "")

    def test_newspaper_metadata_and_html_description(self):
        raw = b'''<rss xmlns:media="http://search.yahoo.com/mrss/" xmlns:dc="http://purl.org/dc/elements/1.1/">
          <channel><item><title>A dispatch</title><link>https://www.nytimes.com/a</link>
          <description><![CDATA[<p>A <b>short</b> description &amp; context.</p>]]></description>
          <dc:creator>Jane Reporter</dc:creator>
          <media:content url="https://static01.nyt.com/image.jpg"/>
          <media:description>A scene from the report.</media:description>
          <media:credit>A Photographer/The New York Times</media:credit>
          </item></channel></rss>'''
        item = parse_news(raw)["items"][0]
        self.assertEqual(item["description"], "A short description & context.")
        self.assertEqual(item["author"], "Jane Reporter")
        self.assertEqual(item["image_url"], "https://static01.nyt.com/image.jpg")
        self.assertEqual(item["image_caption"], "A scene from the report.")
        self.assertEqual(item["image_credit"], "A Photographer/The New York Times")
        self.assertNotIn("categories", item)

    def test_unsafe_image_is_not_exposed(self):
        raw = b'''<rss xmlns:media="http://search.yahoo.com/mrss/"><channel><item>
          <title>A dispatch</title><link>https://www.nytimes.com/a</link>
          <media:content url="javascript:alert(1)"/></item></channel></rss>'''
        self.assertEqual(parse_news(raw)["items"][0]["image_url"], "")

    def test_empty_feed_rejected(self):
        with self.assertRaises(ValueError):
            parse_news(b"<rss><channel/></rss>")

    def test_quote_uses_existing_endpoint_schema(self):
        result = parse_quote(b'{"quote":" A thought. ","source":"An author","body":"ignored"}')
        self.assertEqual(result, {"text": "A thought.", "author": "An author"})
        with self.assertRaises(ValueError):
            parse_quote(b'{"error":"No quote available"}')

    def test_weather_rejects_null_current_data(self):
        raw = {"current": {"temperature_2m": None}, "hourly": {}, "daily": {}}
        with self.assertRaises(ValueError):
            parse_weather(json.dumps(raw))

    def test_weather_requests_fahrenheit(self):
        url = weather_url(39.95, -75.16, "America/New_York")
        self.assertIn("temperature_unit=fahrenheit", url)
        self.assertIn("forecast_days=5", url)
        self.assertIn("forecast_hours=12", url)
        self.assertIn("precipitation_probability", url)

    def test_weather_includes_complete_hourly_forecast(self):
        raw = {
            "current": {"temperature_2m": 70, "apparent_temperature": 70,
                        "relative_humidity_2m": 55, "weather_code": 1,
                        "wind_speed_10m": 8, "is_day": 1},
            "hourly": {"time": [f"2026-10-14T{hour:02d}:00" for hour in range(12)],
                       "temperature_2m": [70] * 12, "weather_code": [1] * 12,
                       "precipitation_probability": [10] * 12, "is_day": [1] * 12},
            "daily": {"time": ["2026-10-14"], "temperature_2m_max": [75],
                      "temperature_2m_min": [55], "weather_code": [1]},
        }
        parsed = parse_weather(json.dumps(raw))
        self.assertEqual(len(parsed["hourly"]["time"]), 12)

    def test_postal_code_resolves_location_and_timezone(self):
        raw = json.dumps({"results": [{"name": "Philadelphia", "admin1": "Pennsylvania",
            "latitude": 39.95238, "longitude": -75.16362, "timezone": "America/New_York",
            "postcodes": ["19102", "19103"]}]})
        location = parse_location(raw, "19103-1234")
        self.assertEqual(location["postal_code"], "19103")
        self.assertEqual(location["location"], "Philadelphia")
        self.assertEqual(location["timezone"], "America/New_York")
        self.assertIn("name=19103", location_url("19103"))
        with self.assertRaises(ValueError):
            normalize_postal_code("Philadelphia")

    def test_radar_keeps_four_recent_safe_frames(self):
        frames = [{"time": index, "path": f"/v2/radar/{index}"} for index in range(6)]
        parsed = parse_radar(json.dumps({"host": "https://tilecache.rainviewer.com",
                                        "radar": {"past": frames}}))
        self.assertEqual([frame["time"] for frame in parsed["frames"]], [2, 3, 4, 5])
        with self.assertRaises(ValueError):
            parse_radar(json.dumps({"host": "https://example.com", "radar": {"past": frames}}))

    def test_nearby_station_temperatures_use_one_batched_request(self):
        stations = parse_stations(json.dumps({"features": [{
            "geometry": {"coordinates": [-75.26, 40.14]},
            "properties": {"name": "Wings Field"}}, {
            "geometry": {"coordinates": [-75.60, 40.23]},
            "properties": {"name": "Pottstown"}}]}))
        url = nearby_temperature_url(stations)
        self.assertIn("latitude=40.14,40.23", url)
        result = add_station_temperatures(stations, json.dumps([
            {"current": {"temperature_2m": 69.4}}, {"current": {"temperature_2m": 67.1}}]))
        self.assertEqual([item["temperature"] for item in result], [69.4, 67.1])

    def test_surrounding_stations_are_distributed_by_direction(self):
        center = (40.0, -75.0)
        stations = [
            {"name": "near", "latitude": 40.05, "longitude": -75.0},
            {"name": "north", "latitude": 41.0, "longitude": -75.0},
            {"name": "east", "latitude": 40.0, "longitude": -73.8},
            {"name": "south", "latitude": 39.0, "longitude": -75.0},
            {"name": "west", "latitude": 40.0, "longitude": -76.2},
        ]
        selected = select_surrounding_stations(stations, *center)
        self.assertEqual({item["name"] for item in selected}, {"north", "east", "south", "west"})


if __name__ == "__main__":
    unittest.main()
