"""Determinism test for dataset generation (Phase 3 Part 13).

build_dataset(seed=42) called twice must produce the SAME dataset (compare a
deterministic hash, not object identity). Also verifies the seeded shuffle in
build_training_set keeps the combined training set reproducible.

Run: python test_dataset_determinism.py
"""
from category_dataset import build_dataset, build_training_set, DATASET_SEED
import hashlib


def _hash_dataset(dataset) -> str:
    lines = sorted(f"{text}\t{label}" for text, label in dataset)
    return hashlib.sha256("\n".join(lines).encode("utf-8")).hexdigest()


def main() -> int:
    a = build_dataset(DATASET_SEED)
    b = build_dataset(DATASET_SEED)

    ha, hb = _hash_dataset(a), _hash_dataset(b)
    print(f"dataset hash (run 1): {ha}")
    print(f"dataset hash (run 2): {hb}")
    ok = ha == hb
    print(f"[{'PASS' if ok else 'FAIL'}] build_dataset(seed={DATASET_SEED}) deterministic: {ok}")

    # build_training_set must also be reproducible (seeded shuffle)
    x1, y1 = build_training_set()
    x2, y2 = build_training_set()
    h1 = hashlib.sha256("\n".join(f"{t}\t{l}" for t, l in zip(x1, y1)).encode("utf-8")).hexdigest()
    h2 = hashlib.sha256("\n".join(f"{t}\t{l}" for t, l in zip(x2, y2)).encode("utf-8")).hexdigest()
    combined_ok = h1 == h2 and h1 != ""
    print(f"[{'PASS' if combined_ok else 'FAIL'}] build_training_set() reproducible (seeded shuffle): {combined_ok}")

    return 0 if (ok and combined_ok) else 1


if __name__ == "__main__":
    raise SystemExit(main())
