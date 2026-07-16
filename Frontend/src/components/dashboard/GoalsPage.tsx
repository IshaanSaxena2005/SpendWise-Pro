import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Target, Plus, Edit2, Trash2, Trophy, TrendingUp, Calendar,
  CheckCircle, Clock, AlertTriangle, X, ChevronRight, Zap,
  ArrowUp, Minus, Star,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { goalsAPI, type Goal } from '../../lib/api';
import { getUser } from '../../lib/auth';
import { DEMO_EMAIL } from '../../lib/constants';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return '₹' + Math.floor(n).toLocaleString('en-IN');
}

function monthsFromNow(targetDate: string): number {
  const now = new Date();
  const tgt = new Date(targetDate);
  return (tgt.getFullYear() - now.getFullYear()) * 12 + (tgt.getMonth() - now.getMonth());
}

function estimatedCompletion(saved: number, target: number, monthly: number): string {
  if (monthly <= 0) return 'Not set';
  const remaining = target - saved;
  if (remaining <= 0) return 'Completed!';
  const months = Math.ceil(remaining / monthly);
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function requiredMonthly(saved: number, target: number, targetDate: string): number {
  const months = monthsFromNow(targetDate);
  if (months <= 0) return 0;
  return Math.max(0, (target - saved) / months);
}

function pct(saved: number, target: number): number {
  if (target <= 0) return 0;
  return Math.min(100, (saved / target) * 100);
}

const PRIORITY_CONFIG = {
  High:   { bg: 'bg-rose-100',   text: 'text-rose-700',   dot: 'bg-rose-500'   },
  Medium: { bg: 'bg-amber-100',  text: 'text-amber-700',  dot: 'bg-amber-500'  },
  Low:    { bg: 'bg-emerald-100',text: 'text-emerald-700',dot: 'bg-emerald-500' },
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
    <>
      {Array.from({ length: 48 }).map((_, i) => (
        <div
          key={i}
          className="confetti-particle"
          style={{
            left: `${Math.random() * 100}vw`,
            top: `-${8 + Math.random() * 20}px`,
            backgroundColor: COLORS[i % COLORS.length],
            animationDuration: `${1.2 + Math.random() * 1.3}s`,
            animationDelay: `${Math.random() * 0.6}s`,
            width: `${6 + Math.random() * 6}px`,
            height: `${6 + Math.random() * 6}px`,
            borderRadius: Math.random() > 0.5 ? '50%' : '2px',
          }}
        />
      ))}
    </>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function GoalSkeleton() {
  return (
    <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-5 animate-pulse">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 bg-black/5 rounded-xl" />
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-black/5 rounded-lg w-32" />
          <div className="h-3 bg-black/5 rounded-lg w-20" />
        </div>
        <div className="h-5 w-12 bg-black/5 rounded-full" />
      </div>
      <div className="h-2 bg-black/5 rounded-full mb-3" />
      <div className="grid grid-cols-3 gap-2 mb-4">
        {[0,1,2].map(i => <div key={i} className="h-16 bg-black/5 rounded-xl" />)}
      </div>
      <div className="h-3 bg-black/5 rounded w-40" />
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
    name: goal?.name ?? '',
    icon: goal?.icon ?? '🎯',
    category: goal?.category ?? '',
    target_amount: goal?.target_amount?.toString() ?? '',
    saved_amount: goal?.saved_amount?.toString() ?? '0',
    monthly_contribution: goal?.monthly_contribution?.toString() ?? '0',
    target_date: goal?.target_date ?? '',
    priority: goal?.priority ?? 'Medium' as 'High'|'Medium'|'Low',
    notes: goal?.notes ?? '',
  });

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSave({
      name: form.name,
      icon: form.icon,
      category: form.category || undefined,
      target_amount: parseFloat(form.target_amount),
      saved_amount: parseFloat(form.saved_amount) || 0,
      monthly_contribution: parseFloat(form.monthly_contribution) || 0,
      target_date: form.target_date,
      priority: form.priority,
      notes: form.notes || undefined,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-5 border-b border-black/5">
          <h2 className="font-bold text-black text-base">{isEdit ? 'Edit Goal' : 'New Goal'}</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-black/5 rounded-lg transition-colors">
            <X className="w-4 h-4 text-black/60" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Icon picker */}
          <div>
            <label className="text-xs font-semibold text-black/50 uppercase tracking-widest block mb-2">Icon</label>
            <div className="flex flex-wrap gap-2">
              {ICON_OPTIONS.map(ic => (
                <button key={ic} type="button"
                  onClick={() => set('icon', ic)}
                  className={`w-9 h-9 rounded-xl text-lg flex items-center justify-center category-emoji transition-all ${form.icon === ic ? 'ring-2 ring-violet-500 bg-violet-50' : 'bg-black/5 hover:bg-black/10'}`}>
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

          {/* Notes */}
          <div>
            <label className="text-xs font-semibold text-black/50 uppercase tracking-widest block mb-1.5">Notes</label>
            <textarea rows={2} value={form.notes} onChange={e => set('notes', e.target.value)}
              placeholder="Optional notes about this goal…"
              className="w-full px-4 py-2.5 rounded-xl border border-black/10 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400 resize-none" />
          </div>

          <div className="flex gap-3 pt-2">
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

// ─── Goal Card ─────────────────────────────────────────────────────────────────

interface GoalCardProps {
  goal: Goal;
  index: number;
  onEdit: (g: Goal) => void;
  onDelete: (id: number) => void;
  onUpdateSaved: (goal: Goal) => void;
  isDemo: boolean;
}

function GoalCard({ goal, index, onEdit, onDelete, onUpdateSaved, isDemo }: GoalCardProps) {
  const progress = pct(goal.saved_amount, goal.target_amount);
  const remaining = Math.max(0, goal.target_amount - goal.saved_amount);
  const needMonthly = requiredMonthly(goal.saved_amount, goal.target_amount, goal.target_date);
  const estCompletion = estimatedCompletion(goal.saved_amount, goal.target_amount, goal.monthly_contribution);
  const monthsLeft = monthsFromNow(goal.target_date);
  const isOnTrack = goal.monthly_contribution >= needMonthly;
  const pcfg = PRIORITY_CONFIG[goal.priority];

  const progressBarColor =
    progress >= 100 ? 'bg-emerald-500' :
    progress >= 75  ? 'bg-violet-500' :
    progress >= 50  ? 'bg-blue-500' :
    progress >= 25  ? 'bg-amber-500' : 'bg-rose-500';

  return (
    <div
      className="goal-card-in bg-white rounded-2xl border border-black/5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 overflow-hidden"
      style={{ animationDelay: `${index * 0.07}s` }}
    >
      {/* Header */}
      <div className="p-5 pb-0">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 bg-gradient-to-br from-violet-50 to-indigo-50 rounded-xl flex items-center justify-center text-2xl category-emoji border border-black/5">
              {goal.icon || '🎯'}
            </div>
            <div>
              <h3 className="font-bold text-black text-sm leading-tight">{goal.name}</h3>
              {goal.category && <p className="text-xs text-black/40 font-medium mt-0.5">{goal.category}</p>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${pcfg.bg} ${pcfg.text}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${pcfg.dot}`} />
              {goal.priority}
            </span>
            {goal.is_completed && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 flex items-center gap-1">
                <CheckCircle className="w-2.5 h-2.5" />
                Done
              </span>
            )}
          </div>
        </div>

        {/* Progress bar */}
        <div className="mb-2">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-semibold text-black/60">{fmt(goal.saved_amount)} saved</span>
            <span className="text-xs font-bold text-black">{progress.toFixed(1)}%</span>
          </div>
          <div className="w-full h-2.5 bg-black/5 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full progress-bar-animate ${progressBarColor}`}
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex justify-between mt-1.5">
            <span className="text-[10px] text-black/40">₹0</span>
            <span className="text-[10px] text-black/40">{fmt(goal.target_amount)}</span>
          </div>
        </div>

        {/* Remaining */}
        {!goal.is_completed && remaining > 0 && (
          <p className="text-xs text-black/50 mb-4">
            <span className="font-semibold text-black">{fmt(remaining)}</span> remaining
          </p>
        )}
      </div>

      {/* Rate comparison cards */}
      {!goal.is_completed && (
        <div className="px-5 pb-4">
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-blue-50 rounded-xl p-3 border border-blue-100/60">
              <p className="text-[9px] font-bold text-blue-600/70 uppercase tracking-wider mb-1">Current Rate</p>
              <p className="text-sm font-bold text-blue-700">{fmt(goal.monthly_contribution)}</p>
              <p className="text-[9px] text-blue-500/70 font-medium">/month</p>
            </div>
            <div className={`rounded-xl p-3 border ${isOnTrack ? 'bg-emerald-50 border-emerald-100/60' : 'bg-amber-50 border-amber-100/60'}`}>
              <p className={`text-[9px] font-bold uppercase tracking-wider mb-1 ${isOnTrack ? 'text-emerald-600/70' : 'text-amber-600/70'}`}>Need</p>
              <p className={`text-sm font-bold ${isOnTrack ? 'text-emerald-700' : 'text-amber-700'}`}>{fmt(needMonthly)}</p>
              <p className={`text-[9px] font-medium ${isOnTrack ? 'text-emerald-500/70' : 'text-amber-500/70'}`}>/month</p>
            </div>
            <div className={`rounded-xl p-3 border ${isOnTrack ? 'bg-emerald-50 border-emerald-100/60' : 'bg-rose-50 border-rose-100/60'}`}>
              <p className={`text-[9px] font-bold uppercase tracking-wider mb-1 ${isOnTrack ? 'text-emerald-600/70' : 'text-rose-600/70'}`}>Diff</p>
              <div className="flex items-center gap-0.5">
                {isOnTrack
                  ? <ArrowUp className="w-3 h-3 text-emerald-600" />
                  : <Minus className="w-3 h-3 text-rose-600" />}
                <p className={`text-sm font-bold ${isOnTrack ? 'text-emerald-700' : 'text-rose-700'}`}>
                  {fmt(Math.abs(needMonthly - goal.monthly_contribution))}
                </p>
              </div>
              <p className={`text-[9px] font-medium ${isOnTrack ? 'text-emerald-500/70' : 'text-rose-500/70'}`}>/month</p>
            </div>
          </div>
        </div>
      )}

      {/* Dates */}
      <div className="px-5 pb-4 space-y-1.5">
        <div className="flex items-center gap-2 text-xs text-black/50">
          <Calendar className="w-3.5 h-3.5 shrink-0" />
          <span>Target: <span className="font-semibold text-black/70">{new Date(goal.target_date).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' })}</span></span>
          {monthsLeft > 0 && <span className="text-[10px] text-black/30">({monthsLeft}mo left)</span>}
          {monthsLeft <= 0 && !goal.is_completed && <span className="text-[10px] text-rose-500 font-semibold">(Overdue)</span>}
        </div>
        {!goal.is_completed && goal.monthly_contribution > 0 && (
          <div className="flex items-center gap-2 text-xs text-black/50">
            <TrendingUp className="w-3.5 h-3.5 shrink-0" />
            <span>Est. completion: <span className="font-semibold text-violet-600">{estCompletion}</span></span>
          </div>
        )}
      </div>

      {/* Actions */}
      {!isDemo && (
        <div className="px-5 pb-5 flex gap-2">
          <button
            onClick={() => onUpdateSaved(goal)}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border border-violet-200 text-violet-600 text-xs font-semibold hover:bg-violet-50 transition-colors">
            <TrendingUp className="w-3.5 h-3.5" /> Update Savings
          </button>
          <button onClick={() => onEdit(goal)}
            className="p-2 rounded-xl border border-black/10 text-black/50 hover:text-black hover:bg-black/5 transition-colors">
            <Edit2 className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => onDelete(goal.id)}
            className="p-2 rounded-xl border border-rose-100 text-rose-400 hover:text-rose-600 hover:bg-rose-50 transition-colors">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
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
  const [saved, setSaved] = useState(goal.saved_amount.toString());
  const [monthly, setMonthly] = useState(goal.monthly_contribution.toString());
  const progress = pct(parseFloat(saved) || 0, goal.target_amount);

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="flex items-center justify-between px-6 py-5 border-b border-black/5">
          <div>
            <h2 className="font-bold text-black text-base">Update Savings</h2>
            <p className="text-xs text-black/50 mt-0.5">{goal.icon} {goal.name}</p>
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

          {/* Live preview bar */}
          <div className="p-3 bg-black/[0.03] rounded-xl">
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
            <p className="text-[10px] text-black/40 mt-1">{fmt(goal.target_amount - (parseFloat(saved) || 0))} remaining after update</p>
          </div>

          <div className="flex gap-3">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-black/10 text-sm font-semibold text-black/60 hover:bg-black/5 transition-colors">
              Cancel
            </button>
            <button
              onClick={() => onSave(parseFloat(saved) || 0, parseFloat(monthly) || 0)}
              disabled={saving}
              className="flex-1 py-2.5 rounded-xl bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700 transition-colors disabled:opacity-50">
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── AI Suggestions ────────────────────────────────────────────────────────────

function AISuggestions({ goals }: { goals: Goal[] }) {
  const suggestions: { icon: string; title: string; body: string; color: string }[] = [];

  // Most behind goal
  const behind = goals.filter(g => !g.is_completed && g.monthly_contribution > 0).sort((a, b) => {
    const aNeed = requiredMonthly(a.saved_amount, a.target_amount, a.target_date);
    const bNeed = requiredMonthly(b.saved_amount, b.target_amount, b.target_date);
    return (aNeed - a.monthly_contribution) - (bNeed - b.monthly_contribution);
  }).reverse()[0];

  if (behind) {
    const need = requiredMonthly(behind.saved_amount, behind.target_amount, behind.target_date);
    const gap  = need - behind.monthly_contribution;
    if (gap > 0) {
      suggestions.push({
        icon: '⚡',
        title: `Boost "${behind.name}" by ${fmt(gap)}/month`,
        body: `Increasing your monthly contribution from ${fmt(behind.monthly_contribution)} to ${fmt(need)} will ensure you hit your target on time.`,
        color: 'from-amber-50 to-orange-50 border-amber-100',
      });
    }
  }

  // Closest to completion
  const almostDone = goals.filter(g => !g.is_completed && pct(g.saved_amount, g.target_amount) >= 70).sort((a, b) => pct(b.saved_amount, b.target_amount) - pct(a.saved_amount, a.target_amount))[0];
  if (almostDone) {
    suggestions.push({
      icon: '🎯',
      title: `"${almostDone.name}" is ${pct(almostDone.saved_amount, almostDone.target_amount).toFixed(0)}% complete`,
      body: `Only ${fmt(almostDone.target_amount - almostDone.saved_amount)} left! You're incredibly close. One extra month of effort will finish this goal.`,
      color: 'from-violet-50 to-indigo-50 border-violet-100',
    });
  }

  // High priority but low funding
  const highUnderfunded = goals.find(g => g.priority === 'High' && !g.is_completed && g.monthly_contribution === 0);
  if (highUnderfunded) {
    suggestions.push({
      icon: '🚨',
      title: `Set a monthly contribution for "${highUnderfunded.name}"`,
      body: `This is a High priority goal but has no monthly contribution set. Setting even a small amount helps you track progress and stay on target.`,
      color: 'from-rose-50 to-pink-50 border-rose-100',
    });
  }

  // General savings tip
  const totalNeed = goals.filter(g => !g.is_completed).reduce((s, g) => s + requiredMonthly(g.saved_amount, g.target_amount, g.target_date), 0);
  const totalContrib = goals.filter(g => !g.is_completed).reduce((s, g) => s + g.monthly_contribution, 0);
  if (totalNeed > 0 && totalContrib < totalNeed) {
    suggestions.push({
      icon: '💡',
      title: `You need ${fmt(totalNeed - totalContrib)} more savings/month across all goals`,
      body: `Redirecting discretionary spending (dining, subscriptions) to your goals could close this gap. Try reviewing your monthly budget.`,
      color: 'from-emerald-50 to-teal-50 border-emerald-100',
    });
  }

  if (suggestions.length === 0) {
    suggestions.push({
      icon: '🏆',
      title: 'You\'re on track with all goals!',
      body: 'Your current savings rate covers all your goals on time. Consider starting a new goal or increasing your emergency fund.',
      color: 'from-emerald-50 to-teal-50 border-emerald-100',
    });
  }

  return (
    <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-7 h-7 bg-violet-100 rounded-lg flex items-center justify-center">
          <Zap className="w-4 h-4 text-violet-600" />
        </div>
        <div>
          <h2 className="font-bold text-black text-sm">AI Suggestions</h2>
          <p className="text-[11px] text-black/40">Personalized recommendations based on your goals</p>
        </div>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {suggestions.slice(0, 3).map((s, i) => (
          <div key={i} className={`bg-gradient-to-br ${s.color} border rounded-xl p-4`}>
            <div className="text-2xl mb-2 category-emoji">{s.icon}</div>
            <p className="text-sm font-bold text-black mb-1">{s.title}</p>
            <p className="text-xs text-black/60 leading-relaxed">{s.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

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

  // ── Data ─────────────────────────────────────────────────────────────────────
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

  // ── CRUD ──────────────────────────────────────────────────────────────────────
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
        showToast('success', `🎉 "${updateGoal.name}" completed!`);
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
  const completedGoals = goals.filter(g => g.is_completed).length;
  const totalSaved     = goals.reduce((s, g) => s + g.saved_amount, 0);
  const totalTarget    = goals.reduce((s, g) => s + g.target_amount, 0);
  const overallPct     = totalTarget > 0 ? (totalSaved / totalTarget) * 100 : 0;

  const kpis = [
    { label: 'Total Goals',   value: totalGoals,             sub: 'active & completed',  icon: Target,       grad: 'from-violet-50 to-indigo-50', iconColor: 'text-violet-600', fmt: false },
    { label: 'Completed',     value: completedGoals,         sub: `${totalGoals - completedGoals} in progress`,     icon: Trophy,       grad: 'from-emerald-50 to-teal-50',  iconColor: 'text-emerald-600', fmt: false },
    { label: 'Total Saved',   value: totalSaved,             sub: 'across all goals',    icon: TrendingUp,   grad: 'from-blue-50 to-cyan-50',     iconColor: 'text-blue-600', fmt: true },
    { label: 'Total Target',  value: totalTarget,            sub: 'combined target',     icon: Star,         grad: 'from-amber-50 to-orange-50',  iconColor: 'text-amber-600', fmt: true },
    { label: 'Overall',       value: overallPct,             sub: 'progress',            icon: CheckCircle,  grad: 'from-rose-50 to-pink-50',     iconColor: 'text-rose-600', fmt: false, isPct: true },
  ];

  // ── Render ─────────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Confetti */}
      <Confetti active={confetti} onDone={() => setConfetti(false)} />

      {/* Toast */}
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
            <span className="category-emoji">🎯</span> Financial Goals
          </h1>
          <p className="text-sm text-black/50 mt-1">Track your savings goals and achieve your future purchases.</p>
        </div>
        {!isDemo && (
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 bg-black text-white text-sm font-semibold px-5 py-2.5 rounded-full hover:bg-gray-900 transition-colors shadow-sm hover:shadow-md">
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">New Goal</span>
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
                {loading ? '—' : (k as any).isPct ? `${overallPct.toFixed(0)}%` : k.fmt ? fmt(k.value as number) : (k.value as number)}
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

      {/* Goals Grid */}
      {loading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-2 gap-4">
          {[1,2,3,4].map(i => <GoalSkeleton key={i} />)}
        </div>
      ) : goals.length === 0 ? (
        /* Empty state */
        <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-12 flex flex-col items-center text-center">
          <div className="w-20 h-20 bg-gradient-to-br from-violet-100 to-indigo-100 rounded-2xl flex items-center justify-center text-4xl category-emoji mb-5">
            🎯
          </div>
          <h2 className="text-lg font-bold text-black mb-2">No goals yet</h2>
          <p className="text-sm text-black/50 max-w-xs leading-relaxed mb-6">
            Start tracking your savings goals — from gadgets and vacations to an emergency fund.
          </p>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 bg-black text-white text-sm font-semibold px-6 py-3 rounded-full hover:bg-gray-900 transition-colors">
            <Plus className="w-4 h-4" /> Create your first goal
          </button>
        </div>
      ) : (
        <>
          <div className="grid sm:grid-cols-2 lg:grid-cols-2 gap-4">
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

          {/* AI Suggestions */}
          <AISuggestions goals={goals} />
        </>
      )}

      {/* View more link */}
      {goals.length > 0 && (
        <div className="flex justify-center">
          <div className="text-xs text-black/30 flex items-center gap-1">
            <Target className="w-3 h-3" />
            {completedGoals} of {totalGoals} goals completed
            <ChevronRight className="w-3 h-3" />
          </div>
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
