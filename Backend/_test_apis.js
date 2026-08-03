const http = require('http');

function req(method, path, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: '127.0.0.1',
      port: 5000,
      path: path,
      method: method,
      headers: { 'Content-Type': 'application/json' }
    };
    if (token) opts.headers.Authorization = 'Bearer ' + token;
    let bodyStr = body ? JSON.stringify(body) : null;
    if (bodyStr) opts.headers['Content-Length'] = Buffer.byteLength(bodyStr);
    const request = http.request(opts, (res) => {
      let data = '';
      res.on('data', (c) => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
        catch(e) { resolve({ status: res.statusCode, raw: data }); }
      });
    });
    request.on('error', reject);
    if (bodyStr) request.write(bodyStr);
    request.end();
  });
}

(async () => {
  try {
    let r = await req('GET', '/api/health');
    console.log('[1] Health:', r.status, JSON.stringify(r.data).substring(0,120));

    const rand = Math.floor(Math.random()*99999);
    r = await req('POST', '/api/auth/signup', { full_name: 'Test User', email: 'test'+rand+'@test.com', password: 'Test@123456' });
    console.log('[2] Signup:', r.status, JSON.stringify(r.data).substring(0,200));

    r = await req('POST', '/api/auth/login', { email: 'test'+rand+'@test.com', password: 'Test@123456' });
    console.log('[3] Login:', r.status, r.data?.success ? 'SUCCESS token:' + r.data.token?.substring(0,20)+'...' : JSON.stringify(r.data));
    const token = r.data?.token;
    if (!token) { console.log('STOP: No token'); process.exit(1); }

    r = await req('GET', '/api/categories/all', null, token);
    console.log('[4] Categories:', r.status, 'count=' + (r.data?.categories?.length ?? 'N/A'));

    r = await req('GET', '/api/analytics/dashboard-summary', null, token);
    console.log('[5] Dashboard:', r.status, JSON.stringify(r.data).substring(0,150));

    r = await req('POST', '/api/ai/categorize', { description: 'Burger King' }, token);
    console.log('[6] Categorize Burger King:', r.status, JSON.stringify(r.data));

    r = await req('POST', '/api/ai/categorize', { description: 'Netflix Premium' }, token);
    console.log('[7] Categorize Netflix Premium:', r.status, JSON.stringify(r.data));

    r = await req('POST', '/api/ai/categorize', { description: 'Petrol' }, token);
    console.log('[8] Categorize Petrol:', r.status, JSON.stringify(r.data));

    r = await req('POST', '/api/ai/categorize', { description: 'Electricity Bill' }, token);
    console.log('[9] Categorize Electricity Bill:', r.status, JSON.stringify(r.data));

    r = await req('POST', '/api/ai/categorize', { description: 'Amazon Order' }, token);
    console.log('[10] Categorize Amazon Order:', r.status, JSON.stringify(r.data));

    const cats = (await req('GET', '/api/categories/all', null, token)).data?.categories || [];
    const catId = cats[0]?.id || 1;
    r = await req('POST', '/api/expenses/add', { category_id: catId, amount: 250, expense_date: '2026-08-03', note: 'Test expense', title:'Lunch' }, token);
    console.log('[11] Add Expense:', r.status, JSON.stringify(r.data).substring(0,150));
    const txnId = r.data?.id || null;

    r = await req('GET', '/api/expenses/all', null, token);
    console.log('[12] All Expenses:', r.status, 'count=' + (r.data?.expenses?.length ?? 'N/A'));

    r = await req('GET', '/api/budgets/all', null, token);
    console.log('[13] Budgets:', r.status, 'count=' + (r.data?.budgets?.length ?? 'N/A'));

    r = await req('GET', '/api/analytics/financial-history', null, token);
    console.log('[14] History:', r.status, 'expenses=' + (r.data?.expenses?.length ?? 'N/A') + ' budgets=' + (r.data?.budgets?.length ?? 'N/A'));

    r = await req('GET', '/api/recurring', null, token);
    console.log('[15] Recurring:', r.status, JSON.stringify(r.data).substring(0,100));

    r = await req('POST', '/api/ai/chat', { query: 'What is my spending this month?' }, token);
    console.log('[16] AI Chat:', r.status, r.data?.success ? 'OK response=' + r.data.response?.substring(0,80)+'...' : JSON.stringify(r.data).substring(0,150));

    r = await req('GET', '/api/intelligence', null, token);
    console.log('[17] Insights:', r.status, JSON.stringify(r.data).substring(0,150));

    r = await req('GET', '/api/health/score', null, token);
    console.log('[18] Health Score:', r.status, JSON.stringify(r.data).substring(0,120));

    r = await req('GET', '/api/goals/all', null, token);
    console.log('[19] Goals:', r.status, 'count=' + (r.data?.goals?.length ?? 'N/A'));

    if (txnId) {
      r = await req('PUT', '/api/expenses/update/' + txnId, { amount: 300, category_id: catId, expense_date: '2026-08-03', note: 'Edited', title: 'Edited Lunch' }, token);
      console.log('[20] Edit Expense:', r.status, JSON.stringify(r.data).substring(0,150));

      r = await req('DELETE', '/api/expenses/delete/' + txnId, null, token);
      console.log('[21] Delete Expense:', r.status, JSON.stringify(r.data).substring(0,150));
    }

    r = await req('GET', '/api/predictions/budget-breach', null, token);
    console.log('[22] Predictions:', r.status, JSON.stringify(r.data).substring(0,100));

    r = await req('GET', '/api/forecast', null, token);
    console.log('[23] Forecast:', r.status, JSON.stringify(r.data).substring(0,100));

    r = await req('GET', '/api/anomaly/check', null, token);
    console.log('[24] Anomalies:', r.status, 'count=' + (r.data?.anomalies?.length ?? 'N/A'));

    r = await req('GET', '/api/notifications', null, token);
    console.log('[25] Notifications:', r.status, 'count=' + (r.data?.data?.length ?? 'N/A'));

    r = await req('GET', '/api/analytics/category-breakdown', null, token);
    console.log('[26] Category Breakdown:', r.status, JSON.stringify(r.data).substring(0,100));

    r = await req('GET', '/api/analytics/monthly-trend', null, token);
    console.log('[27] Monthly Trend:', r.status, JSON.stringify(r.data).substring(0,100));

    console.log('\n=== ALL API CHECKS COMPLETED ===');
  } catch(e) {
    console.error('ERROR:', e.message);
    process.exit(1);
  }
})();
