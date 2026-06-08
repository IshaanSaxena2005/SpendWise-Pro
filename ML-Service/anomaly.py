# anomaly.py
"""Expense anomaly detection using Isolation Forest.

The function `detect_anomaly` takes a list of historical monthly expenses
(`history`) and a single `current_expense` value. It trains an Isolation
Forest on the historical data and then evaluates whether the current expense
looks anomalous.

Isolation Forest works by randomly partitioning the data space. Points that
require many splits to isolate are considered "normal"; points that are
isolated quickly are flagged as outliers. The model returns a decision score
(where higher scores = more normal) and a binary prediction (-1 = outlier,
1 = inlier).

The returned dictionary contains:
- `is_anomaly`: `True` if the model predicts an outlier, otherwise `False`.
- `anomaly_score`: The raw decision function score (float). Lower values
  indicate a higher likelihood of being an anomaly.
"""

import numpy as np
from sklearn.ensemble import IsolationForest


def detect_anomaly(history, current_expense):
    """Detect whether `current_expense` is anomalous compared to `history`.

    Parameters
    ----------
    history : list of numbers
        Past expense values (e.g., monthly totals).
    current_expense : float or int
        The expense we want to evaluate.

    Returns
    -------
    dict
        ``{"is_anomaly": bool, "anomaly_score": float}``
    """

    # Guard against empty history – without data we cannot train a model.
    if not history:
        raise ValueError("History list must contain at least one expense value.")

    # Convert the list to a 2‑D NumPy array because scikit‑learn expects shape (n_samples, n_features).
    X = np.array(history, dtype=float).reshape(-1, 1)

    # Train the Isolation Forest on the historical expenses.
    # `contamination='auto'` lets the algorithm guess the proportion of outliers.
    # A fixed `random_state` makes results reproducible for debugging.
    iso = IsolationForest(contamination="auto", random_state=42)
    iso.fit(X)

    # Evaluate the current expense.
    # decision_function returns a signed distance; larger = more normal.
    # predict returns 1 for inlier, -1 for outlier.
    score = iso.decision_function(np.array([[float(current_expense)]]))[0]
    prediction = iso.predict(np.array([[float(current_expense)]]))[0]

    is_anomaly = bool(prediction == -1)

    return {
        "is_anomaly": is_anomaly,
        "anomaly_score": float(score),
    }