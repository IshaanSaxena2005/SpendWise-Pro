const axios = require('axios');

const API = 'http://localhost:5000/api';
const TOKEN = process.argv[2];

if (!TOKEN) {
  console.error('Need token as first arg');
  process.exit(1);
}

const client = axios.create({ baseURL: API, headers: { Authorization: `Bearer ${TOKEN}` } });

(async () => {
  const today = new Date().toISOString().slice(0, 10);

  console.log('\n--- Category CRUD ---');
  const addCat = await client.post('/categories/add', { name: 'Gadgets', icon: '📱', color: '#6366f1' });
  console.log('Add category:', addCat.status, JSON.stringify(addCat.data));
  const newCatId = addCat.data.category?.id;
  if (newCatId) {
    const up = await client.put(`/categories/update/${newCatId}`, { name: 'Tech Gadgets', icon: '💻' });
    console.log('Update category:', up.status, JSON.stringify(up.data));
  }

  console.log('\n--- Expense Update & Delete ---');
  const all = await client.get('/expenses/all');
  const expense = (all.data.expenses || [])[0];
  if (expense) {
    console.log('Editing expense:', expense.id);
    const upd = await client.put(`/expenses/update/${expense.id}`, {
      note: 'Edited: Swiggy lunch order',
      title: 'Edited: Swiggy lunch order',
      amount: 299,
    });
    console.log('Update expense:', upd.status, JSON.stringify(upd.data));
    const all2 = await client.get('/expenses/all');
    const ex2 = (all2.data.expenses || []).find((x) => x.id === expense.id);
    console.log('Verify updated amount:', ex2?.amount);
  }

  const catsAfter = await client.get('/categories/all');

  // Clean up: add another, then delete, then delete the added gadget category if exists
  const temp = await client.post('/expenses/add', {
    category_id: catsAfter.data.categories[0].id,
    amount: 50,
    expense_date: today,
    note: 'Delete test',
    title: 'Delete test',
  });
  const toDelId = temp.status === 200 ? (temp.data.id || (await client.get('/expenses/all')).data.expenses.slice(-1)[0]?.id) : null;
  if (toDelId) {
    const del = await client.delete(`/expenses/delete/${toDelId}`);
    console.log('Delete expense:', del.status, JSON.stringify(del.data));
  }
  if (newCatId) {
    const delCat = await client.delete(`/categories/delete/${newCatId}`);
    console.log('Delete category:', delCat.status, JSON.stringify(delCat.data));
  }

  console.log('\n--- Notifications & history endpoints that could trigger CSV downloads ---');
  try {
    const notif = await client.get('/notifications');
    console.log('Notifications:', notif.status, 'count=' + (notif.data.data?.length || 0));
  } catch (e) { console.log('notif fail', e.response?.status, e.response?.data?.message || e.message); }

  try {
    const finHist = await client.get('/analytics/financial-history');
    console.log('Financial history:', finHist.status, 'expenses=' + (finHist.data.expenses?.length || 0), 'budgets=' + (finHist.data.budgets?.length || 0));
  } catch (e) { console.log('finHist fail', e.response?.status, e.response?.data?.message || e.message); }

  try {
    const breakdown = await client.get('/analytics/category-breakdown');
    console.log('Category breakdown:', breakdown.status, 'rows=' + (breakdown.data.breakdown?.length || 0));
  } catch (e) { console.log('breakdown fail', e.response?.status, e.response?.data?.message || e.message); }

  try {
    const health = await client.get('/health/score');
    console.log('Health score:', health.status, 'score=' + health.data.score, health.data.rating);
  } catch (e) { console.log('health fail', e.response?.status, e.response?.data?.message || e.message); }

  console.log('\n✅ CRUD smoke complete');
})().catch((e) => {
  console.error('FATAL:', e.response?.status, e.response?.data || e.message);
  process.exit(1);
});
