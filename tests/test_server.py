import json
import io
import unittest
from datetime import datetime, timezone
from unittest.mock import Mock, patch

from server import (Feed, Handler, SettingsStore, SCREEN_DURATIONS, load_pictures, parse_guardian_cartoons, parse_nasa_iotd, parse_rotation, parse_wikimedia_motd, parse_wikimedia_potd, pick_nasa_archive, add_temperatures, fetch, fetch_head, load_major_cities,
                    location_url, nearby_temperature_url, normalize_postal_code,
                    parse_alerts, parse_air_quality, parse_location, parse_news, parse_quote, parse_radar, parse_weather,
                    select_major_cities, weather_url)


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
        self.assertIn("sunrise%2Csunset", url)
        self.assertIn("uv_index", url)

    def test_alerts_keep_actual_messages_ordered_by_severity(self):
        def alert(event, severity, **extra):
            return {"properties": {"event": event, "severity": severity, "status": "Actual",
                                   "messageType": "Alert", "ends": "2026-10-15T20:00:00-04:00", **extra}}
        raw = json.dumps({"features": [
            alert("Air Quality Alert", "Moderate"), alert("Tornado Warning", "Extreme"),
            alert("Tornado Warning", "Extreme"), alert("Heat Advisory", "Minor", status="Test"),
            alert("Wind Advisory", "Minor", messageType="Cancel"),
        ]})
        alerts = parse_alerts(raw)
        self.assertEqual([item["event"] for item in alerts], ["Tornado Warning", "Air Quality Alert"])
        self.assertEqual(alerts[0]["ends"], "2026-10-15T20:00:00-04:00")

    def test_air_quality_requires_numeric_index(self):
        self.assertEqual(parse_air_quality(json.dumps({"current": {"us_aqi": 112.4, "pm2_5": 41}}))["us_aqi"], 112)
        with self.assertRaises(ValueError):
            parse_air_quality(json.dumps({"current": {"us_aqi": None}}))

    def test_weather_includes_complete_hourly_forecast(self):
        raw = {
            "current": {"temperature_2m": 70, "apparent_temperature": 70,
                        "relative_humidity_2m": 55, "weather_code": 1,
                        "wind_speed_10m": 8, "wind_direction_10m": 225, "is_day": 1},
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

    def test_nearby_city_temperatures_use_one_batched_request(self):
        cities = [
            {"name": "Harrisburg", "latitude": 40.2732, "longitude": -76.8867},
            {"name": "Baltimore", "latitude": 39.2904, "longitude": -76.6122},
        ]
        url = nearby_temperature_url(cities)
        self.assertIn("latitude=40.2732,39.2904", url)
        result = add_temperatures(cities, json.dumps([
            {"current": {"temperature_2m": 69.4}}, {"current": {"temperature_2m": 67.1}}]))
        self.assertEqual([item["temperature"] for item in result], [69.4, 67.1])

    def test_radar_prefers_major_cities_and_state_capitals(self):
        selected = select_major_cities(load_major_cities(), 39.95238, -75.16362)
        names = {item["name"] for item in selected}
        self.assertIn("Harrisburg", names)
        self.assertNotIn("Lancaster", names)
        self.assertTrue(all("Airport" not in name for name in names))



class SettingsTests(unittest.TestCase):
    def setUp(self):
        import tempfile
        self.directory = tempfile.TemporaryDirectory()
        self.store = SettingsStore(f"{self.directory.name}/settings.json")

    def tearDown(self):
        self.directory.cleanup()

    def test_defaults_until_saved_then_persisted(self):
        self.assertEqual(self.store.get()["screen_durations"]["markets"], 60)
        self.assertEqual(self.store.get()["screen_durations"]["weather"], 120)
        self.assertEqual(self.store.get()["screen_durations"]["radar"], 120)
        self.assertEqual(self.store.get()["rotation"]["weights"]["article"], 50)
        self.assertEqual(self.store.get()["rotation"]["max_weather_gap"], 6)
        self.store.save({"screen_durations": {"markets": 90}})
        reloaded = SettingsStore(self.store.path).get()["screen_durations"]
        self.assertEqual(reloaded["markets"], 90)
        self.assertEqual(reloaded["gallery"], SCREEN_DURATIONS["gallery"])

    def test_rotation_settings_validate_weights_and_guards(self):
        rotation = parse_rotation({"weights": {"article": 60, "gallery": 0},
                                   "max_news_gap": 4, "max_weather_gap": 8})
        self.assertEqual((rotation["weights"]["article"], rotation["weights"]["gallery"]), (60, 0))
        self.assertEqual((rotation["max_news_gap"], rotation["max_weather_gap"]), (4, 8))
        for bad in ({"weights": {"unknown": 1}}, {"weights": {"article": -1}},
                    {"weights": {key: 0 for key in rotation["weights"]}}, {"max_news_gap": 0}):
            with self.assertRaises(ValueError):
                parse_rotation(bad)

    def test_invalid_times_are_rejected(self):
        for bad in ({"markets": 2}, {"markets": 4000}, {"markets": 30.5}, {"markets": "60"}, {"unknown": 30}, []):
            with self.assertRaises(ValueError):
                self.store.save({"screen_durations": bad})
        self.assertFalse(self.store.path.exists())

    def test_post_requires_json_and_saves(self):
        def post(body, content_type="application/json"):
            handler = Handler.__new__(Handler)
            handler.path, handler.settings = "/api/settings", self.store
            handler.headers = {"Content-Length": str(len(body)), "Content-Type": content_type}
            handler.headers = type("Headers", (), {"get": handler.headers.get,
                                                   "get_content_type": lambda _: content_type})()
            handler.rfile = io.BytesIO(body)
            sent = []
            handler.send_json = lambda value, status=200: sent.append((status, value))
            handler.do_POST()
            return sent[0]
        body = json.dumps({"screen_durations": {"weather": 45}}).encode()
        self.assertEqual(post(body, "text/plain")[0], 400)
        self.assertEqual(post(b"{nope")[0], 400)
        status, value = post(body)
        self.assertEqual((status, value["screen_durations"]["weather"]), (200, 45))
        self.assertEqual(self.store.get()["screen_durations"]["weather"], 45)
        self.assertEqual(value["rotation"]["weights"]["article"], 50)


class NasaPictureTests(unittest.TestCase):
    def test_image_of_the_day_uses_resized_newest_images(self):
        items = "".join(f"""<item><title>Photo {i} &amp; more</title><link>https://www.nasa.gov/image-detail/{i}/</link>
            <description>&lt;p&gt;What it shows {i}.&lt;/p&gt;</description><pubDate>Wed, 14 Oct 2026 15:19 GMT</pubDate>
            <enclosure url="https://www.nasa.gov/wp-content/uploads/{i}orig.jpg" length="15430381" type="image/jpeg"/></item>""" for i in range(7))
        photos = parse_nasa_iotd(f"<rss><channel>{items}</channel></rss>")
        self.assertEqual(len(photos), 5)
        self.assertEqual(photos[0]["url"], "https://www.nasa.gov/wp-content/uploads/0orig.jpg?w=2048")
        self.assertEqual((photos[0]["title"], photos[0]["description"]), ("Photo 0 & more", "What it shows 0."))

    def archive_fetcher(self, items):
        def fetcher(url):
            if "/asset/" in url:
                nasa_id = url.rsplit("/", 1)[-1]
                return json.dumps({"collection": {"items": [{"href": f"http://images-assets.nasa.gov/image/{nasa_id}/{nasa_id}~orig.tif"},
                                                            {"href": f"http://images-assets.nasa.gov/image/{nasa_id}/{nasa_id}~large.jpg"}]}})
            return json.dumps({"collection": {"metadata": {"total_hits": 50}, "items": [{"data": [item]} for item in items]}})
        return fetcher

    def test_archive_picks_are_striking_stable_per_day_and_https(self):
        from datetime import date
        good = [{"nasa_id": f"PIA{i}", "title": f"Spiral galaxy {i}",
                 "description": "A sweeping view of stars and dust lanes across the disk. The image is online at http://hubblesite.org/x.",
                 "center": "JPL", "date_created": "2017-12-08T00:00:00Z"} for i in range(10)]
        dull = [{"nasa_id": "KSC-1", "title": "KSC-07PD-0342", "description": "x" * 200, "center": "KSC"},
                {"nasa_id": "T1", "title": "Payload encapsulation", "description": "x" * 200, "center": "GSFC"},
                {"nasa_id": "S1", "title": "Short", "description": "Too short", "center": "JPL"}]
        fetcher = self.archive_fetcher(good + dull)
        first = pick_nasa_archive(fetcher, date(2026, 10, 14))
        self.assertEqual(len(first), 5)
        self.assertTrue(all(photo["title"].startswith("Spiral galaxy") for photo in first))
        self.assertTrue(all(photo["url"].startswith("https://") and photo["url"].endswith("~large.jpg") for photo in first))
        self.assertEqual(first[0]["kicker"], "From the NASA archive · 2017")
        self.assertEqual(first[0]["description"], "A sweeping view of stars and dust lanes across the disk.")
        self.assertEqual(first, pick_nasa_archive(fetcher, date(2026, 10, 14)))

    def test_either_half_can_fail(self):
        def broken_archive(url):
            if url.startswith("https://images-api"):
                raise OSError("offline")
            return ('<rss><channel><item><title>One</title><description>d</description>'
                    '<enclosure url="https://www.nasa.gov/a.jpg" type="image/jpeg"/></item></channel></rss>')
        self.assertEqual(len(load_pictures(broken_archive)["photos"]), 1)
        with self.assertRaises(ValueError):
            load_pictures(Mock(side_effect=OSError("offline")))


class PoliticalCartoonTests(unittest.TestCase):
    NOW = datetime(2026, 10, 15, tzinfo=timezone.utc)

    def feed(self, items):
        return f'<rss xmlns:media="http://search.yahoo.com/mrss/" xmlns:dc="http://purl.org/dc/elements/1.1/"><channel>{items}</channel></rss>'

    def item(self, title="A current cartoon | Jane Artist", date="Wed, 14 Oct 2026 05:00:00 GMT",
             categories=("US news",)):
        tags = "".join(f"<category>{category}</category>" for category in categories)
        return f'''<item><title>{title}</title><link>https://www.theguardian.com/commentisfree/picture/current</link>
          <description>&lt;p&gt;A sharp take on this week's news.&lt;/p&gt;</description><pubDate>{date}</pubDate>{tags}
          <media:content width="700" url="https://i.guim.co.uk/img/media/id/master/cartoon.jpg?width=700"/>
          <dc:creator>Jane Artist</dc:creator></item>'''

    def test_current_political_cartoon_uses_uncropped_1920px_page_image(self):
        page = 'https://i.guim.co.uk/img/media/id/master/cartoon.jpg?width=1920&amp;quality=85&amp;auto=format&amp;fit=max&amp;s=signed'
        cartoon = parse_guardian_cartoons(self.feed(self.item()), Mock(return_value=page), self.NOW)[0]
        self.assertIn("width=1920", cartoon["url"])
        self.assertIn("fit=max", cartoon["url"])
        self.assertEqual(cartoon["title"], "A current cartoon")
        self.assertEqual(cartoon["credit"], "Jane Artist · The Guardian")
        self.assertEqual(cartoon["kicker"], "Political cartoon · This week")

    def test_older_and_nonpolitical_cartoons_are_skipped(self):
        items = self.item(title="Old cartoon", date="Wed, 07 Oct 2026 05:00:00 GMT") + self.item(
            title="Football cartoon", categories=("Football", "Sport")) + self.item(title="Current politics cartoon")
        cartoons = parse_guardian_cartoons(self.feed(items), Mock(side_effect=OSError("offline")), self.NOW)
        self.assertEqual([item["title"] for item in cartoons], ["Current politics cartoon"])
        self.assertIn("width=700", cartoons[0]["url"])


class WikimediaMediaTests(unittest.TestCase):
    def atom(self, summary):
        import html
        return f'''<feed xmlns="http://www.w3.org/2005/Atom"><entry>
          <updated>2026-10-14T00:00:00Z</updated><summary type="html">{html.escape(summary)}</summary>
          </entry></feed>'''

    def test_picture_of_the_day_uses_large_thumbnail_and_description(self):
        summary = '''<div><a class="mw-file-description" href="/wiki/File:Bird.jpg"><img
          src="https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ab/Bird.jpg/330px-Bird.jpg"></a>
          <div class="description en">A bird over the sea.</div></div>'''
        photo = parse_wikimedia_potd(self.atom(summary))[0]
        self.assertIn("/1920px-Bird.jpg", photo["url"])
        self.assertTrue(photo["fallback_url"].startswith("https://thumb.wikimedia.org/"))
        self.assertEqual(photo["description"], "A bird over the sea.")
        self.assertEqual(photo["credit"], "Wikimedia Commons contributors")

    def test_featured_feeds_choose_newest_entries_from_ascending_feed(self):
        import html
        def entry(day, name):
            summary = f'''<div><img src="https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ab/{name}.jpg/330px-{name}.jpg">
              <div class="description en">{name}</div></div>'''
            return f'<entry><updated>2026-10-{day}T00:00:00Z</updated><summary>{html.escape(summary)}</summary></entry>'
        raw = f'<feed xmlns="http://www.w3.org/2005/Atom">{entry("06", "Old")}{entry("15", "New")}</feed>'
        photo = parse_wikimedia_potd(raw, limit=1)[0]
        self.assertEqual((photo["description"], photo["published"]), ("New", "2026-10-15T00:00:00Z"))

    def test_media_of_the_day_skips_formats_chrome_cannot_play(self):
        summary = '''<div><video poster="https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ab/Fire.ogv/330px-Fire.ogv.jpg"
          data-mwtitle="Fire.ogv"><source
          src="https://upload.wikimedia.org/wikipedia/commons/transcoded/a/ab/Fire.ogv/Fire.ogv.480p.vp9.webm"
          type='video/webm; codecs="vp9, opus"' data-width="854"><source
          src="https://upload.wikimedia.org/wikipedia/commons/a/ab/Fire.ogv"
          type='video/ogg; codecs="theora, vorbis"' data-width="1280"><source
          src="https://upload.wikimedia.org/wikipedia/commons/transcoded/a/ab/Fire.ogv/Fire.ogv.360p.mpeg4.mov"
          type='video/quicktime; codecs="mp4v"' data-width="640"></video><div class="description en">Fire roads.</div></div>'''
        video = parse_wikimedia_motd(self.atom(summary))[0]
        self.assertTrue(video["url"].endswith(".480p.vp9.webm"))
        self.assertEqual(video["type"], "video/webm")

    def test_media_of_the_day_chooses_1080p_video(self):
        summary = '''<div><video poster="https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ab/Film.webm/330px-Film.webm.jpg"
          data-durationhint="42" data-mwtitle="Film.webm"><source
          src="https://upload.wikimedia.org/wikipedia/commons/transcoded/a/ab/Film.webm/Film.webm.480p.vp9.webm"
          type="video/webm" data-width="854"><source
          src="https://upload.wikimedia.org/wikipedia/commons/transcoded/a/ab/Film.webm/Film.webm.1080p.vp9.webm"
          type="video/webm" data-width="1920"></video><div class="description en">A short film.</div></div>'''
        video = parse_wikimedia_motd(self.atom(summary))[0]
        self.assertIn("1080p", video["url"])
        self.assertIn("/1920px-Film.webm.jpg", video["poster"])
        self.assertEqual((video["title"], video["duration"]), ("A short film.", 42.0))

if __name__ == "__main__":
    unittest.main()
