import json
import unittest
from unittest.mock import Mock, patch

from server import Feed, parse_news, parse_quote, parse_weather, weather_url


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
    def test_rss_entities_and_unsafe_links(self):
        result = parse_news(b'''<rss><channel>
          <item><title>A &amp; B</title><link>https://www.nytimes.com/a</link></item>
          <item><title>Unsafe</title><link>javascript:alert(1)</link></item>
        </channel></rss>''')
        self.assertEqual(result["items"], [{"title": "A & B", "url": "https://www.nytimes.com/a", "published": None}])

    def test_empty_feed_rejected(self):
        with self.assertRaises(ValueError):
            parse_news(b"<rss><channel/></rss>")

    def test_quote_uses_existing_endpoint_schema(self):
        result = parse_quote(b'{"quote":" A thought. ","source":"An author","body":"ignored"}')
        self.assertEqual(result, {"text": "A thought.", "author": "An author"})
        with self.assertRaises(ValueError):
            parse_quote(b'{"error":"No quote available"}')

    def test_weather_rejects_null_current_data(self):
        raw = {"current": {"temperature_2m": None}, "daily": {}}
        with self.assertRaises(ValueError):
            parse_weather(json.dumps(raw))

    def test_weather_requests_fahrenheit(self):
        url = weather_url(39.95, -75.16, "America/New_York")
        self.assertIn("temperature_unit=fahrenheit", url)
        self.assertIn("forecast_days=5", url)


if __name__ == "__main__":
    unittest.main()
