# anomaly.py
"""Expense anomaly detection using Isolation Forest.

`detect_anomaly(history, current_expense)` trains an Isolation Forest on the
historical amounts and evaluates whether the current amount is an outlier.

Post-audit hardening (see the anomaly-alert audit):

1. The old decision rule `predict() == -1 OR decision_function() <= 0.05`
   flagged EVERY transaction once a category had exactly one prior expense:
   with n = 2 points all amounts share the same isolation depth, so the score
   is 0.0000, which fell inside the `<= 0.05` band even when the model itself
   predicted "inlier". That band is gone — `predict()` is the primary signal.

2. Isolation Forest is direction-blind: ₹1 and ₹9,999 are both "unusual"
   against a ₹500 history, yet the UI copy can only ever say "unusually
   high". A direction check is therefore applied: the current amount must be
   *materially above* a robust baseline — the historical median raised by 2
   scaled MADs (1.4826 * MAD is the normal-consistent estimate of one
   standard deviation). Amounts below the median return `not_high_spending`;
   they are never reported as high spending.

3. MEASURED MODEL LIMITATION (and the one deliberate deviation from a pure
   "model AND direction" rule): on a tight 1-D history the forest's
   decision_function cannot flag external high points at all. An amount far
   beyond the training range rides the outermost splits of every tree and
   ends up with a path length comparable to ordinary training points —
   measured: history [480..520] x10, current 5000 → predict() = 1 (inlier),
   score +0.0031. The legacy `score <= 0.05` band was a broken patch over
   exactly this. Instead of reinstating that band, a *decisive* robust
   exceedance is trusted on its own: an amount that is BOTH above the
   median + 2 scaled-MAD baseline AND at least 3x the largest historical
   expense is reported as `anomaly_detected` even when the model, blind to
   out-of-range points, calls it an inlier. Everything else still requires
   the model to flag the point. The band is a score-space heuristic; this is
   an explainable amount-space threshold.

4. With fewer than 2 previous data points neither the median/MAD baseline
   nor the model is meaningful, so the result is `insufficient_history`
   rather than a speculative verdict. (The Node backend additionally
   enforces MIN_HISTORY = 10 and MIN_ANOMALY_AMOUNT before ever calling this
   service — the guards here are defence in depth.)

The returned dict contains:
- `is_anomaly`: True only for a HIGH outlier.
- `anomaly_score`: raw IsolationForest decision score (lower = more
  outlying); None when no model was fitted.
- `reason`: one of
    insufficient_history | not_high_spending | not_anomaly | anomaly_detected
"""

import numpy as np
from sklearn.ensemble import IsolationForest

# 2 scaled-MADs ≈ the ~97.7% band of a normal distribution. Tuned to stay
# conservative on small, quiet spending histories (fewer false positives),
# while genuinely large outliers (several times the typical amount) still
# clear it. Deliberately NOT the definition of "high spending" on its own.
HIGH_OUTLIER_SCALED_MADS = 2.0

# The normal-consistency constant linking MAD to a standard deviation.
MAD_TO_SIGMA = 1.4826

# Degenerate-history fallback: when the MAD is 0 (identical historical
# amounts) the median+MAD threshold collapses onto the median, so "materially
# above" means above the largest historical value plus this small relative
# margin. With all-₹500 history, ₹501 stays silent and ₹2,500 becomes
# eligible.
DEGENERATE_HIGH_MARGIN = 0.05

# Decisive exceedance (see docstring point 3): at least this multiple of the
# largest historical expense, combined with the robust baseline, is trusted
# without a model concurrence. 3x keeps modest overspends (₹600 against a
# ₹500 history) quiet while catching the structurally-invisible 10x booking.
DECISIVE_EXCEEDANCE_FACTOR = 3.0


def detect_anomaly(history, current_expense):
    """Detect whether `current_expense` is an unusually HIGH expense.

    Parameters
    ----------
    history : list of numbers
        Past expense values (same category, expenses only). May be empty.
    current_expense : float or int
        The expense we want to evaluate.

    Returns
    -------
    dict
        ``{"is_anomaly": bool, "anomaly_score": float | None, "reason": str}``
    """

    # Bucket the expense into the float the rest of the function works with;
    # also validates the type up front, before any early return.
    current = float(current_expense)

    # Guard against empty history – without data we cannot train a model.
    if not history:
        raise ValueError("History list must contain at least one expense value.")

    values = np.array(history, dtype=float)

    # Insufficient history: the model and the median/MAD baseline are both
    # meaningless on a single point. Report no anomaly (with a machine-
    # readable reason) instead of a speculative verdict.
    if values.size < 2:
        return {
            "is_anomaly": False,
            "anomaly_score": None,
            "reason": "insufficient_history",
        }

    X = values.reshape(-1, 1)

    # For small datasets, use a higher contamination to ensure we can detect
    # outliers. A fixed `random_state` makes results reproducible.
    contamination = 0.25 if values.size < 10 else 0.1
    iso = IsolationForest(contamination=contamination, random_state=42)
    iso.fit(X)

    probe = np.array([[current]])
    # decision_function returns a signed distance; larger = more normal.
    # predict returns 1 for inlier, -1 for outlier.
    score = float(iso.decision_function(probe)[0])
    prediction = bool(iso.predict(probe)[0] == -1)

    # Robust HIGH baseline (immune to single extreme values, unlike mean+s.d.).
    median = float(np.median(values))
    mad = float(np.median(np.abs(values - median)))
    if mad == 0.0:
        high_threshold = max(float(values.max()), median) * (1.0 + DEGENERATE_HIGH_MARGIN)
    else:
        high_threshold = median + HIGH_OUTLIER_SCALED_MADS * MAD_TO_SIGMA * mad
    above_baseline = current > high_threshold

    # Decisive exceedance: grossly beyond anything the user has spent before.
    # Catches high outliers the forest structurally cannot see (docstring 3).
    decisive = above_baseline and current >= DECISIVE_EXCEEDANCE_FACTOR * float(values.max())

    if above_baseline and (prediction or decisive):
        # Model-flagged outlier AND materially above the baseline, or a
        # decisive exceedance the model is blind to → genuine high spending.
        is_anomaly, reason = True, "anomaly_detected"
    elif current < median:
        # Unusually low, e.g. a ₹1 test transaction. Never reported as
        # "unusually high" spending.
        is_anomaly, reason = False, "not_high_spending"
    else:
        # Between the baseline and the decisive band, or a model inlier.
        is_anomaly, reason = False, "not_anomaly"

    return {
        "is_anomaly": is_anomaly,
        "anomaly_score": score,
        "reason": reason,
    }
