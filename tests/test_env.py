import os

from core.env import load_env_file


def test_loads_values_without_overriding_real_env(tmp_path, monkeypatch):
    monkeypatch.delenv("DISHWISH_SKIP_ENV_FILE", raising=False)
    env = tmp_path / ".env"
    env.write_text(
        "# comment\nDW_A=one\nDW_B=\"two\"\nDW_C=from-file\nDW_D=\nDW_E=https://YOUR_PROJECT_REF.supabase.co\nnot a line\n",
        encoding="utf-8")
    for k in ("DW_A", "DW_B", "DW_D", "DW_E"):
        monkeypatch.delenv(k, raising=False)
    monkeypatch.setenv("DW_C", "from-shell")
    assert load_env_file(env) == ["DW_A", "DW_B"]
    assert os.environ["DW_A"] == "one" and os.environ["DW_B"] == "two"
    assert os.environ["DW_C"] == "from-shell"
    assert "DW_D" not in os.environ and "DW_E" not in os.environ
    for k in ("DW_A", "DW_B"):
        monkeypatch.delenv(k)


def test_missing_file_is_fine(tmp_path):
    assert load_env_file(tmp_path / "nope.env") == []
