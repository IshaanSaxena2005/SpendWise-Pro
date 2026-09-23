"""SpendWise Pro — Transaction Category Classifier (TF-IDF + Logistic Regression).

Pipeline:
    1. Load labeled transaction descriptions from category_dataset.DATASET
       (optionally combined with a curated, anonymized real-world export via
       category_dataset.build_training_set(curated_path=...))
    2. Split 80/20 train/test (stratified, fixed seed for reproducibility)
    3. Character n-gram TF-IDF vectorizer (resilient to typos & fragments)
    4. One-vs-Rest Logistic Regression with balanced class weights
    5. Evaluate on held-out test split: accuracy, precision, recall, F1, confusion matrix
    6. Persist vectorizer + model + class list to disk via joblib (no retrain per request)
    7. Write model_metadata.json with real computed metrics (no hard-coded values)

Exposes:
    - train_classifier()          — trains & saves the model, prints full report
    - load_classifier()           — returns (vect, clf, classes) once cached
    - predict_category(desc, ...) — dict with {"category", "confidence"}
"""

from __future__ import annotations

import os
import re
import sys
import io
import json
import shutil
import hashlib
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Tuple, Dict, Any, Optional

# Force UTF-8 output on Windows so ✓/✗ and Unicode bar chars always render
if hasattr(sys.stdout, "buffer"):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "buffer"):
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

import joblib
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.pipeline import FeatureUnion
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split
from sklearn.metrics import (
    accuracy_score,
    precision_score,
    recall_score,
    f1_score,
    classification_report,
    confusion_matrix,
)

import category_dataset
from category_dataset import DATASET

BASE_DIR = Path(__file__).resolve().parent
ARTIFACT_DIR = BASE_DIR / "artifacts"
VECTORIZER_PATH = ARTIFACT_DIR / "tfidf_vectorizer.joblib"
MODEL_PATH = ARTIFACT_DIR / "logreg_classifier.joblib"
CLASSES_PATH = ARTIFACT_DIR / "classes.joblib"
METADATA_PATH = ARTIFACT_DIR / "model_metadata.json"
PREVIOUS_DIR = ARTIFACT_DIR / "previous"

VALID_CLASSES: Tuple[str, ...] = (
    "Food",
    "Shopping",
    "Bills",
    "Travel",
    "Entertainment",
    "Health",
    "Fuel",
    "Salary",
)

# ---- process-wide cache to avoid disk re-reads on every HTTP request ----
_CACHE: Dict[str, Any] = {}


# -----------------------------------------------------------------------------
# Text preprocessing — lightweight, no hardcoded per-word rules
# -----------------------------------------------------------------------------

_WHITESPACE_RE = re.compile(r"\s+")
_STRIP_RE = re.compile(r"[^a-z0-9\s]")


def preprocess_text(text: str) -> str:
    """Lowercase, remove punctuation, collapse whitespace.

    The ML model itself is tasked with learning token patterns; we only do
    normalization that helps TF-IDF match across case/punctuation variations.
    """
    if not text:
        return ""
    t = str(text).lower()
    t = _STRIP_RE.sub(" ", t)
    t = _WHITESPACE_RE.sub(" ", t).strip()
    return t


# -----------------------------------------------------------------------------
# Training
# -----------------------------------------------------------------------------

def _build_vectorizer() -> FeatureUnion:
    """Combine word-level and character-level TF-IDF features.

    Word n-grams (1,2) capture phrases like "netflix subscription" or "uber ride".
    Character n-grams (3,6) within word boundaries capture typos ("swigy"/"swiggy"),
    Indian terms ("aloo"/"aalu"), and merchant fragments like "petrol", "apollo".
    """
    word_tfidf = TfidfVectorizer(
        analyzer="word",
        ngram_range=(1, 2),
        lowercase=True,
        min_df=2,
        max_df=0.95,
        sublinear_tf=True,
    )
    char_tfidf = TfidfVectorizer(
        analyzer="char_wb",
        ngram_range=(3, 6),
        lowercase=True,
        min_df=2,
        max_df=0.95,
        sublinear_tf=True,
    )
    return FeatureUnion([
        ("word", word_tfidf),
        ("char", char_tfidf),
    ])


def _build_classifier() -> LogisticRegression:
    """Multinomial Logistic Regression with standard (not balanced) weights.

    Unbalanced weights keep predict_proba probabilities well-calibrated for our
    confidence thresholds (>=0.85 high, 0.70–0.84 medium, <0.70 suggestion).
    Dataset itself is already near-balanced (175+/class) so reweighting is unnecessary.
    """
    return LogisticRegression(
        solver="saga",
        penalty="l2",
        C=2.5,
        max_iter=4000,
        n_jobs=-1,
        random_state=42,
    )


