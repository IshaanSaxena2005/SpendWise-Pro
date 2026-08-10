$items = @(
    @{ name = "potato"; expected = "Food" },
    @{ name = "aloo paratha"; expected = "Food" },
    @{ name = "paneer tikka"; expected = "Food" },
    @{ name = "Netflix"; expected = "Entertainment" },
    @{ name = "petrol"; expected = "Fuel" },
    @{ name = "Amazon shoes"; expected = "Shopping" },
    @{ name = "Apollo Pharmacy"; expected = "Health" },
    @{ name = "Uber"; expected = "Travel" }
)

Write-Host "=== HTTP POST /categorize ENDPOINT TESTS (port 5001) ===" -ForegroundColor Cyan
Write-Host ""

$correct = 0
foreach ($item in $items) {
    $body = @{ description = $item.name } | ConvertTo-Json
    try {
        $resp = Invoke-RestMethod -Uri "http://127.0.0.1:5001/categorize" -Method Post -Body $body -ContentType "application/json" -UseBasicParsing -TimeoutSec 10
        $cat = $resp.category
        $conf = [math]::Round($resp.confidence * 100, 1)
        $ok = $cat -eq $item.expected
        if ($ok) { $correct++ }
        $status = if ($ok) { "PASS" } else { "FAIL" }
        $color = if ($ok) { "Green" } else { "Red" }
        Write-Host "[$status] '$($item.name)' -> predicted='$cat' expected='$($item.expected)' confidence=$conf%" -ForegroundColor $color
    } catch {
        Write-Host "[ERROR] '$($item.name)' -> $($_.Exception.Message)" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "HTTP Endpoint Result: $correct/$($items.Count) correct ($([math]::Round(100*$correct/$items.Count, 1))%)" -ForegroundColor Cyan

Write-Host ""
Write-Host "=== GET /health check ===" -ForegroundColor Cyan
try {
    $health = Invoke-RestMethod -Uri "http://127.0.0.1:5001/health" -Method Get -UseBasicParsing -TimeoutSec 5
    Write-Host "Health: $($health.status)" -ForegroundColor Green
} catch {
    Write-Host "Health check FAILED: $($_.Exception.Message)" -ForegroundColor Red
}
