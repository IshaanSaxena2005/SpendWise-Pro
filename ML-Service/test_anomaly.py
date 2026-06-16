
from anomaly import detect_anomaly

def test_anomaly_detection():
    test_cases = [
        {
            "history": [500, 600, 550, 650],
            "current": 580,
            "expected": False,
            "name": "Normal expense (580)"
        },
        {
            "history": [500, 600, 550, 650],
            "current": 5000,
            "expected": True,
            "name": "Anomalous expense (5000)"
        },
        {
            "history": [500, 600, 550, 650],
            "current": 10000,
            "expected": True,
            "name": "Anomalous expense (10000)"
        }
    ]

    passed = 0
    failed = 0

    for case in test_cases:
        result = detect_anomaly(case["history"], case["current"])
        status = "PASS" if result["is_anomaly"] == case["expected"] else "FAIL"
        
        if result["is_anomaly"] == case["expected"]:
            passed += 1
        else:
            failed += 1
        
        print(f"Test: {case['name']}")
        print(f"  Input: history={case['history']}, current={case['current']}")
        print(f"  Expected: is_anomaly={case['expected']}")
        print(f"  Actual: is_anomaly={result['is_anomaly']}, score={result['anomaly_score']:.4f}")
        print(f"  Status: {status}\n")

    print(f"\nSummary: {passed}/{len(test_cases)} passed")
    print(f"Accuracy: {100 * passed / len(test_cases):.0f}%")

if __name__ == "__main__":
    test_anomaly_detection()