# -----------------------------------------------------------------------------
# Candidate-vs-incumbent gate (Phase 3 Part 10)
# -----------------------------------------------------------------------------

# A candidate replaces the incumbent only if BOTH hold:
#   weighted_f1 >= incumbent_weighted_f1 - F1_TOLERANCE
#   accuracy    >= incumbent_accuracy    - ACCURACY_TOLERANCE
F1_TOLERANCE = 0.01  # allow ≤1pt F1 noise in exchange for other improvements
ACCURACY_TOLERANCE = 0.01


def canonicalize_dataset(X: List[str], y: List[str]) -> str:
    """Deterministic representation of a training set (for hashing)."""
    lines = sorted(f"{d}\t{l}" for d, l in zip(X, y))
    return "\n".join(lines)


def _load_metadata() -> Optional[Dict[str, Any]]:
    if not METADATA_PATH.exists():
        return None
    try:
        with open(METADATA_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError):
        return None


def _write_metadata(path: Path, metrics: Dict[str, Any], classes: List[str], dataset_size: int, dataset_sha: str) -> Dict[str, Any]:
    metadata = {
        "model_version": datetime.now(timezone.utc).strftime("%Y.%m.%d-%H%M%S"),
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "dataset_size": dataset_size,
        "dataset_seed": category_dataset.DATASET_SEED,
        "dataset_sha256": dataset_sha,
        "classes": classes,
        "metrics": {
            "accuracy": metrics["accuracy"],
            "weighted_precision": metrics["precision"],
            "weighted_recall": metrics["recall"],
            "weighted_f1": metrics["f1"],
        },
        "model": {
            "algorithm": "LogisticRegression",
            "C": 2.5,
            "solver": "saga",
            "penalty": "l2",
        },
        "features": {
            "word_ngrams": [1, 2],
            "char_ngrams": [3, 6],
            "tfidf": "sublinear_tf",
        },
    }
    _atomic_write_json(path, metadata)
    return metadata


