"""SUS report script: standard scoring and grades."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

import sus_report  # noqa: E402


def test_scores_and_grades(tmp_path):
    path = tmp_path / "s.csv"
    head = ",".join(f"q{i}" for i in range(1, 11)) + ",recommendations\n"
    path.write_text(head + "5,1,5,1,5,1,5,1,5,1,5\n3,3,3,3,3,3,3,3,3,3,3\n", encoding="utf-8")
    out = sus_report.report(str(path))
    assert out["participants"] == 2 and out["mean_sus"] == 75.0 and out["grade"] == "Good"
    assert out["mean_recommendations"] == 4.0
    assert sus_report.sus({f"q{i}": 3 for i in range(1, 11)}) == 50.0
