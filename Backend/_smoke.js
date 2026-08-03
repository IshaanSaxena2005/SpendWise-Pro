const axios = require('axios');

const API = 'http://localhost:5000/api';

async function main() {
  const emails = ['spendwise_test_user@example.com'];
  for (const email of emails) {
    try {
      await axios.post(`${API}/auth/signup`, {
        full_name: 'SpendWise Test User',
        email,
        password: 'Test@1234',
        confirm_password: 'Test@1234',
      });
      console.log('Registered:', email);
    } catch (e) {
      console.log('Register skip:', email, ' →', e.response?.data?.message || e.message);
    }
  }

  const loginResp = await axios.post(`${API}/auth/login`, {
    email: 'spendwise_test_user@example.com',
    password: 'Test@1234',
  });
  const token = loginResp.data.token;
  console.log('Token (first 40 chars):', String(token || '').slice(0, 40) + '…');
  console.log('Full token:');
  console.log(token);

  const client = axios.create({ baseURL: API, headers: { Authorization: `Bearer ${token}` } });

  console.log('\n--- /categories/all ---');
  const cats = await client.get('/categories/all');
  console.log(JSON.stringify(cats.data, null, 2));

  console.log('\n--- POST /ai/categorize ("Burger King") ---');
  try {
    const r1 = await client.post('/ai/categorize', { description: 'Burger King' });
    console.log(JSON.stringify(r1.data, null, 2));
  } catch (e) {
    console.log('FAIL:', e.response?.status, e.response?.data || e.message);
  }

  console.log('\n--- POST /ai/categorize ("netflx") ---');
  try {
    const r2 = await client.post('/ai/categorize', { description: 'netflx' });
    console.log(JSON.stringify(r2.data, null, 2));
  } catch (e) {
    console.log('FAIL:', e.response?.status, e.response?.data || e.message);
  }

  console.log('\n--- POST /ai/categorize ("Amazon Order") ---');
  try {
    const r3 = await client.post('/ai/categorize', { description: 'Amazon Order' });
    console.log(JSON.stringify(r3.data, null, 2));
  } catch (e) {
    console.log('FAIL:', e.response?.status, e.response?.data || e.message);
  }

  console.log('\n--- POST /expenses/add (create simple expense) ---');
  const foodCat = cats.data.categories.find((c) => /food/i.test(c.name));
  try {
    const addResp = await client.post('/expenses/add', {
      category_id: foodCat ? foodCat.id : cats.data.categories[0].id,
      amount: 249,
      expense_date: new Date().toISOString().slice(0, 10),
      note: 'Swiggy dinner order',
      title: 'Swiggy dinner order',
    });
    console.log(JSON.stringify(addResp.data, null, 2));
  } catch (e) {
    console.log('FAIL add expense:', e.response?.status, e.response?.data || e.message);
  }

  console.log('\n--- /expenses/all ---');
  const all = await client.get('/expenses/all');
  console.log('Total expenses:', all.data.expenses?.length || 0);
  console.log('Latest 2:', JSON.stringify((all.data.expenses || []).slice(-2), null, 2));

  console.log('\n--- /ai/chat ---');
  try {
    const chat = await client.post('/ai/chat', { query: 'How much did I spend this month?' });
    console.log(JSON.stringify(chat.data, null, 2));
  } catch (e) {
    console.log('FAIL chat:', e.response?.status, e.response?.data || e.message);
  }

  console.log('\n--- /recurring (create + list) ---');
  try {
    const billsCat = cats.data.categories.find((c) => /bill/i.test(c.name)) || cats.data.categories[0];
    const create = await client.post('/recurring', {
      type: 'expense',
      amount: 799,
      category_id: billsCat.id,
      note: 'Netflix monthly plan',
      frequency: 'monthly',
      start_date: new Date().toISOString().slice(0, 10),
      never_ends: true,
    });
    console.log('create recurring:', JSON.stringify(create.data, null, 2));
    const list = await client.get('/recurring');
    console.log('list recurring total:', list.data.recurring_transactions?.length || 0);
  } catch (e) {
    console.log('FAIL recurring:', e.response?.status, e.response?.data || e.message);
  }

  console.log('\n--- /analytics/dashboard-summary ---');
  try {
    const s = await client.get('/analytics/dashboard-summary');
    console.log(JSON.stringify(s.data, null, 2));
  } catch (e) {
    console.log('FAIL summary:', e.response?.status, e.response?.data || e.message);
  }
}

main().catch((e) => {
  console.error('FATAL:', e.message, e.response?.data || '');
  process.exit(1);
});