def _atomic_write_json(path: Path, payload: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=str(path.parent), suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(payload, f, indent=2)
        shutil.move(tmp, str(path))  # same-filesystem move = atomic
    except Exception:
        if os.path.exists(tmp):
            os.remove(tmp)
        raise


def _run_regression_spot_checks(predict_fn) -> Tuple[bool, int, int, List[str]]:
    """Run the canonical spot-check suite; returns (passed, correct, total, failures)."""
    correct = 0
    failures: List[str] = []
    for desc, expected in _SPOT_CHECK_CASES:
        pred = predict_fn(desc)
        ok = pred.get("category") == expected
        if ok:
            correct += 1
        else:
            failures.append(f"{desc!r}: expected={expected!r} got={pred.get('category')!r}")
    return (correct == len(_SPOT_CHECK_CASES)), correct, len(_SPOT_CHECK_CASES), failures


def _evaluate_candidate(
    clf, vectorizer, classes: List[str], X_test: List[str], y_test: List[str]
) -> Dict[str, Any]:
    """Evaluate a trained candidate against the incumbent's recorded metrics."""
    y_pred = clf.predict(vectorizer.transform(X_test))

    accuracy = float(accuracy_score(y_test, y_pred))
    precision = float(precision_score(y_test, y_pred, average="weighted", zero_division=0))
    recall = float(recall_score(y_test, y_pred, average="weighted", zero_division=0))
    f1 = float(f1_score(y_test, y_pred, average="weighted", zero_division=0))

    # Required classes must all survive (Part 10: category disappearance blocks promotion)
    missing_classes = [c for c in VALID_CLASSES if c not in set(classes)]

    spot_ok, spot_correct, spot_total, spot_failures = _run_regression_spot_checks(
        lambda desc: predict_with(clf, vectorizer, classes, desc)
    )

    incumbent = _load_metadata()
    inc_f1 = float(incumbent["metrics"]["weighted_f1"]) if incumbent else None
    inc_acc = float(incumbent["metrics"]["accuracy"]) if incumbent else None

    # Candidate MUST NOT replace the incumbent when:
    #   - F1 decreases materially
    #   - accuracy decreases materially
    #   - required spot checks fail
    #   - a category disappears / classes are invalid
    rejections: List[str] = []
    if missing_classes:
        rejections.append(f"missing classes: {missing_classes}")
    if inc_f1 is not None and f1 < inc_f1 - F1_TOLERANCE:
        rejections.append(f"F1 regression: {f1:.4f} < incumbent {inc_f1:.4f} - tolerance {F1_TOLERANCE}")
    if inc_acc is not None and accuracy < inc_acc - ACCURACY_TOLERANCE:
        rejections.append(f"accuracy regression: {accuracy:.4f} < incumbent {inc_acc:.4f} - tolerance {ACCURACY_TOLERANCE}")
    if not spot_ok:
        rejections.append(f"spot checks failed ({spot_correct}/{spot_total}): {spot_failures}")

    return {
        "accuracy": accuracy,
        "precision": precision,
        "recall": recall,
        "f1": f1,
        "incumbent_f1": inc_f1,
        "incumbent_accuracy": inc_acc,
        "missing_classes": missing_classes,
        "spot_correct": spot_correct,
        "spot_total": spot_total,
        "spot_ok": spot_ok,
        "rejections": rejections,
        "promoted": not rejections,
    }


def _backup_current_artifacts() -> bool:
    """Copy the current artifact set into artifacts/previous/ before promotion."""
    if not VECTORIZER_PATH.exists():
        return False  # no incumbent yet — nothing to back up
    PREVIOUS_DIR.mkdir(parents=True, exist_ok=True)
    for src in (VECTORIZER_PATH, MODEL_PATH, CLASSES_PATH, METADATA_PATH):
        if src.exists():
            shutil.copy2(src, PREVIOUS_DIR / src.name)
    return True


def promote_candidate(vectorizer, clf, classes: List[str], metrics: Dict[str, Any], dataset_size: int, dataset_sha: str) -> Dict[str, Any]:
    """Back up current artifacts, then atomically promote the candidate set."""
    backed_up = _backup_current_artifacts()

    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump(vectorizer, VECTORIZER_PATH)
    joblib.dump(clf, MODEL_PATH)
    joblib.dump(classes, CLASSES_PATH)
    metadata = _write_metadata(METADATA_PATH, metrics, classes, dataset_size, dataset_sha)

    # refresh in-process cache
    _CACHE["vectorizer"] = vectorizer
    _CACHE["model"] = clf
    _CACHE["classes"] = classes

    return {"backed_up": backed_up, "metadata": metadata}


def predict_with(clf, vectorizer, classes: List[str], description: str) -> Dict[str, Any]:
    """Prediction using an explicit model (used for candidate evaluation)."""
    cleaned = preprocess_text(description)
    if not cleaned:
        return {"category": None, "confidence": 0.0}
    vec = vectorizer.transform([cleaned])
    probs = clf.predict_proba(vec)[0]
    best_idx = int(np.argmax(probs))
    best_class = classes[best_idx]
    confidence = float(probs[best_idx])
    if best_class not in VALID_CLASSES:
        return {"category": None, "confidence": 0.0}
    return {"category": best_class, "confidence": round(confidence, 4)}


def train_classifier(
    force: bool = False,
    curated_path: Optional[str] = None,
) -> Dict[str, Any]:
    """Train, evaluate, gate against the incumbent, and conditionally persist.

    The candidate replaces production artifacts ONLY when it passes the
    regression gate (see _evaluate_candidate). Otherwise the existing artifacts
    remain untouched and the candidate is discarded.
    """
    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)

    if (
        not force
        and curated_path is None
        and VECTORIZER_PATH.exists()
        and MODEL_PATH.exists()
        and CLASSES_PATH.exists()
    ):
        # light-touch: if files already exist, just report by loading & validating
        _ = load_classifier()
        print("[classifier] Artifacts already exist; set force=True to retrain")
        return {"skipped": True}

    # Load dataset (synthetic + optional curated real-world examples)
    X_raw, y = category_dataset.build_training_set(curated_path=curated_path)
    X_raw = [str(x) for x in X_raw]

    if len(X_raw) < 50:
        raise RuntimeError(f"Dataset too small to train: {len(X_raw)} samples")

    # Apply preprocessing
    X_clean = [preprocess_text(x) for x in X_raw]

    # Stratified train/test split (stratify preserves class balance in both splits)
    X_train, X_test, y_train, y_test = train_test_split(
        X_clean,
        y,
        test_size=0.2,
        random_state=42,
        stratify=y,
    )

    # Vectorize
    vectorizer = _build_vectorizer()
    Xv_train = vectorizer.fit_transform(X_train)
    Xv_test = vectorizer.transform(X_test)

    # Model — OneVsRest LogReg with balanced class weights
    clf = _build_classifier()
    clf.fit(Xv_train, y_train)
    classes: List[str] = list(clf.classes_)

    # Predictions & probabilities on test set
    y_pred = clf.predict(Xv_test)
    y_prob = clf.predict_proba(Xv_test)
    # confidence of the predicted class per sample
    conf_per_sample = np.max(y_prob, axis=1)
    avg_confidence = float(np.mean(conf_per_sample))

    # ---- Candidate evaluation vs incumbent (before ANY artifact write) ----
    gate = _evaluate_candidate(clf, vectorizer, classes, X_test, y_test)

    # ---- Print report ----
    report = classification_report(
        y_test,
        y_pred,
        labels=list(VALID_CLASSES),
        zero_division=0,
    )
    cm = confusion_matrix(y_test, y_pred, labels=list(VALID_CLASSES))

    print("=" * 70)
    print("SPENDWISE PRO — ML TRANSACTION CLASSIFIER (TF-IDF + LogReg)")
    print("=" * 70)
    print(f"Total samples       : {len(X_clean)}")
    print(f"Train / Test split  : {len(X_train)} / {len(X_test)}")
    print(f"Classes             : {', '.join(classes)}")
    try:
        total_features = int(Xv_train.shape[1])
        print(f"Vocabulary features : {total_features:,}")
    except Exception:
        pass
    print("-" * 70)
    print(f"Accuracy            : {gate['accuracy'] * 100:.2f}%")
    print(f"Precision (wtd)     : {gate['precision'] * 100:.2f}%")
    print(f"Recall    (wtd)     : {gate['recall'] * 100:.2f}%")
    print(f"F1        (wtd)     : {gate['f1'] * 100:.2f}%")
    print(f"Avg. test confidence: {avg_confidence * 100:.2f}%")
    print("-" * 70)
    print(f"INCUMBENT COMPARISON: incumbent_f1={gate['incumbent_f1']} incumbent_acc={gate['incumbent_accuracy']}")
    print(f"SPOT CHECKS         : {gate['spot_correct']}/{gate['spot_total']} passed")
    print("-" * 70)
    print("PER-CLASS REPORT")
    print("-" * 70)
    print(report)
    print("-" * 70)
    print("CONFUSION MATRIX (rows=true, cols=predicted)")
    print("-" * 70)
    header = f"{'':>18}" + "".join(f"{c[:10]:>12}" for c in VALID_CLASSES)
    print(header)
    for i, label in enumerate(VALID_CLASSES):
        row = f"{label:>18}" + "".join(f"{cm[i][j]:>12}" for j in range(len(VALID_CLASSES)))
        print(row)
    print("=" * 70)

    # ---- Gate decision (Part 10/14) ----
    if not gate["promoted"]:
        print("\n[X] CANDIDATE REJECTED — production artifacts NOT modified:")
        for reason in gate["rejections"]:
            print(f"    - {reason}")
        return {
            "promoted": False,
            "rejections": gate["rejections"],
            "accuracy": gate["accuracy"],
            "f1": gate["f1"],
            "spot_correct": gate["spot_correct"],
            "spot_total": gate["spot_total"],
        }

    dataset_sha = hashlib.sha256(canonicalize_dataset(X_clean, y).encode("utf-8")).hexdigest()
    promo = promote_candidate(
        vectorizer, clf, classes,
        metrics={"accuracy": gate["accuracy"], "precision": gate["precision"], "recall": gate["recall"], "f1": gate["f1"]},
        dataset_size=len(X_clean),
        dataset_sha=dataset_sha,
    )
    print(f"\n[✓] Candidate PROMOTED (previous artifacts backed up: {promo['backed_up']})")
    print(f"    model_version={promo['metadata']['model_version']} dataset_sha256={dataset_sha[:16]}…")

    return {
        "promoted": True,
        "samples": len(X_clean),
        "train": len(X_train),
        "test": len(X_test),
        "accuracy": gate["accuracy"],
        "precision": gate["precision"],
        "recall": gate["recall"],
        "f1": gate["f1"],
        "avg_confidence": avg_confidence,
        "confusion_matrix": cm.tolist(),
        "classes": classes,
        "model_version": promo["metadata"]["model_version"],
        "backed_up": promo["backed_up"],
    }


