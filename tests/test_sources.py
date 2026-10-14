import json
import unittest
from unittest.mock import Mock

from server import NewsFeed
from sources import SOURCES, parse_cnn, parse_news, parse_wordpress

SOURCE = {"id": "example", "name": "Example News", "url": "https://example.com/feed"}


class PublisherTests(unittest.TestCase):
    def test_all_requested_publishers_are_configured(self):
        self.assertEqual({source["id"] for source in SOURCES}, {
            "nyt", "cnn", "kotaku", "wsj", "atlantic", "politico", "wired", "ars", "techcrunch", "newyorker"})

    def test_only_four_distinct_feed_stories_are_selected(self):
        titles = ["Pope Leo Has Lung Cancer", "What to Know About Pope Leo Lung Cancer",
                  "Astronomers discover distant planet", "New railway opens tomorrow",
                  "Museum restores ancient statue", "Local team wins championship"]
        raw = "<rss><channel>" + "".join(
            f"<item><title>{title}</title><link>https://example.com/{i}</link></item>" for i, title in enumerate(titles)
        ) + "</channel></rss>"
        items = parse_news(raw, SOURCE)["items"]
        self.assertEqual(len(items), 4)
        self.assertEqual(items[0]["title"], titles[0])
        self.assertNotIn(titles[1], [item["title"] for item in items])
        self.assertTrue(all(item["source"] == "Example News" for item in items))

    def test_atom_summary_author_and_media(self):
        raw = '''<feed xmlns="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/">
          <entry><title>A &amp; B</title><link rel="self" href="https://example.com/api/1"/>
          <link rel="alternate" href="https://example.com/article"/><summary type="html">&lt;p&gt;Short briefing.&lt;/p&gt;</summary>
          <author><name>A Writer</name></author><published>2026-10-14T12:00:00Z</published>
          <media:content url="https://example.com/photo.jpg"/></entry></feed>'''
        item = parse_news(raw, SOURCE)["items"][0]
        self.assertEqual(item["url"], "https://example.com/article")
        self.assertEqual(item["description"], "Short briefing.")
        self.assertEqual(item["author"], "A Writer")
        self.assertEqual(item["image_url"], "https://example.com/photo.jpg")

    def test_media_thumbnail_nested_credit_and_multiple_authors(self):
        raw = '''<rss xmlns:media="http://search.yahoo.com/mrss/" xmlns:dc="http://purl.org/dc/elements/1.1/">
          <channel><item><title>A story</title><link>https://example.com/story</link>
          <media:content/><media:thumbnail url="https://example.com/photo.jpg"/>
          <media:group><media:credit>A Photographer</media:credit></media:group>
          <dc:creator>A Writer</dc:creator><dc:creator>B Writer</dc:creator></item></channel></rss>'''
        item = parse_news(raw, SOURCE)["items"][0]
        self.assertEqual(item["image_url"], "https://example.com/photo.jpg")
        self.assertEqual(item["image_credit"], "A Photographer")
        self.assertEqual(item["author"], "A Writer, B Writer")

    def test_video_and_audio_are_not_treated_as_photos(self):
        raw = '''<rss xmlns:media="http://search.yahoo.com/mrss/"><channel><item>
          <title>A story</title><link>https://example.com/story</link>
          <media:thumbnail url="https://example.com/clip.mp4"/>
          <enclosure type="audio/mpeg" url="https://example.com/audio.mp3"/>
          <description><![CDATA[<p>Brief.</p><img src="https://example.com/photo.jpg" alt="A scene">]]></description>
          </item></channel></rss>'''
        item = parse_news(raw, SOURCE)["items"][0]
        self.assertEqual(item["image_url"], "https://example.com/photo.jpg")
        self.assertEqual(item["image_caption"], "A scene")

    def test_wordpress_uses_excerpt_and_featured_image_without_full_article(self):
        raw = json.dumps([{"title": {"rendered": "A &amp; B"}, "link": "https://example.com/post",
                           "excerpt": {"rendered": "<p>A short description.</p>"}, "date_gmt": "2026-10-14T10:00:00",
                           "content": {"rendered": "Full body must not be returned"},
                           "_embedded": {"wp:featuredmedia": [{"source_url": "https://example.com/original.jpg",
                             "media_details": {"sizes": {"large": {"source_url": "https://example.com/large.jpg"}}}}]}}])
        item = parse_wordpress(raw, SOURCE)["items"][0]
        self.assertEqual(item["image_url"], "https://example.com/large.jpg")
        self.assertEqual(item["description"], "A short description.")
        self.assertNotIn("content", item)

    def test_cnn_uses_current_lite_links_and_only_cnn_metadata(self):
        raw = '<a href="https://attacker.example/2026/10/14/bad">Ignore me</a>' + ''.join(
            f'<a href="/2026/10/14/world/story-{i}">{title}</a>' for i, title in enumerate(
                ["Astronomers discover planet", "Railway opens tomorrow", "Museum restores statue", "Team wins championship", "Another story"]))
        fetch_head = Mock(return_value=b'<meta property="og:description" content="A short briefing."><meta property="og:image" content="https://media.cnn.com/image.jpg">')
        items = parse_cnn(raw, {"id": "cnn", "name": "CNN"}, fetch_head)["items"]
        self.assertEqual(len(items), 4)
        self.assertEqual(fetch_head.call_count, 4)
        self.assertTrue(all(call.args[0].startswith("https://www.cnn.com/") for call in fetch_head.call_args_list))
        self.assertEqual(items[0]["description"], "A short briefing.")

    def test_cnn_metadata_outage_still_returns_current_headline(self):
        items = parse_cnn(b'<a href="/2026/10/14/world/report">A current headline</a>',
                          {"id": "cnn", "name": "CNN"}, Mock(side_effect=OSError()))["items"]
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["image_url"], "")


class AggregationTests(unittest.TestCase):
    def test_partial_failure_does_not_remove_healthy_publishers_and_order_is_interleaved(self):
        sources = [{"id": "a", "name": "A"}, {"id": "bad", "name": "Bad"}, {"id": "b", "name": "B"}]
        feeds = {}
        for source in sources:
            items = [{"title": f'{source["id"]} story {i}'} for i in range(4)]
            feeds[source["id"]] = Mock()
            feeds[source["id"]].get.return_value = {
                "data": {"items": items} if source["id"] != "bad" else None,
                "updated_at": "2026-10-14T10:00:00+00:00" if source["id"] != "bad" else None,
                "stale": source["id"] != "a"}
        result = NewsFeed(feeds, sources).get()
        self.assertEqual(len(result["data"]["items"]), 8)
        self.assertEqual([item["title"] for item in result["data"]["items"][:4]], ["a story 0", "b story 0", "a story 1", "b story 1"])
        self.assertFalse(result["stale"])
        self.assertFalse(result["data"]["sources"][1]["available"])
        self.assertFalse(result["data"]["items"][0]["source_stale"])
        self.assertTrue(result["data"]["items"][1]["source_stale"])


if __name__ == "__main__":
    unittest.main()
