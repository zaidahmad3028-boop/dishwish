"""Vercel Python function entry point; only the public health route exists in step 1."""

from fastapi import FastAPI

app = FastAPI(title="Pantry2Plate PK API", version="0.1.0")


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "pantry2plate-pk-api"}
