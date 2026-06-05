#!/usr/bin/env python
"""One-shot local BGE-M3 embedding runtime.

Reads {"texts": [...]} from stdin and writes a compact JSON result to stdout.
The script only loads a local sentence-transformers model and does not expose
any command execution surface.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
from pathlib import Path

SECRET_PATTERN = re.compile(r"(sk-[A-Za-z0-9_-]+|token\s*[:=]\s*[^\s,;]+|api[_-]?key\s*[:=]\s*[^\s,;]+)", re.IGNORECASE)
WINDOWS_PATH_PATTERN = re.compile(r"\b[A-Za-z]:\\[^\s\"']+")


def write_json(payload: dict) -> None:
    sys.stdout.write(json.dumps(payload, ensure_ascii=True, separators=(",", ":")))
    sys.stdout.flush()


def safe_message(value: object) -> str:
    text = str(value or "")
    text = SECRET_PATTERN.sub("[redacted]", text)
    text = WINDOWS_PATH_PATTERN.sub("[redacted-path]", text)
    return text[:240]


def error(code: str, message: str) -> int:
    write_json({"ok": False, "error": {"code": code, "message": message}})
    return 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Embed text with local BGE-M3.")
    parser.add_argument("--model-path", required=True)
    parser.add_argument("--max-input-chars", type=int, default=1600)
    parser.add_argument("--max-batch-size", type=int, default=8)
    parser.add_argument("--encode-batch-size", type=int, default=8)
    return parser.parse_args()


def read_texts(max_input_chars: int, max_batch_size: int) -> list[str]:
    try:
        payload = json.loads(sys.stdin.read() or "{}")
    except json.JSONDecodeError as exc:
        raise ValueError("Input must be JSON.") from exc

    texts = payload.get("texts")
    if not isinstance(texts, list):
        raise ValueError("Input JSON must contain a texts array.")

    bounded_texts = []
    for item in texts[: max(1, max_batch_size)]:
        text = item if isinstance(item, str) else str(item)
        bounded_texts.append(text[: max(1, max_input_chars)])
    return bounded_texts


def main() -> int:
    args = parse_args()
    model_path = Path(args.model_path)
    if not model_path.exists() or not model_path.is_dir():
        return error("missing_model", "Local BGE-M3 model path is missing.")

    try:
        texts = read_texts(args.max_input_chars, args.max_batch_size)
    except ValueError as exc:
        return error("bad_request", str(exc))

    if not texts:
        write_json({"ok": True, "embeddings": [], "model": "bge-m3", "dimension": 0, "elapsed": 0})
        return 0

    try:
        from sentence_transformers import SentenceTransformer
    except Exception:
        return error("missing_dependency", "Python package sentence-transformers is not installed.")

    started = time.perf_counter()
    current_index = -1
    current_text = ""
    try:
        model = SentenceTransformer(str(model_path))
        embeddings = []
        for index, text in enumerate(texts):
            current_index = index
            current_text = text
            vectors = model.encode(
                text,
                normalize_embeddings=True,
                convert_to_numpy=True,
            )
            embeddings.append(vectors.tolist())
    except Exception as exc:
        type_counts: dict[str, int] = {}
        lengths = []
        for text in texts:
            type_name = type(text).__name__
            type_counts[type_name] = type_counts.get(type_name, 0) + 1
            if isinstance(text, str):
                lengths.append(len(text))
        length_summary = f"{min(lengths)}..{max(lengths)}" if lengths else "n/a"
        current_summary = f" current={current_index}:{type(current_text).__name__}:{len(current_text) if isinstance(current_text, str) else 'n/a'}"
        return error(
            "runtime_error",
            f"{type(exc).__name__}: {safe_message(exc)}; inputs={len(texts)} types={type_counts} lengths={length_summary}{current_summary}",
        )

    dimension = len(embeddings[0]) if embeddings else 0
    elapsed = int((time.perf_counter() - started) * 1000)
    write_json({
        "ok": True,
        "embeddings": embeddings,
        "model": "bge-m3",
        "dimension": dimension,
        "elapsed": elapsed,
    })
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
