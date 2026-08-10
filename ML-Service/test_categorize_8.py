from classifier import predict_category

items = [
    ("potato", "Food"),
    ("aloo paratha", "Food"),
    ("paneer tikka", "Food"),
    ("Netflix", "Entertainment"),
    ("petrol", "Fuel"),
    ("Amazon shoes", "Shopping"),
    ("Apollo Pharmacy", "Health"),
    ("Uber", "Travel"),
]

print("=== EXACT 8 TEST ITEMS (POST /categorize simulation) ===")
print()

correct = 0
for item, expected in items:
    result = predict_category(item)
    cat = result["category"]
    conf = result["confidence"] * 100
    ok = cat == expected
    if ok:
        correct += 1
    status = "PASS" if ok else "FAIL"
    print(f"[{status}] {item!r:22} -> predicted={cat!r:18} expected={expected!r:18} confidence={conf:5.1f}%")

total = len(items)
print()
print(f"Result: {correct}/{total} correct ({100*correct/total:.1f}%)")
