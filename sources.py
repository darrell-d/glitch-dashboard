"""Fixed publisher endpoints and adapters for short news previews."""

import json
import re
import urllib.parse
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor
from html.parser import HTMLParser

from news import plain_text, select_stories

SOURCES = [
    {"id": "nyt", "name": "The New York Times", "url": "https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml"},
    {"id": "cnn", "name": "CNN", "url": "https://lite.cnn.com/", "format": "cnn"},
    {"id": "kotaku", "name": "Kotaku", "url": "https://kotaku.com/rss"},
    {"id": "wsj", "name": "The Wall Street Journal", "selection": "World News", "url": "https://feeds.content.dowjones.io/public/rss/RSSWorldNews"},
    {"id": "atlantic", "name": "The Atlantic", "url": "https://www.theatlantic.com/feed/all/"},
    {"id": "politico", "name": "POLITICO", "url": "https://www.politico.com/rss/politicopicks.xml"},
    {"id": "wired", "name": "WIRED", "url": "https://www.wired.com/feed/rss"},
    {"id": "ars", "name": "Ars Technica", "url": "https://feeds.arstechnica.com/arstechnica/index"},
    {"id": "techcrunch", "name": "TechCrunch", "format": "wordpress", "url": "https://techcrunch.com/wp-json/wp/v2/posts?per_page=12&_embed=wp:featuredmedia&_fields=id,link,title,excerpt,date_gmt,_embedded,_links"},
    {"id": "newyorker", "name": "The New Yorker", "url": "https://www.newyorker.com/feed/everything"},
]
ATOM = "{http://www.w3.org/2005/Atom}"
MEDIA = "{http://search.yahoo.com/mrss/}"
DC = "{http://purl.org/dc/elements/1.1/}"


def https_url(value, base=""):
    if not value:
        return ""
    url = urllib.parse.urljoin(base, value or "")
    return url if urllib.parse.urlparse(url).scheme == "https" else ""


