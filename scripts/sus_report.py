"""SUS report from a CSV with columns q1..q10 (1-5), and optional recommendations/generation/safety columns.

Usage: python scripts/sus_report.py survey.csv
Works with the Admin -> User Testing export and with a Google Form export renamed to q1..q10.
"""
import csv
import statistics
import sys


def sus(row: dict) -> float:
    answers = [int(float(row[f"q{i}"])) for i in range(1, 11)]
    if any(not 1 <= a <= 5 for a in answers):
        raise ValueError("answers must be 1-5")
    return sum((a - 1) if i % 2 == 0 else (5 - a) for i, a in enumerate(answers)) * 2.5


def grade(score: float) -> str:
    for limit, label in ((85, "Excellent"), (72, "Good"), (52, "OK"), (38, "Poor")):
        if score >= limit:
            return label
    return "Awful"


def report(path: str) -> dict:
    with open(path, newline="", encoding="utf-8-sig") as f:
        rows = list(csv.DictReader(f))
    scores = [sus(r) for r in rows]
    out = {"participants": len(scores), "mean_sus": round(statistics.mean(scores), 1) if scores else None,
           "median_sus": statistics.median(scores) if scores else None,
           "stdev_sus": round(statistics.stdev(scores), 1) if len(scores) > 1 else 0.0}
    out["grade"] = grade(out["mean_sus"]) if scores else None
    for col in ("recommendations", "generation", "safety"):
        values = [float(r[col]) for r in rows if r.get(col)]
        if values:
            out[f"mean_{col}"] = round(statistics.mean(values), 2)
    return out


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    for key, value in report(sys.argv[1]).items():
        print(f"{key:>22}: {value}")
