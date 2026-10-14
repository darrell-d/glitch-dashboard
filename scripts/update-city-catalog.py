#!/usr/bin/env python3
"""Build the dashboard's compact US major-city catalog from GeoNames."""

import argparse
import io
import json
import urllib.request
import zipfile
from pathlib import Path

DEFAULT_SOURCE = "https://download.geonames.org/export/dump/cities15000.zip"
ROOT = Path(__file__).resolve().parents[1]
DISPLAY_NAMES = {"New York City": "New York"}


def read_source(source):
    if source.startswith(("https://", "http://")):
        request = urllib.request.Request(source, headers={"User-Agent": "glitch-dashboard-city-catalog/1.0"})
        with urllib.request.urlopen(request, timeout=30) as response:
            return response.read()
    return Path(source).read_bytes()


def build_catalog(data):
    cities = []
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        filename = next(name for name in archive.namelist() if name.endswith(".txt"))
        for raw_line in archive.read(filename).decode("utf-8").splitlines():
            fields = raw_line.split("\t")
            if len(fields) < 19 or fields[8] != "US" or fields[6] != "P":
                continue
            population = int(fields[14] or 0)
            capital = fields[7] in {"PPLA", "PPLC"}
            if population < 40_000 and not capital:
                continue
            cities.append({
                "name": DISPLAY_NAMES.get(fields[1], fields[1]), "latitude": round(float(fields[4]), 5),
                "longitude": round(float(fields[5]), 5), "population": population,
                "capital": capital,
            })
    return sorted(cities, key=lambda city: (-city["population"], city["name"]))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", default=DEFAULT_SOURCE, help="GeoNames cities ZIP URL or local path")
    parser.add_argument("--output", type=Path, default=ROOT / "data" / "us-major-cities.json")
    args = parser.parse_args()
    payload = {
        "source": "GeoNames cities15000",
        "source_url": DEFAULT_SOURCE,
        "license": "CC BY 4.0",
        "license_url": "https://creativecommons.org/licenses/by/4.0/",
        "cities": build_catalog(read_source(args.source)),
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n")
    print(f"wrote {len(payload['cities'])} cities to {args.output}")


if __name__ == "__main__":
    main()