class PreviewHTML(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.meta, self.images, self.links = {}, [], []
        self.link = None

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "meta":
            self.meta[attrs.get("property") or attrs.get("name")] = attrs.get("content", "")
        elif tag == "img":
            self.images.append(attrs)
        elif tag == "a":
            self.link = {"url": attrs.get("href", ""), "parts": []}

    def handle_data(self, data):
        if self.link is not None:
            self.link["parts"].append(data)

    def handle_endtag(self, tag):
        if tag == "a" and self.link is not None:
            self.link["title"] = " ".join(" ".join(self.link.pop("parts")).split())
            self.links.append(self.link)
            self.link = None


def preview_html(value):
    parser = PreviewHTML()
    parser.feed(value.decode("utf-8", errors="replace") if isinstance(value, bytes) else value)
    return parser


def finish(items, source):
    if not items:
        raise ValueError("No headlines in publisher response")
    selected = select_stories(items)[:4]
    public = []
    for item in selected:
        public.append({
            "source_id": source["id"], "source": source["name"], "selection": source.get("selection", ""),
            "title": item["title"], "url": item["url"], "published": item.get("published"),
            "description": item.get("description", ""), "author": item.get("author", ""),
            "image_url": item.get("image_url", ""), "image_caption": item.get("image_caption", ""),
            "image_credit": item.get("image_credit", ""),
        })
    return {"source": source["name"], "items": public}


def parse_news(raw, source=None):
    source = source or SOURCES[0]
    root = ET.fromstring(raw)
    atom = root.tag == ATOM + "feed"
    items = []
    for entry in root.findall(ATOM + "entry" if atom else "./channel/item")[:80]:
        prefix = ATOM if atom else ""
        title = plain_text(entry.findtext(prefix + "title", ""))
        if atom:
            links = entry.findall(ATOM + "link")
            link = next((node.get("href") for node in links if node.get("rel", "alternate") == "alternate"), "")
        else:
            link = entry.findtext("link", "")
        link = https_url(link, source["url"])
        if not title or not link:
            continue
        summary = entry.findtext(prefix + ("summary" if atom else "description"), "")
        description = plain_text(summary)
        categories = [(node.get("domain", "").rstrip("/").rsplit("/", 1)[-1], (node.text or "").casefold())
                      for node in entry.findall("category")]
        media = [node for node in entry.iter() if node.tag in (MEDIA + "content", MEDIA + "thumbnail", "enclosure")
                 and node.get("medium", "image") == "image" and node.get("type", "image/").startswith("image/")]
        image_url = next((https_url(node.get("url"), link) for node in media
                          if https_url(node.get("url"), link) and not re.search(r"\.(mp4|webm)(?:\?|$)", node.get("url", ""), re.I)), "")
        image_caption = plain_text(entry.findtext(".//" + MEDIA + "description", ""))
        image_credit = plain_text(entry.findtext(".//" + MEDIA + "credit", ""))
        if not image_url:
            # Some feeds put their image in the HTML excerpt or content element.
            content = entry.findtext("{http://purl.org/rss/1.0/modules/content/}encoded", "") or summary
            images = preview_html(content).images
            image = next((image for image in images if https_url(image.get("src"), link)), {})
            image_url = https_url(image.get("src"), link) if image else ""
            image_caption = image_caption or plain_text(image.get("alt", ""))
        creators = [plain_text(node.text or "") for node in entry.findall(DC + "creator")]
        if atom:
            creators = [plain_text(node.findtext(ATOM + "name", "")) for node in entry.findall(ATOM + "author")]
        items.append({"title": title, "url": link, "description": description, "categories": categories,
                      "published": entry.findtext(prefix + ("published" if atom else "pubDate")),
                      "author": ", ".join(creators), "image_url": image_url,
                      "image_caption": image_caption, "image_credit": image_credit})
    return finish(items, source)


def parse_wordpress(raw, source):
    items = []
    for post in json.loads(raw):
        link = https_url(post.get("link"))
        title = plain_text(post.get("title", {}).get("rendered", ""))
        if not title or not link:
            continue
        media = post.get("_embedded", {}).get("wp:featuredmedia", [])
        image = next((image for image in media if image.get("source_url")), {})
        sizes = image.get("media_details", {}).get("sizes", {})
        # Prefer a publisher-provided large image to downloading multi-MB originals.
        photo = sizes.get("large", {}).get("source_url") or image.get("source_url", "")
        items.append({"title": title, "url": link, "description": plain_text(post.get("excerpt", {}).get("rendered", "")),
                      "published": post.get("date_gmt", "") + "Z" if post.get("date_gmt") else None,
                      "image_url": https_url(photo), "image_caption": plain_text(image.get("caption", {}).get("rendered", ""))})
    return finish(items, source)


def parse_cnn(raw, source, fetch_head):
    links = preview_html(raw).links
    items = []
    for link in links:
        url = urllib.parse.urljoin("https://www.cnn.com/", link["url"])
        parsed = urllib.parse.urlparse(url)
        if parsed.hostname == "www.cnn.com" and re.match(r"/\d{4}/\d{2}/\d{2}/", parsed.path) and link["title"]:
            items.append({"title": link["title"], "url": url})
    selected = finish(items, source)

    def enrich(item):
        try:
            metadata = preview_html(fetch_head(item["url"])).meta
            item["description"] = plain_text(metadata.get("og:description") or metadata.get("description", ""))
            item["image_url"] = https_url(metadata.get("og:image"))
            item["published"] = metadata.get("article:published_time") or metadata.get("pubdate")
            item["author"] = plain_text(metadata.get("author", ""))
        except Exception:
            # Current headlines remain useful if an article's metadata is unavailable.
            item["metadata_unavailable"] = True
        return item

    with ThreadPoolExecutor(max_workers=4) as pool:
        selected["items"] = list(pool.map(enrich, selected["items"]))
    return selected


def load_source(source, fetch, fetch_head):
    raw = fetch(source["url"])
    if source.get("format") == "wordpress":
        return parse_wordpress(raw, source)
    if source.get("format") == "cnn":
        return parse_cnn(raw, source, fetch_head)
    return parse_news(raw, source)
