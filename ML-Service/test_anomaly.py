from anomaly import detect_anomaly

def run_case(name, history, current, check):
    result = detect_anomaly(history, current)
    ok = check(result)
    print(f"Test: {name}")
    print(f"  Input: history={history}, current={current}")
    print(f"  Actual: is_anomaly={result['is_anomaly']}, "
          f"score={result['anomaly_score']}, reason={result['reason']}")
    print(f"  Status: {'PASS' if ok else 'FAIL'}\n")
    return ok

def check_reason(reason):
    return lambda r: r["reason"] == reason and r["is_anomaly"] is False

def check_anomaly_detected(r):
    return r["reason"] == "anomaly_detected" and r["is_anomaly"] is True

results = []
add = lambda *args: results.append(run_case(*args))

# Backend MIN_HISTORY=10 / MIN_ANOMALY_AMOUNT=20 gates normally stop tiny
# histories and amounts upstream; these checks apply defence in depth.
add("single history entry -> insufficient_history",
    [700], 1, check_reason("insufficient_history"))

# Rs 1 was previously flagged here (2-point flat history hit the legacy
# `score <= 0.05` band); low amounts must now be reported as not high spending.
add("Rs 1 vs rich history -> not_high_spending, NOT an anomaly",
    [500, 480, 520], 1, check_reason("not_high_spending"))
add("Rs 1 with self-included flat history -> not an anomaly",
    [1, 500], 1, check_reason("not_high_spending"))

# Degenerate identical histories (MAD = 0): only a decisive exceedance counts.
add("Rs 500 exact repeat of identical history -> not_anomaly",
    [500, 500, 500], 500, check_reason("not_anomaly"))
add("Rs 501 with identical Rs 500 history (+0.2%) -> not_anomaly",
    [500, 500, 500], 501, check_reason("not_anomaly"))
add("Rs 2500 with identical Rs 500 history (+400%) -> anomaly_detected",
    [500, 500, 500], 2500, check_anomaly_detected)

# n = 10 regime (what the Node backend guarantees via MIN_HISTORY = 10).
add("n=10 identical: Rs 501 stays silent",
    [500] * 10, 501, check_reason("not_anomaly"))
add("n=10 identical: Rs 950 (under 3x, model inlier) stays silent",
    [500] * 10, 950, check_reason("not_anomaly"))
add("n=10 identical: Rs 2500 (decisive exceedance) -> anomaly_detected",
    [500] * 10, 2500, check_anomaly_detected)
add("n=10 tight cluster: Rs 5000 the model cannot see -> decisive anomaly_detected",
    [500, 480, 520, 490, 510, 495, 505, 485, 515, 500], 5000, check_anomaly_detected)

# A poisoned income spike in the history must not block detection of a real
# high spend (the forest CAN flag points inside a stretched feature space).
add("income-poisoned history: Rs 5000 still detected as high",
    [20000, 500, 450, 480, 520, 490, 510, 470, 530, 485], 5000, check_anomaly_detected)
add("income-poisoned history: Rs 1 is not high spending",
    [20000, 500, 450, 480, 520, 490, 510, 470, 530, 485], 1, check_reason("not_high_spending"))
add("tiny 3-point poisoned history (below backend MIN_HISTORY): no confident verdict",
    [20000, 500, 450], 5000, check_reason("not_anomaly"))

# Realistic varied history.
add("realistic history: Rs 550 (modest overspend) -> not_anomaly",
    [420, 380, 450, 500, 460, 430, 410, 470, 440, 455], 550, check_reason("not_anomaly"))
add("realistic history: Rs 5000 (decisive exceedance) -> anomaly_detected",
    [420, 380, 450, 500, 460, 430, 410, 470, 440, 455], 5000, check_anomaly_detected)
add("realistic history: Rs 1 -> not_high_spending",
    [420, 380, 450, 500, 460, 430, 410, 470, 440, 455], 1, check_reason("not_high_spending"))

passed = sum(1 for ok in results if ok)
failed = len(results) - passed

print(f"\nSummary: {passed}/{len(results)} passed")
print(f"Accuracy: {100 * passed // len(results)}%")
if failed:
    raise SystemExit(f"{failed} test case(s) FAILED")
