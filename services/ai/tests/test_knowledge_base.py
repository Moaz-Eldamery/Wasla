import json
from pathlib import Path

import pytest

from app.admin_chatbot.knowledge_base import (
    CSV_PATH,
    JSON_PATH,
    load_csv,
    load_json,
    load_knowledge_base,
)


def test_bundled_knowledge_base_exports_match() -> None:
    entries = load_knowledge_base()

    assert len(entries) == 36
    assert entries == load_csv()
    assert entries == load_json()
    assert entries[0].title_ar
    assert entries[0].content_ar


def test_json_rejects_incorrect_declared_entry_count(tmp_path: Path) -> None:
    document = json.loads(JSON_PATH.read_text(encoding="utf-8"))
    document["entry_count"] += 1
    path = tmp_path / "knowledge_base.json"
    path.write_text(json.dumps(document), encoding="utf-8")

    with pytest.raises(ValueError, match="entry_count"):
        load_json(path)


def test_loader_rejects_mismatched_exports(tmp_path: Path) -> None:
    document = json.loads(JSON_PATH.read_text(encoding="utf-8"))
    document["entries"][0]["content_en"] = "Different content"
    path = tmp_path / "knowledge_base.json"
    path.write_text(json.dumps(document), encoding="utf-8")

    with pytest.raises(ValueError, match="do not match"):
        load_knowledge_base(CSV_PATH, path)
