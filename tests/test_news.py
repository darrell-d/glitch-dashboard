import unittest

from news import select_stories
from server import parse_news


def story(title, description="", categories=(), url=None):
    return {"title": title, "description": description, "categories": categories,
            "url": url or "https://www.nytimes.com/" + title.replace(" ", "-")}


class StorySelectionTests(unittest.TestCase):
    def test_report_and_explainer_share_one_slot(self):
        report = story("Pope Leo Has Lung Cancer, Vatican Says")
        explainer = story("What to Know About Pope Leo’s Lung Cancer Diagnosis")
        unrelated = story("Astronomers Discover a Distant Planet")
        self.assertEqual(select_stories([report, explainer, unrelated]), [report, unrelated])

    def test_subject_tags_connect_differently_worded_companion(self):
        tags = [("nyt_per", "Guilfoyle, Kimberly"), ("des", "Appointments and Executive Changes"),
                ("des", "Diplomatic Service, Embassies and Consulates")]
        profile = story("The Steep Rise and Spectacular Fall of Kimberly Guilfoyle", categories=tags)
        report = story("Kimberly Guilfoyle Resigns as Ambassador to Greece", categories=tags)
        self.assertEqual(select_stories([profile, report]), [profile])
        self.assertEqual(select_stories([report, profile]), [report])

    def test_shared_politician_and_generic_categories_do_not_merge_unrelated_news(self):
        tags = [("nyt_per", "Trump, Donald J"), ("des", "United States Politics and Government")]
        tariffs = story("Trump Announces New Tariffs on Imported Cars", categories=tags)
        campaign = story("Trump Travels to Ohio for Campaign Rally", categories=tags)
        self.assertEqual(select_stories([tariffs, campaign]), [tariffs, campaign])

    def test_shared_full_name_without_subject_evidence_is_not_enough(self):
        tags = [("nyt_per", "Smith, Jane")]
        film = story("Jane Smith Stars in Space Adventure", categories=tags)
        charity = story("Jane Smith Opens School for Refugees", categories=tags)
        self.assertEqual(select_stories([film, charity]), [film, charity])

    def test_repeated_url_with_tracking_parameters_is_one_article(self):
        first = story("First headline", url="https://www.nytimes.com/article?source=homepage")
        second = story("Rewritten headline", url="https://www.nytimes.com/article?source=rss#comments")
        self.assertEqual(select_stories([first, second]), [first])

    def test_empty_and_single_story_are_valid(self):
        self.assertEqual(select_stories([]), [])
        only = story("Only story")
        self.assertEqual(select_stories([only]), [only])

    def test_rss_categories_are_used_before_metadata_is_removed(self):
        raw = b'''<rss><channel>
        <item><title>The Rise and Fall of Kimberly Guilfoyle</title><link>https://www.nytimes.com/profile</link>
        <category domain="http://www.nytimes.com/namespaces/keywords/nyt_per">Guilfoyle, Kimberly</category>
        <category domain="http://www.nytimes.com/namespaces/keywords/des">Diplomatic Service</category>
        <category domain="http://www.nytimes.com/namespaces/keywords/des">Appointments</category></item>
        <item><title>Kimberly Guilfoyle Resigns as Ambassador</title><link>https://www.nytimes.com/report</link>
        <category domain="http://www.nytimes.com/namespaces/keywords/nyt_per">Guilfoyle, Kimberly</category>
        <category domain="http://www.nytimes.com/namespaces/keywords/des">Diplomatic Service</category>
        <category domain="http://www.nytimes.com/namespaces/keywords/des">Appointments</category></item>
        </channel></rss>'''
        result = parse_news(raw)
        self.assertEqual(len(result["items"]), 1)
        self.assertEqual(result["items"][0]["url"], "https://www.nytimes.com/profile")
        self.assertNotIn("categories", result["items"][0])


if __name__ == "__main__":
    unittest.main()
