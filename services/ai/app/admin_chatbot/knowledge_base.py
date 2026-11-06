"""Load and validate the bundled admin chatbot knowledge base."""

import csv
import json
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from typing import Any

DATA_DIRECTORY = Path(__file__).resolve().parents[2] / "data" / "knowledge_base"
CSV_PATH = DATA_DIRECTORY / "wasla_kan21_sample_knowledge_base.csv"
JSON_PATH = DATA_DIRECTORY / "wasla_kan21_sample_knowledge_base.json"
FIELDS = (
    "id",
    "slug",
    "category",
    "title_en",
    "title_ar",
    "content_en",
    "content_ar",
    "data_type",
)


@dataclass(frozen=True)
class KnowledgeBaseEntry:
    id: str
    slug: str
    category: str
    title_en: str
    title_ar: str
    content_en: str
    content_ar: str
    data_type: str


def load_csv(path: Path = CSV_PATH) -> list[KnowledgeBaseEntry]:
    """Read entries from a UTF-8 CSV file and validate their fields."""
    with path.open(encoding="utf-8-sig", newline="") as file:
        reader = csv.DictReader(file)
        if reader.fieldnames != list(FIELDS):
            raise ValueError(f"CSV columns must be exactly: {', '.join(FIELDS)}")
        entries = [
            _entry_from_mapping(row, f"CSV row {index}") for index, row in enumerate(reader, 2)
        ]
    validate_entries(entries)
    return entries


def load_json(path: Path = JSON_PATH) -> list[KnowledgeBaseEntry]:
    """Read entries from the UTF-8 JSON export and validate its metadata."""
    with path.open(encoding="utf-8") as file:
        document = json.load(file)

    if not isinstance(document, dict) or not isinstance(document.get("entries"), list):
        raise ValueError("JSON knowledge base must contain an entries array")
    entries = [
        _entry_from_mapping(row, f"JSON entry {index}")
        for index, row in enumerate(document["entries"], 1)
    ]
    validate_entries(entries)

    if document.get("entry_count") != len(entries):
        raise ValueError("JSON entry_count does not match the entries array")
    if document.get("languages") != ["en", "ar"]:
        raise ValueError("JSON languages must declare English and Arabic")
    expected_categories = dict(sorted(Counter(entry.category for entry in entries).items()))
    if document.get("categories") != expected_categories:
        raise ValueError("JSON categories do not match the entries")
    return entries


def load_knowledge_base(
    csv_path: Path = CSV_PATH, json_path: Path = JSON_PATH
) -> list[KnowledgeBaseEntry]:
    """Load both exports, ensure they agree, and return the CSV entries."""
    csv_entries = load_csv(csv_path)
    json_entries = load_json(json_path)
    if csv_entries != json_entries:
        raise ValueError("CSV and JSON knowledge base entries do not match")
    return csv_entries


def validate_entries(entries: list[KnowledgeBaseEntry]) -> None:
    """Reject empty bilingual fields and duplicate identifiers or slugs."""
    if not entries:
        raise ValueError("Knowledge base must contain at least one entry")

    ids: set[str] = set()
    slugs: set[str] = set()
    for index, entry in enumerate(entries, 1):
        for field in FIELDS:
            if not getattr(entry, field).strip():
                raise ValueError(f"Entry {index} has an empty {field}")
        if entry.id in ids:
            raise ValueError(f"Duplicate knowledge base id: {entry.id}")
        if entry.slug in slugs:
            raise ValueError(f"Duplicate knowledge base slug: {entry.slug}")
        ids.add(entry.id)
        slugs.add(entry.slug)


def _entry_from_mapping(row: Any, label: str) -> KnowledgeBaseEntry:
    if not isinstance(row, dict):
        raise ValueError(f"{label} must be an object")
    missing = [field for field in FIELDS if field not in row or not isinstance(row[field], str)]
    if missing:
        raise ValueError(f"{label} must contain string fields: {', '.join(missing)}")
    return KnowledgeBaseEntry(**{field: row[field] for field in FIELDS})
