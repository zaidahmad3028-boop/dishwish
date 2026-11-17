"""Offline evaluation: metrics are well-formed, the engine beats random, and the allergy filter never leaks."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "api"))

from engine.catalog_db import bundled_data  # noqa: E402
from engine.evaluation import _queries, evaluate, safety_check  # noqa: E402
from engine.suitability import SuitabilityEngine  # noqa: E402


def make_engine():
    data = bundled_data()
    return SuitabilityEngine(data.ingredients, data.recipes, data.edges)


def test_queries_hide_part_of_each_recipe():
    engine = make_engine()
    queries = _queries(engine, 11)
    assert queries, "every bundled recipe set should produce test queries"
    for slug, query in queries:
        recipe = next(r for r in engine.recipes if r.slug == slug)
        assert 2 <= len(query) < len(engine.core_families(recipe)) + 1
        assert len(set(query)) == len(query)


def test_queries_are_repeatable():
    engine = make_engine()
    assert _queries(engine, 23) == _queries(engine, 23)


def test_engine_beats_random_and_metrics_are_ordered():
    report = evaluate(make_engine(), seeds=(11,))
    rows = {r["method"]: r for r in report["methods"]}
    assert set(rows) == {"Random order", "Coverage only", "Graph only", "Without TF-IDF", "Full engine"}
    for row in rows.values():
        assert 0 <= row["hit@1"] <= row["hit@3"] <= row["hit@5"] <= 1
        assert 0 <= row["mrr"] <= 1
    assert rows["Full engine"]["hit@5"] > rows["Random order"]["hit@5"]
    assert rows["Full engine"]["mrr"] > rows["Random order"]["mrr"]


def test_safety_check_finds_no_allergen_leaks():
    result = safety_check(make_engine(), profiles=15)
    assert result["violations"] == 0
    assert result["recipes_checked"] >= 0


def test_evaluation_does_not_change_live_weights():
    engine = make_engine()
    before = dict(engine.settings["weights"])
    evaluate(engine, seeds=(11,))
    assert engine.settings["weights"] == before
    assert engine.settings["min_score"] > 0


def test_evaluation_endpoint_is_admin_only(monkeypatch):
    from fastapi.testclient import TestClient
    import api.index as index
    from core import auth
    from test_auth import SECRET, URL, hs_token

    data = bundled_data()
    engine = SuitabilityEngine(data.ingredients, data.recipes, data.edges)
    monkeypatch.setenv("SUPABASE_JWT_SECRET", SECRET)
    monkeypatch.setenv("SUPABASE_URL", URL)
    monkeypatch.setattr(index, "get_engine", lambda: (engine, data))
    monkeypatch.setattr(index, "evaluate", lambda e, seeds: evaluate(e, seeds=(11,)))
    client = TestClient(index.app)
    assert client.get("/api/admin/evaluation").status_code == 401
    monkeypatch.setattr(auth, "is_admin_token", lambda token: False)
    assert client.get("/api/admin/evaluation", headers={"Authorization": f"Bearer {hs_token()}"}).status_code == 403
    monkeypatch.setattr(auth, "is_admin_token", lambda token: True)
    body = client.get("/api/admin/evaluation", headers={"Authorization": f"Bearer {hs_token()}"}).json()
    assert body["methods"][-1]["method"] == "Full engine" and body["safety"]["violations"] == 0
    assert body["data_source"] == "bundled" and "coverage" in body["weights"]
    summary = client.get("/api/evaluation/summary").json()
    assert summary["hit5"] == body["methods"][-1]["hit@5"] and summary["allergen_violations"] == 0