# -----------------------------------------------------------------------------
# Loading & inference
# -----------------------------------------------------------------------------

def load_classifier() -> Tuple[Any, LogisticRegression, List[str]]:
    """Load (and cache in-process) trained artifacts.

    If the artifacts don't exist yet, train the classifier on-the-fly so the
    Flask endpoint can always answer correctly even after a fresh checkout.
    """
    if (
        "vectorizer" in _CACHE
        and "model" in _CACHE
        and "classes" in _CACHE
    ):
        return _CACHE["vectorizer"], _CACHE["model"], _CACHE["classes"]

    if not VECTORIZER_PATH.exists() or not MODEL_PATH.exists() or not CLASSES_PATH.exists():
        print("[classifier] Artifacts missing; triggering training.")
        train_classifier(force=True)

    vectorizer = joblib.load(VECTORIZER_PATH)
    clf: LogisticRegression = joblib.load(MODEL_PATH)
    classes: List[str] = joblib.load(CLASSES_PATH)
    _CACHE["vectorizer"] = vectorizer
    _CACHE["model"] = clf
    _CACHE["classes"] = classes
    return vectorizer, clf, classes


def predict_category(description: str) -> Dict[str, Any]:
    """Classify a single transaction description.

    Returns:
        {"category": str, "confidence": float (0..1)}
    """
    vectorizer, clf, classes = load_classifier()
    cleaned = preprocess_text(description)
    if not cleaned:
        return {"category": None, "confidence": 0.0}

    vec = vectorizer.transform([cleaned])
    probs = clf.predict_proba(vec)[0]
    best_idx = int(np.argmax(probs))
    best_class = classes[best_idx]
    confidence = float(probs[best_idx])

    # Safety: only allow valid output classes (defense against stale artifacts)
    if best_class not in VALID_CLASSES:
        return {"category": None, "confidence": 0.0}

    return {
        "category": best_class,
        "confidence": round(confidence, 4),
    }


