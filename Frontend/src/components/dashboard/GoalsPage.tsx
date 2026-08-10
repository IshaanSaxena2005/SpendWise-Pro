import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Target, Plus, Edit2, Trash2, Trophy, TrendingUp,
  CheckCircle, Clock, AlertTriangle, X, Zap,
  Star, BarChart3, PieChart
} from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Cell
} from 'recharts';
import { goalsAPI, type Goal } from '../../lib/api';
import { getUser } from '../../lib/auth';
import { DEMO_EMAIL } from '../../lib/constants';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return '₹' + Math.floor(n).toLocaleString('en-IN');
}

function daysFromNow(targetDate: string): number {
  const diff = new Date(targetDate).getTime() - new Date().getTime();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

const PRIORITY_CONFIG = {
  High:   { bg: 'bg-rose-50',    text: 'text-rose-700 border-rose-100',   dot: 'bg-rose-500'   },
  Medium: { bg: 'bg-amber-50',   text: 'text-amber-700 border-amber-100',  dot: 'bg-amber-500'  },
  Low:    { bg: 'bg-emerald-50', text: 'text-emerald-700 border-emerald-100', dot: 'bg-emerald-500' },
};

const ICON_OPTIONS = ['🎯','📱','✈️','🛡️','💻','🎮','🚗','🏠','📚','🎵','💍','🏋️','💰','🌟','🎁','🏖️'];
const CATEGORIES   = ['Technology','Travel','Emergency','Education','Vehicle','Home','Entertainment','Health','Savings','Other'];

// ─── Confetti ─────────────────────────────────────────────────────────────────

function Confetti({ active, onDone }: { active: boolean; onDone: () => void }) {
  const COLORS = ['#8B5CF6','#3B82F6','#10B981','#F59E0B','#EF4444','#EC4899','#F97316','#06B6D4'];
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (active) {
      timerRef.current = setTimeout(onDone, 2500);
    }
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [active, onDone]);

  if (!active) return null;
  return (
    <div className="fixed inset-0 pointer-events-none z-[9999] overflow-hidden">
      {Array.from({ length: 48 }).map((_, i) => (
        <div
          key={i}
          className="confetti-particle absolute"
          style={{
            left: `${Math.random() * 100}vw`,
            top: `-${8 + Math.random() * 20}px`,
            backgroundColor: COLORS[i % COLORS.length],
            animationName: 'confettiFall',
            animationDuration: `${1.2 + Math.random() * 1.3}s`,
            animationTimingFunction: 'linear',
            animationDelay: `${Math.random() * 0.6}s`,
            width: `${6 + Math.random() * 6}px`,
            height: `${6 + Math.random() * 6}px`,
            borderRadius: Math.random() > 0.5 ? '50%' : '2px',
          }}
        />
      ))}
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function GoalSkeleton() {
  return (
    <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-5 animate-pulse">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-12 h-12 bg-black/5 rounded-xl" />
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-black/5 rounded-lg w-32" />
          <div className="h-3 bg-black/5 rounded-lg w-20" />
        </div>
        <div className="h-5 w-12 bg-black/5 rounded-full" />
      </div>
      <div className="flex items-center gap-4 mb-4">
        <div className="w-16 h-16 bg-black/5 rounded-full" />
        <div className="flex-1 space-y-2">
          <div className="h-3 bg-black/5 rounded w-28" />
          <div className="h-3 bg-black/5 rounded w-20" />
        </div>
      </div>
      <div className="h-20 bg-black/5 rounded-xl mb-3" />
      <div className="h-3 bg-black/5 rounded w-24" />
    </div>
  );
}

function ProgressRing({ percentage, size = 64, strokeWidth = 6 }: { percentage: number; size?: number; strokeWidth?: number }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (Math.min(100, Math.max(0, percentage)) / 100) * circumference;

  const colorClass = 
    percentage >= 100 ? 'stroke-emerald-500' :
    percentage >= 75  ? 'stroke-violet-500' :
    percentage >= 50  ? 'stroke-blue-500' :
    percentage >= 25  ? 'stroke-amber-500' : 'stroke-rose-500';

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg className="transform -rotate-90 w-full h-full">
        {/* Background ring */}
        <circle
          className="stroke-black/[0.04]"
          fill="transparent"
          strokeWidth={strokeWidth}
          r={radius}
          cx={size / 2}
          cy={size / 2}
        />
        {/* Progress ring */}
        <circle
          className={`transition-all duration-1000 ease-out ${colorClass}`}
          fill="transparent"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          r={radius}
          cx={size / 2}
          cy={size / 2}
        />
      </svg>
      <span className="absolute text-xs font-bold text-black">{Math.round(percentage)}%</span>
    </div>
  );
}

// ─── Goal Modal ───────────────────────────────────────────────────────────────

interface GoalModalProps {
  goal: Goal | null;
  onClose: () => void;
  onSave: (data: Partial<Goal>) => Promise<void>;
  saving: boolean;
}

function GoalModal({ goal, onClose, onSave, saving }: GoalModalProps) {
  const isEdit = !!goal;
  const [form, setForm] = useState({
    name: goal?.title || goal?.name || '',
    icon: goal?.icon ?? '🎯',
    category: goal?.category ?? '',
    target_amount: goal?.target_amount?.toString() ?? '',
    saved_amount: (goal?.current_amount ?? goal?.saved_amount ?? 0).toString(),
    monthly_contribution: goal?.monthly_contribution?.toString() ?? '0',
    target_date: goal?.target_date ? goal.target_date.substring(0, 10) : '',
    priority: goal?.priority ?? 'Medium' as 'High'|'Medium'|'Low',
    notes: goal?.notes ?? '',
  });

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetAmount = parseFloat(form.target_amount);
    if (targetAmount <= 0) {
      alert('Target amount must be greater than 0');
      return;
    }
    if (targetAmount > 100000000) {
      alert('Target amount cannot exceed ₹10 Crore');
      return;
    }
    
    await onSave({
      name: form.name,
      title: form.name,
      icon: form.icon,
      category: form.category || undefined,
      target_amount: targetAmount,
      saved_amount: parseFloat(form.saved_amount) || 0,
      monthly_contribution: parseFloat(form.monthly_contribution) || 0,
      target_date: form.target_date,
      priority: form.priority,
      notes: form.notes || undefined,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white/90 backdrop-blur-xl rounded-2xl shadow-2xl w-full max-w-lg max-h-[calc(100vh-32px)] flex flex-col overflow-hidden border border-white/20">
        <div className="flex items-center justify-between px-6 py-5 border-b border-black/5 shrink-0">
          <h2 className="font-bold text-black text-base">{isEdit ? 'Edit Goal' : 'New Goal'}</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-black/5 rounded-lg transition-colors">
            <X className="w-4 h-4 text-black/60" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col h-full overflow-hidden">
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {/* Icon picker */}
            <div>
              <label className="text-xs font-semibold text-black/50 uppercase tracking-widest block mb-2">Icon</label>
              <div className="flex flex-wrap gap-2">
                {ICON_OPTIONS.map(ic => (
                  <button key={ic} type="button"
                    onClick={() => set('icon', ic)}
                    className={`w-9 h-9 rounded-xl text-lg flex items-center justify-center transition-all ${form.icon === ic ? 'ring-2 ring-violet-500 bg-violet-50 scale-110 shadow-sm' : 'bg-black/5 hover:bg-black/10'}`}>
                    {ic}
                  </button>
                ))}
              </div>
            </div>

            {/* Name */}
            <div>
              <label className="text-xs font-semibold text-black/50 uppercase tracking-widest block mb-1.5">Goal Name *</label>
              <input required value={form.name} onChange={e => set('name', e.target.value)}
                placeholder="e.g. iPhone 16 Pro"
                className="w-full px-4 py-2.5 rounded-xl border border-black/10 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/* Target Amount */}
              <div>
                <label className="text-xs font-semibold text-black/50 uppercase tracking-widest block mb-1.5">Target Amount *</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-black/40 text-sm font-medium">₹</span>
                  <input required type="number" min="1" value={form.target_amount} onChange={e => set('target_amount', e.target.value)}
                    placeholder="110000"
                    className="w-full pl-7 pr-4 py-2.5 rounded-xl border border-black/10 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400" />
                </div>
              </div>

              {/* Saved Amount */}
              <div>
                <label className="text-xs font-semibold text-black/50 uppercase tracking-widest block mb-1.5">Already Saved</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-black/40 text-sm font-medium">₹</span>
                  <input type="number" min="0" value={form.saved_amount} onChange={e => set('saved_amount', e.target.value)}
                    className="w-full pl-7 pr-4 py-2.5 rounded-xl border border-black/10 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400" />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/* Monthly Contribution */}
              <div>
                <label className="text-xs font-semibold text-black/50 uppercase tracking-widest block mb-1.5">Monthly Savings</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-black/40 text-sm font-medium">₹</span>
                  <input type="number" min="0" value={form.monthly_contribution} onChange={e => set('monthly_contribution', e.target.value)}
                    className="w-full pl-7 pr-4 py-2.5 rounded-xl border border-black/10 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400" />
                </div>
              </div>

              {/* Target Date */}
              <div>
                <label className="text-xs font-semibold text-black/50 uppercase tracking-widest block mb-1.5">Target Date *</label>
                <input required type="date" value={form.target_date} onChange={e => set('target_date', e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-black/10 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/* Category */}
              <div>
                <label className="text-xs font-semibold text-black/50 uppercase tracking-widest block mb-1.5">Category</label>
                <select value={form.category} onChange={e => set('category', e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-black/10 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400 bg-white">
                  <option value="">Select…</option>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              {/* Priority */}
              <div>
                <label className="text-xs font-semibold text-black/50 uppercase tracking-widest block mb-1.5">Priority</label>
                <select value={form.priority} onChange={e => set('priority', e.target.value as 'High'|'Medium'|'Low')}
                  className="w-full px-4 py-2.5 rounded-xl border border-black/10 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400 bg-white">
                  <option value="High">🔴 High</option>
                  <option value="Medium">🟡 Medium</option>
                  <option value="Low">🟢 Low</option>
                </select>
              </div>
            </div>

            {/* Notes / Purpose */}
            <div>
              <label className="text-xs font-semibold text-black/50 uppercase tracking-widest block mb-1.5">Purpose / Notes</label>
              <textarea rows={2} value={form.notes} onChange={e => set('notes', e.target.value)}
                placeholder="e.g. Family vacation to Goa in December"
                className="w-full px-4 py-2.5 rounded-xl border border-black/10 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400 resize-none" />
            </div>
          </div>

          <div className="flex gap-3 p-6 pt-2 border-t border-black/5 shrink-0 bg-black/[0.01]">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-black/10 text-sm font-semibold text-black/60 hover:bg-black/5 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 py-2.5 rounded-xl bg-black text-white text-sm font-semibold hover:bg-gray-900 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              {saving ? 'Saving…' : isEdit ? 'Update Goal' : 'Create Goal'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Update Saved Modal ────────────────────────────────────────────────────────

function UpdateSavedModal({ goal, onClose, onSave, saving }: {
  goal: Goal;
  onClose: () => void;
  onSave: (newSaved: number, monthly: number) => Promise<void>;
  saving: boolean;
}) {
  const [saved, setSaved] = useState((goal.current_amount ?? goal.saved_amount).toString());
  const [monthly, setMonthly] = useState(goal.monthly_contribution.toString());
  const progress = ((parseFloat(saved) || 0) / goal.target_amount) * 100;

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white/95 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden border border-black/5">
        <div className="flex items-center justify-between px-6 py-5 border-b border-black/5 shrink-0">
          <div>
            <h2 className="font-bold text-black text-base">Update Savings</h2>
            <p className="text-xs text-black/55 mt-0.5">{goal.icon} {goal.title || goal.name}</p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-black/5 rounded-lg transition-colors">
            <X className="w-4 h-4 text-black/60" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="text-xs font-semibold text-black/50 uppercase tracking-widest block mb-1.5">Current Saved Amount</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-black/40 text-sm font-medium">₹</span>
              <input type="number" min="0" max={goal.target_amount} value={saved} onChange={e => setSaved(e.target.value)}
                className="w-full pl-7 pr-4 py-2.5 rounded-xl border border-black/10 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400" />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-black/50 uppercase tracking-widest block mb-1.5">Monthly Contribution</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-black/40 text-sm font-medium">₹</span>
              <input type="number" min="0" value={monthly} onChange={e => setMonthly(e.target.value)}
                className="w-full pl-7 pr-4 py-2.5 rounded-xl border border-black/10 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400" />
            </div>
          </div>

          <div className="p-3 bg-black/[0.02] rounded-xl border border-black/5">
            <div className="flex justify-between text-xs mb-1.5">
              <span className="text-black/50">Progress preview</span>
              <span className="font-bold text-black">{progress.toFixed(1)}%</span>
            </div>
            <div className="w-full h-2 bg-black/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-violet-500 rounded-full transition-all duration-300"
                style={{ width: `${Math.min(progress, 100)}%` }}
              />
            </div>
          </div>
        </div>

        <div className="flex gap-3 p-6 pt-0 shrink-0">
          <button type="button" onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-black/10 text-sm font-semibold text-black/60 hover:bg-black/5 transition-colors">
            Cancel
          </button>
          <button type="button" onClick={() => onSave(parseFloat(saved) || 0, parseFloat(monthly) || 0)} disabled={saving}
            className="flex-1 py-2.5 rounded-xl bg-black text-white text-sm font-semibold hover:bg-gray-900 transition-colors disabled:opacity-50">
            {saving ? 'Saving…' : 'Update'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Goal Card Component ───────────────────────────────────────────────────────

interface GoalCardProps {
  goal: Goal;
  index: number;
  onEdit: (g: Goal) => void;
  onDelete: (id: number) => void;
  onUpdateSaved: (goal: Goal) => void;
  isDemo: boolean;
}

function GoalCard({ goal, index, onEdit, onDelete, onUpdateSaved, isDemo }: GoalCardProps) {
  const current = goal.current_amount ?? goal.saved_amount;
  const progress = goal.progress_percentage ?? 0;
  const remaining = Math.max(0, goal.target_amount - current);
  const daysLeft = daysFromNow(goal.target_date);
  const estCompletion = goal.ai_insights?.estimated_completion_date
    ? new Date(goal.ai_insights.estimated_completion_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    : 'Never';

  const pcfg = PRIORITY_CONFIG[goal.priority];

  return (
    <div
      className="bg-white/80 backdrop-blur-md rounded-2xl border border-black/5 shadow-sm hover:shadow-lg transition-all duration-300 p-5 flex flex-col justify-between relative group overflow-hidden"
      style={{ animationDelay: `${index * 0.05}s` }}
    >
      <div>
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-to-br from-violet-50 to-indigo-50 border border-violet-100/50 rounded-xl flex items-center justify-center text-2xl">
              {goal.icon || '🎯'}
            </div>
            <div>
              <h3 className="font-bold text-black text-sm leading-tight">{goal.title || goal.name}</h3>
              <span className="text-[10px] text-black/40 font-semibold uppercase tracking-wider">{goal.category || 'Goal'}</span>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${pcfg.bg} ${pcfg.text}`}>
              {goal.priority}
            </span>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
              goal.status === 'Completed' ? 'bg-emerald-100 text-emerald-700' :
              goal.status === 'Overdue' ? 'bg-rose-100 text-rose-700' : 'bg-blue-100 text-blue-700'
            }`}>
              {goal.status}
            </span>
          </div>
        </div>

        {/* Dynamic Progress Ring & remaining content */}
        <div className="flex items-center gap-4 mb-4">
          <ProgressRing percentage={progress} size={70} strokeWidth={7} />
          <div className="space-y-1">
            <p className="text-xs text-black/50">
              Saved <span className="font-bold text-black">{fmt(current)}</span> of {fmt(goal.target_amount)}
            </p>
            {remaining > 0 ? (
              <p className="text-xs text-rose-600 font-semibold">{fmt(remaining)} remaining</p>
            ) : (
              <p className="text-xs text-emerald-600 font-bold flex items-center gap-1">🎉 Completed!</p>
            )}
            {(goal.linked_count ?? 0) > 0 && (
              <p className="text-[10px] text-violet-600/90 font-medium flex items-center gap-1">
                <TrendingUp className="w-3 h-3" />
                Includes {fmt(goal.linked_amount ?? 0)} from {goal.linked_count} linked transaction{goal.linked_count === 1 ? '' : 's'}
              </p>
            )}
          </div>
        </div>

        {/* AI Insight Box inside Card */}
        {goal.ai_insights && (
          <div className="bg-violet-50/50 border border-violet-100/50 rounded-xl p-3 mb-4 space-y-1.5">
            <div className="flex items-center gap-1 text-[10px] font-bold text-violet-700 uppercase tracking-wide">
              <Zap className="w-3 h-3" /> AI Insights
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs text-black/60">
              <div>
                <span className="block text-[10px] text-black/40 uppercase">Est. Finish</span>
                <span className="font-semibold text-black">{estCompletion}</span>
              </div>
              <div>
                <span className="block text-[10px] text-black/40 uppercase">Need / Month</span>
                <span className="font-semibold text-black">{fmt(goal.ai_insights.amount_needed_per_month)}</span>
              </div>
            </div>
            {goal.ai_insights.suggestions.length > 0 && (
              <p className="text-[10px] text-violet-600/90 font-medium leading-relaxed pt-1 border-t border-violet-100/60">
                💡 {goal.ai_insights.suggestions[0]}
              </p>
            )}
          </div>
        )}
      </div>

      <div className="pt-3 border-t border-black/5 mt-auto flex items-center justify-between">
        <div className="text-xs text-black/40 flex items-center gap-1">
          <Clock className="w-3 h-3" />
          <span>{daysLeft} days left</span>
        </div>
        {!isDemo && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => onUpdateSaved(goal)}
              className="px-3 py-1.5 rounded-lg bg-black text-white hover:bg-gray-900 text-xs font-semibold transition-colors">
              Update
            </button>
            <button onClick={() => onEdit(goal)}
              className="p-1.5 rounded-lg hover:bg-black/5 text-black/50 hover:text-black transition-colors">
              <Edit2 className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => onDelete(goal.id)}
              className="p-1.5 rounded-lg hover:bg-rose-50 text-rose-400 hover:text-rose-600 transition-colors">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Page Component ───────────────────────────────────────────────────────

export function GoalsPage() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editGoal, setEditGoal] = useState<Goal | null>(null);
  const [updateGoal, setUpdateGoal] = useState<Goal | null>(null);
  const [saving, setSaving] = useState(false);
  const [confetti, setConfetti] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  const user = getUser();
  const isDemo = (user?.email ?? '') === DEMO_EMAIL;

  const fetchGoals = useCallback(async () => {
    try {
      const res = await goalsAPI.getAll();
      setGoals(res.data.goals || []);
    } catch {
      showToast('error', 'Failed to load goals');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchGoals(); }, [fetchGoals]);

  function showToast(type: 'success' | 'error', msg: string) {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3500);
  }

  const handleSaveGoal = async (data: Partial<Goal>) => {
    setSaving(true);
    try {
      if (editGoal) {
        await goalsAPI.update(editGoal.id, data as Parameters<typeof goalsAPI.update>[1]);
        showToast('success', 'Goal updated!');
        setEditGoal(null);
      } else {
        await goalsAPI.add(data as Parameters<typeof goalsAPI.add>[0]);
        showToast('success', 'Goal created!');
        setShowAddModal(false);
      }
      await fetchGoals();
    } catch {
      showToast('error', 'Something went wrong. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateSaved = async (newSaved: number, monthly: number) => {
    if (!updateGoal) return;
    setSaving(true);
    const wasCompleted = updateGoal.is_completed;
    const willComplete = newSaved >= updateGoal.target_amount;
    try {
      await goalsAPI.update(updateGoal.id, {
        saved_amount: newSaved,
        monthly_contribution: monthly,
        is_completed: willComplete,
      });
      if (willComplete && !wasCompleted) {
        setConfetti(true);
        showToast('success', `🎉 "${updateGoal.title || updateGoal.name}" completed!`);
      } else {
        showToast('success', 'Savings updated!');
      }
      setUpdateGoal(null);
      await fetchGoals();
    } catch {
      showToast('error', 'Something went wrong. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this goal?')) return;
    try {
      await goalsAPI.delete(id);
      showToast('success', 'Goal deleted.');
      await fetchGoals();
    } catch {
      showToast('error', 'Failed to delete goal.');
    }
  };

  // ── KPIs ──────────────────────────────────────────────────────────────────────
  const totalGoals     = goals.length;
  const completedGoals = goals.filter(g => g.status === 'Completed').length;
  const totalSaved     = goals.reduce((s, g) => s + (g.current_amount ?? g.saved_amount), 0);
  const totalTarget    = goals.reduce((s, g) => s + g.target_amount, 0);
  const overallPct     = totalTarget > 0 ? (totalSaved / totalTarget) * 100 : 0;

  const kpis = [
    { label: 'Total Goals',   value: totalGoals,             sub: 'active & completed',  icon: Target,       grad: 'from-violet-50 to-indigo-50', iconColor: 'text-violet-600', fmt: false },
    { label: 'Completed',     value: completedGoals,         sub: `${totalGoals - completedGoals} in progress`,     icon: Trophy,       grad: 'from-emerald-50 to-teal-50',  iconColor: 'text-emerald-600', fmt: false },
    { label: 'Total Saved',   value: totalSaved,             sub: 'across all goals',    icon: TrendingUp,   grad: 'from-blue-50 to-cyan-50',     iconColor: 'text-blue-600', fmt: true },
    { label: 'Total Target',  value: totalTarget,            sub: 'combined target',     icon: Star,         grad: 'from-amber-50 to-orange-50',  iconColor: 'text-amber-600', fmt: true },
    { label: 'Overall Pct',   value: overallPct,             sub: 'progress',            icon: CheckCircle,  grad: 'from-rose-50 to-pink-50',     iconColor: 'text-rose-600', fmt: false, isPct: true },
  ];

  // Prepare chart data dynamically
  const progressChartData = goals.map(g => ({
    name: g.title || g.name,
    Saved: g.current_amount ?? g.saved_amount,
    Target: g.target_amount,
  }));

  const contributionChartData = goals.map(g => ({
    name: g.title || g.name,
    Contribution: g.monthly_contribution,
  }));

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <Confetti active={confetti} onDone={() => setConfetti(false)} />

      {toast && (
        <div className={`fixed top-6 left-1/2 -translate-x-1/2 z-[9990] px-5 py-3 rounded-full shadow-xl flex items-center gap-2 text-sm font-semibold transition-all animate-in fade-in slide-in-from-top-4 duration-300 ${
          toast.type === 'success' ? 'bg-emerald-50 border border-emerald-200 text-emerald-800' : 'bg-rose-50 border border-rose-200 text-rose-800'
        }`}>
          {toast.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
          {toast.msg}
        </div>
      )}

      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-black tracking-tight flex items-center gap-2">
            <span className="category-emoji">🎯</span> Smart Financial Goals
          </h1>
          <p className="text-sm text-black/50 mt-1">AI-powered tracking, estimates, and dynamic progress calculation.</p>
        </div>
        {!isDemo && (
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 bg-black text-white text-sm font-semibold px-5 py-2.5 rounded-full hover:bg-gray-900 transition-colors shadow-sm hover:shadow-md">
            <Plus className="w-4 h-4" />
            <span>New Goal</span>
          </button>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {kpis.map((k) => {
          const Icon = k.icon;
          return (
            <div key={k.label} className={`bg-gradient-to-br ${k.grad} rounded-2xl p-4 border border-black/5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-300`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold text-black/40 uppercase tracking-widest">{k.label}</span>
                <div className="w-7 h-7 bg-white/60 rounded-lg flex items-center justify-center">
                  <Icon className={`w-3.5 h-3.5 ${k.iconColor}`} />
                </div>
              </div>
              <div className="text-xl font-extrabold text-black tracking-tight">
                {loading ? '—' : k.isPct ? `${overallPct.toFixed(1)}%` : k.fmt ? fmt(k.value) : k.value}
              </div>
              <p className="text-[10px] text-black/40 font-medium mt-0.5">{k.sub}</p>
            </div>
          );
        })}
      </div>

      {/* Demo Banner */}
      {isDemo && (
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <Clock className="w-4 h-4 text-amber-600 shrink-0" />
          <p className="text-sm text-amber-800 font-medium">
            You're viewing demo goals (read-only). <Link to="/dashboard" className="underline font-semibold">Create your own account</Link> to manage personal goals.
          </p>
        </div>
      )}

      {/* Charts Section */}
      {goals.length > 0 && !loading && (
        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-white rounded-2xl border border-black/5 p-5 shadow-sm">
            <h3 className="text-sm font-bold text-black mb-4 flex items-center gap-1.5">
              <PieChart className="w-4 h-4 text-violet-500" /> Progress vs Targets
            </h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={progressChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorSaved" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                  <XAxis dataKey="name" stroke="#9CA3AF" fontSize={10} />
                  <YAxis stroke="#9CA3AF" fontSize={10} />
                  <Tooltip formatter={(value) => ['₹' + Number(value).toLocaleString('en-IN')]} />
                  <Area type="monotone" dataKey="Saved" stroke="#8B5CF6" strokeWidth={2} fillOpacity={1} fill="url(#colorSaved)" />
                  <Area type="monotone" dataKey="Target" stroke="#D1D5DB" strokeDasharray="5 5" fill="none" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-black/5 p-5 shadow-sm">
            <h3 className="text-sm font-bold text-black mb-4 flex items-center gap-1.5">
              <BarChart3 className="w-4 h-4 text-emerald-500" /> Monthly Contributions
            </h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={contributionChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                  <XAxis dataKey="name" stroke="#9CA3AF" fontSize={10} />
                  <YAxis stroke="#9CA3AF" fontSize={10} />
                  <Tooltip formatter={(value) => ['₹' + Number(value).toLocaleString('en-IN')]} />
                  <Bar dataKey="Contribution" fill="#10B981" radius={[4, 4, 0, 0]}>
                    {contributionChartData.map((_entry, index) => (
                      <Cell key={`cell-${index}`} fill={index % 2 === 0 ? '#10B981' : '#3B82F6'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* Goals Grid */}
      {loading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-2 gap-4">
          {[1,2,3,4].map(i => <GoalSkeleton key={i} />)}
        </div>
      ) : goals.length === 0 ? (
        <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-12 flex flex-col items-center text-center">
          <div className="w-20 h-20 bg-gradient-to-br from-violet-100 to-indigo-100 rounded-2xl flex items-center justify-center text-4xl mb-5">
            🎯
          </div>
          <h2 className="text-lg font-bold text-black mb-2">No goals yet</h2>
          <p className="text-sm text-black/50 max-w-xs mb-6">
            Start tracking your savings goals — from gadgets and vacations to an emergency fund.
          </p>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 bg-black text-white text-sm font-semibold px-6 py-3 rounded-full hover:bg-gray-900 transition-colors">
            <Plus className="w-4 h-4" /> Create your first goal
          </button>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {goals.map((g, idx) => (
            <GoalCard
              key={g.id}
              goal={g}
              index={idx}
              onEdit={setEditGoal}
              onDelete={handleDelete}
              onUpdateSaved={setUpdateGoal}
              isDemo={isDemo}
            />
          ))}
        </div>
      )}

      {/* Modals */}
      {(showAddModal || editGoal) && (
        <GoalModal
          goal={editGoal}
          onClose={() => { setShowAddModal(false); setEditGoal(null); }}
          onSave={handleSaveGoal}
          saving={saving}
        />
      )}
      {updateGoal && (
        <UpdateSavedModal
          goal={updateGoal}
          onClose={() => setUpdateGoal(null)}
          onSave={handleUpdateSaved}
          saving={saving}
        />
      )}
    </div>
  );
}
