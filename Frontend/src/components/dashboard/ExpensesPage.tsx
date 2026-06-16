import { useState, useMemo } from 'react';
import { Search, Download, Edit2, Trash2, ChevronLeft, ChevronRight, Receipt } from 'lucide-react';
import { getCategories, type Transaction } from '../../lib/store';
import { useExpenses, deleteExpenseApi } from '../../lib/expenses';
import { AddTransactionModal } from './AddTransactionModal';

const PAGE_SIZE = 10;

function fmt(n: number) { return '₹' + n.toLocaleString('en-IN'); }

export function ExpensesPage() {
  const categories = getCategories();
  const { transactions: all, refresh } = useExpenses();
  const [search,    setSearch]    = useState('');
  const [catFilter, setCatFilter] = useState('all');
  const [typeFilter,setTypeFilter]= useState('all');
  const [dateFrom,  setDateFrom]  = useState('');
  const [dateTo,    setDateTo]    = useState('');
  const [page,      setPage]      = useState(1);
  const [editTxn,   setEditTxn]   = useState<Transaction | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const filtered = useMemo(() => {
    return all.filter(t => {
      const matchSearch = !search || t.title.toLowerCase().includes(search.toLowerCase());
      const matchCat    = catFilter  === 'all' || t.category_id === parseInt(catFilter, 10);
      const matchType   = typeFilter === 'all' || t.type === typeFilter;
      const matchFrom   = !dateFrom  || t.date >= dateFrom;
      const matchTo     = !dateTo    || t.date <= dateTo;
      return matchSearch && matchCat && matchType && matchFrom && matchTo;
    });
  }, [all, search, catFilter, typeFilter, dateFrom, dateTo]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleDelete = async (id: number) => {
    if (confirm('Delete this transaction?')) {
      try {
        await deleteExpenseApi(id);
        await refresh();
      } catch {
        alert('Failed to delete transaction.');
      }
    }
  };

  const exportCSV = () => {
    const rows = [
      ['Date', 'Description', 'Category', 'Type', 'Amount', 'Notes'],
      ...filtered.map(t => {
        const cat = categories.find(c => c.id === t.category_id);
        return [t.date, t.title, cat?.name || '', t.type, t.amount, t.notes];
      })
    ];
    const csv = rows.map(r => r.join(',')).join('\n');
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
    a.download = 'transactions.csv';
    a.click();
  };

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-black tracking-tight">Transactions</h1>
          <p className="text-sm text-black/50">Manage and track every transaction</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-4">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-black/30" />
            <input
              className="w-full bg-[#F5F5F5] rounded-xl pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black/10"
              placeholder="Search transactions..."
              value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
          <select
            className="bg-[#F5F5F5] rounded-xl px-3 py-2 text-sm focus:outline-none cursor-pointer min-w-[140px]"
            value={catFilter} onChange={e => { setCatFilter(e.target.value); setPage(1); }}
          >
            <option value="all">All Categories</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select
            className="bg-[#F5F5F5] rounded-xl px-3 py-2 text-sm focus:outline-none cursor-pointer min-w-[130px]"
            value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setPage(1); }}
          >
            <option value="all">All Types</option>
            <option value="expense">Expenses</option>
            <option value="income">Income</option>
          </select>
          <div className="flex items-center bg-[#F5F5F5] rounded-xl px-3 py-2 text-sm">
            <span className="text-black/40 mr-2 text-xs font-medium">From</span>
            <input type="date" className="bg-transparent focus:outline-none" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          </div>
          <div className="flex items-center bg-[#F5F5F5] rounded-xl px-3 py-2 text-sm">
            <span className="text-black/40 mr-2 text-xs font-medium">To</span>
            <input type="date" className="bg-transparent focus:outline-none" value={dateTo}   onChange={e => setDateTo(e.target.value)} />
          </div>
          <button
            onClick={exportCSV}
            className="flex items-center gap-1.5 border border-violet-600 text-violet-600 text-sm font-medium px-3 py-2 rounded-xl hover:bg-violet-50 transition-colors"
          >
            <Download className="w-3.5 h-3.5" /> Export CSV
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'TOTAL TRANSACTIONS', value: filtered.length, color: 'text-black' },
          { label: 'TOTAL EXPENSES', value: fmt(filtered.filter(t => t.type === 'expense').reduce((s,t) => s+t.amount, 0)), color: 'text-rose-500' },
          { label: 'TOTAL INCOME', value: fmt(filtered.filter(t => t.type === 'income').reduce((s,t) => s+t.amount, 0)), color: 'text-emerald-600' },
          { label: 'NET FLOW', value: fmt(filtered.reduce((s,t) => t.type === 'income' ? s+t.amount : s-t.amount, 0)), color: 'text-violet-600' }
        ].map((card, idx) => (
          <div key={idx} className="bg-white rounded-2xl p-4 border border-black/5 shadow-sm hover:-translate-y-0.5 hover:shadow-md transition-all duration-200">
            <span className="text-[10px] font-semibold text-black/40 tracking-wider mb-2 block">{card.label}</span>
            <div className={`text-xl font-bold tracking-tight ${card.color}`}>{card.value}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-black/5 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="sticky top-0 z-10 bg-white/95 backdrop-blur-md shadow-sm">
              <tr className="border-b border-black/5">
                {['Date', 'Description', 'Category', 'Type', 'Amount', 'Actions'].map(h => (
                  <th key={h} className="text-left text-[10px] font-bold text-black/50 tracking-widest uppercase px-5 py-3.5">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {paginated.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-20">
                    <div className="flex flex-col items-center justify-center">
                      <div className="w-16 h-16 bg-[#F5F5F5] rounded-2xl flex items-center justify-center mb-4 border border-black/5">
                        <Receipt className="w-8 h-8 text-black/20" />
                      </div>
                      <p className="text-base font-semibold text-black mb-1.5">No transactions found</p>
                      <p className="text-sm text-black/40 max-w-[300px] leading-relaxed mx-auto">
                        We couldn't find any transactions matching your filters. Adjust the filters or add a new transaction to get started.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : paginated.map(t => {
                const cat = categories.find(c => c.id === t.category_id) || { name: 'Other', icon: '❓', bg: '#F3F4F6' };
                return (
                  <tr key={t.id} className="hover:bg-[#F5F5F5]/50 transition-colors group">
                    <td className="px-5 py-3 text-sm text-black/50">{t.date}</td>
                    <td className="px-5 py-3 text-sm font-medium text-black">{t.title}</td>
                    <td className="px-5 py-3">
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full" style={{ background: cat.bg }}>
                        {cat.icon} {cat.name}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <span className={`text-xs font-medium px-2.5 py-1 rounded-full capitalize ${
                        t.type === 'income' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-600'
                      }`}>{t.type}</span>
                    </td>
                    <td className={`px-5 py-3 text-sm font-semibold ${t.type === 'income' ? 'text-emerald-600' : 'text-black'}`}>
                      {t.type === 'income' ? '+' : '-'}{fmt(t.amount)}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex gap-2">
                        <button onClick={() => setEditTxn(t)} className="p-1.5 text-black/40 hover:text-black rounded-lg hover:bg-black/5 transition-colors"><Edit2 className="w-3.5 h-3.5" /></button>
                        <button onClick={() => handleDelete(t.id)} className="p-1.5 text-black/40 hover:text-rose-500 rounded-lg hover:bg-rose-50 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-black/5">
            <span className="text-xs text-black/40">
              Showing {(page-1)*PAGE_SIZE+1}–{Math.min(page*PAGE_SIZE, filtered.length)} of {filtered.length}
            </span>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage(p => Math.max(p-1,1))} disabled={page===1} className="p-1.5 rounded-lg text-black/40 hover:text-black disabled:opacity-30">
                <ChevronLeft className="w-4 h-4" />
              </button>
              {Array.from({length: totalPages}, (_, i) => i+1).map(p => (
                <button key={p} onClick={() => setPage(p)}
                  className={`w-7 h-7 rounded-lg text-xs font-medium transition-colors ${p===page ? 'bg-black text-white' : 'text-black/50 hover:bg-black/5'}`}
                >{p}</button>
              ))}
              <button onClick={() => setPage(p => Math.min(p+1,totalPages))} disabled={page===totalPages} className="p-1.5 rounded-lg text-black/40 hover:text-black disabled:opacity-30">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      <AddTransactionModal
        isOpen={modalOpen || !!editTxn}
        onClose={() => { setModalOpen(false); setEditTxn(null); }}
        editTxn={editTxn}
        onSaved={refresh}
      />
    </div>
  );
}