def predict_top_k(description: str, k: int = 3) -> List[Dict[str, Any]]:
    """Return top-k predictions with probabilities. Used mostly for debugging."""
    vectorizer, clf, classes = load_classifier()
    cleaned = preprocess_text(description)
    if not cleaned:
        return []
    vec = vectorizer.transform([cleaned])
    probs = clf.predict_proba(vec)[0]
    order = np.argsort(probs)[::-1][:k]
    return [
        {"category": classes[i], "confidence": float(probs[i])}
        for i in order
        if classes[i] in VALID_CLASSES
    ]


# -----------------------------------------------------------------------------
# CLI — running `python classifier.py` triggers training + eval + quick spot-checks
# -----------------------------------------------------------------------------

_SPOT_CHECK_CASES: List[Tuple[str, str]] = [
    ("potato", "Food"),
    ("aloo paratha", "Food"),
    ("paneer tikka", "Food"),
    ("Netflix subscription", "Entertainment"),
    ("electricity bill", "Bills"),
    ("Indian Oil petrol", "Fuel"),
    ("Amazon shoes", "Shopping"),
    ("Apollo Pharmacy", "Health"),
    ("Uber ride", "Travel"),
    ("HDFC salary credit", "Salary"),
]


def _run_spot_checks() -> int:
    print("-" * 70)
    print("SPOT CHECKS (user-specified test cases)")
    print("-" * 70)
    correct = 0
    for desc, expected in _SPOT_CHECK_CASES:
        pred = predict_category(desc)
        ok = pred["category"] == expected
        if ok:
            correct += 1
        status = "✓" if ok else "✗"
        print(
            f"  {status} {desc!r:<28} -> "
            f"pred={pred.get('category')!r:<15} "
            f"expected={expected!r:<15} "
            f"conf={pred.get('confidence', 0)*100:5.1f}%"
        )
    total = len(_SPOT_CHECK_CASES)
    acc = correct / total if total else 0
    print(f"\nSpot-check accuracy: {correct}/{total} ({acc * 100:.1f}%)")
    return 0 if acc >= 0.8 else 1


if __name__ == "__main__":
    force = "--force" in sys.argv
    curated = None
    if "--curated" in sys.argv:
        idx = sys.argv.index("--curated")
        curated = sys.argv[idx + 1]
        print(f"[classifier] Curated dataset: {curated}")
    metrics = train_classifier(force=force, curated_path=curated)
    if metrics.get("skipped"):
        # still print spot checks so the CLI remains useful
        print("[classifier] Using pre-trained artifacts; running spot checks only.")
    elif not metrics.get("promoted", True):
        print("[classifier] Candidate was REJECTED; production artifacts unchanged.")
    code = _run_spot_checks()
    sys.exit(code)
