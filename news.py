"""Select one representative per likely story group, preserving feed priority.

This is a conservative lexical heuristic, not NYT's actual homepage grouping.
It needs only titles, descriptions, and optional RSS keyword metadata.
"""

import html
import math
import re
from collections import Counter
from html.parser import HTMLParser

STOP_WORDS = set("""
a an and are as at be been being but by can could did do does for from had has
have he her here hers him his how i if in into is it its just me more most my no
not of on or our out over says said she so some than that the their them there
these they this those through to too under up us was we were what when where
which while who why will with would you your about after before new now then
""".split())


class PlainText(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []

    def handle_data(self, data):
        self.parts.append(data)


def plain_text(value):
    parser = PlainText()
    parser.feed(value or "")
    return " ".join(" ".join(parser.parts).split())


def words(text):
    text = html.unescape(re.sub(r"<[^>]*>", " ", text or "")).casefold()
    return {word for word in re.findall(r"[^\W\d_]+", text) if len(word) > 2 and word not in STOP_WORDS}


def normalized_vectors(items):
    features = []
    for item in items:
        values = Counter({word: 3 for word in words(item["title"])})
        values.update(words(item.get("description", "")))
        features.append(values)
    frequency = Counter(word for values in features for word in values)
    vectors = []
    for values in features:
        weighted = {word: count * (1 + math.log((len(items) + 1) / (frequency[word] + 1)))
                    for word, count in values.items()}
        norm = math.sqrt(sum(value * value for value in weighted.values())) or 1
        vectors.append({word: value / norm for word, value in weighted.items()})
    return vectors


def select_stories(items):
    """Keep the first feed entry in each inferred group; never pad with repeats."""
    vectors = normalized_vectors(items)
    titles = [words(item["title"]) for item in items]
    tags = [set(item.get("categories", ())) for item in items]
    tag_frequency = Counter(tag for group in tags for tag in group)
    selected = []
    urls = set()
    for index, item in enumerate(items):
        # Tracking query strings and fragments do not make a new article.
        url = item["url"].split("?", 1)[0].split("#", 1)[0]
        if url in urls:
            continue
        urls.add(url)
        related = False
        for previous in selected:
            shared_title = titles[index] & titles[previous]
            overlap = len(shared_title) / max(1, len(titles[index] | titles[previous]))
            cosine = sum(value * vectors[previous].get(word, 0) for word, value in vectors[index].items())
            # Require title evidence so shared background descriptions do not
            # collapse unrelated articles about the same politician or country.
            if (len(shared_title) >= 3 and overlap >= 0.45) or (len(shared_title) >= 2 and cosine >= 0.46):
                related = True
                break
            shared_tags = tags[index] & tags[previous]
            specific_topics = [tag for tag in shared_tags if tag[0] == "des" and tag_frequency[tag] <= 3]
            # A shared name alone is insufficient. Require a person explicitly
            # named in both titles and two relatively uncommon subject tags.
            matching_people = [tag for tag in shared_tags if tag[0] == "nyt_per"
                               and len(words(tag[1]) & shared_title) >= 2]
            if matching_people and len(specific_topics) >= 2:
                related = True
                break
        if not related:
            selected.append(index)
    return [items[index] for index in selected]
