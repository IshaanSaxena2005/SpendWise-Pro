import { useState, useEffect } from 'react';
import { Brain, Flame, ShoppingBag, RefreshCw, TrendingUp, Info } from 'lucide-react';
import api from '../../lib/api';
import { formatHealthRating } from '../../lib/financeMetrics';

interface ApiInsight {
  id: number;
  title: string;
  description: string;
  severity: string;
  confidence_score: number;
  category: string | null;
}

interface ApiRecommendation {
  id: number;
  title: string;
  description: string;
  impact_score: number;
  category: string | null;
}

interface HealthData {
  score: number | null;
  rating: string;
  recommendations: string[];
}

interface InsightVisual {
  bg: string;
  border: string;
  dot: string;
  iconClass: string;
  Icon: React.FC<{ className?: string }>;
}

function mapSeverityToVisual(severity: string): InsightVisual {
  const normalized = severity.toLowerCase();
  if (normalized === 'high') {
    return { bg: 'bg-rose-50', border: 'border-rose-100', dot: 'bg-rose-500', iconClass: 'text-rose-500', Icon: Flame };
  }
  if (normalized === 'medium') {
    return { bg: 'bg-amber-50', border: 'border-amber-100', dot: 'bg-amber-400', iconClass: 'text-amber-500', Icon: ShoppingBag };
  }
  if (normalized === 'low') {
    return { bg: 'bg-emerald-50', border: 'border-emerald-100', dot: 'bg-emerald-500', iconClass: 'text-emerald-600', Icon: TrendingUp };
  }
  return { bg: 'bg-blue-50', border: 'border-blue-100', dot: 'bg-blue-500', iconClass: 'text-blue-500', Icon: RefreshCw };
}

function mapSeverityLabel(severity: string): 'HIGH' | 'MEDIUM' | 'LOW' {
  const normalized = severity.toLowerCase();
  if (normalized === 'high') return 'HIGH';
  if (normalized === 'medium') return 'MEDIUM';
  return 'LOW';
}

function HealthSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="w-36 h-36 rounded-full bg-black/10 mx-auto mb-4" />
      <div className="h-3 w-48 bg-black/5 rounded mx-auto" />
    </div>
  );
}

export function InsightsPage() {
  const [insights, setInsights] = useState<ApiInsight[]>([]);
  const [recommendations, setRecommendations] = useState<ApiRecommendation[]>([]);
  const [health, setHealth] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setLoadError(false);

        try {
          await api.post('/intelligence/generate');
        } catch {
          // Generation may fail if insufficient data — still try to fetch existing records
        }

        const [insightsRes, recsRes, healthRes] = await Promise.all([
          api.get('/intelligence/insights'),
          api.get('/intelligence/recommendations'),
          api.get('/health/score'),
        ]);

        const insightsData = insightsRes.data?.insights ?? insightsRes.data;
        const recsData = recsRes.data?.recommendations ?? recsRes.data;

        setInsights(Array.isArray(insightsData) ? insightsData : []);
        setRecommendations(Array.isArray(recsData) ? recsData : []);

        if (healthRes.data?.success) {
          setHealth({
            score: healthRes.data.score ?? null,
            rating: healthRes.data.rating,
            recommendations: healthRes.data.recommendations ?? [],
          });
        }
      } catch (error) {
        console.error('Error loading insights:', error);
        setLoadError(true);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const aiScore = health?.score ?? null;
  const scoreLabel = health
    ? (health.score === null ? 'Insufficient Data' : formatHealthRating(health.rating))
    : 'N/A';
  const scoreColor = aiScore !== null && aiScore >= 80 ? 'text-emerald-600' : aiScore !== null && aiScore >= 60 ? 'text-blue-600' : aiScore !== null && aiScore >= 40 ? 'text-amber-600' : 'text-rose-500';

  const topRecommendation = recommendations[0] ?? null;
  const aiTip = health?.recommendations?.[0] ?? null;

  return (
    <div className="space-y-5 max-w-7xl mx-auto">
      <div>
        <h1 className="text-xl font-semibold text-black tracking-tight">AI Insights</h1>
        <p className="text-sm text-black/50">Intelligent recommendations to improve your finances</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Left — Insights Feed */}
        <div className="lg:col-span-2 space-y-3">
          <h2 className="text-sm font-semibold text-black/60 uppercase tracking-wider">Recommendations</h2>

          {loading ? (
            <div className="space-y-3 animate-pulse">
              <div className="h-28 bg-black/5 rounded-2xl" />
              <div className="h-28 bg-black/5 rounded-2xl" />
            </div>
          ) : loadError ? (
            <div className="bg-white rounded-2xl border border-black/5 p-12 text-center">
              <Info className="w-8 h-8 text-black/20 mx-auto mb-3" />
              <p className="text-sm text-black/40">Insufficient data — unable to load insights.</p>
            </div>
          ) : insights.length === 0 ? (
            <div className="bg-white rounded-2xl border border-black/5 p-12 text-center">
              <Info className="w-8 h-8 text-black/20 mx-auto mb-3" />
              <p className="text-sm text-black/40">
                No insights available. Add more transactions to generate insights.
              </p>
            </div>
          ) : (
            insights.map((ins) => {
              const style = mapSeverityToVisual(ins.severity);
              const severityLabel = mapSeverityLabel(ins.severity);
              const Icon = style.Icon;
              const confidence = Math.round(Number(ins.confidence_score) * 100);
              return (
                <div
                  key={ins.id}
                  className={`rounded-2xl border p-5 flex flex-col md:flex-row items-start gap-4 ${style.bg} ${style.border} group transition-all hover:shadow-md`}
                >
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-white shadow-sm border border-black/5">
                    <Icon className={`w-5 h-5 ${style.iconClass}`} />
                  </div>
                  <div className="flex-1 w-full">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${style.dot} animate-pulse`} />
                        <h3 className="text-sm font-semibold text-black">{ins.title}</h3>
                      </div>
                      <div className="flex items-center gap-2 text-[10px] font-bold tracking-wider uppercase">
                        <span className={`px-2 py-1 rounded-md bg-white border border-black/5 ${
                          severityLabel === 'HIGH' ? 'text-rose-600' :
                          severityLabel === 'MEDIUM' ? 'text-amber-600' : 'text-emerald-600'
                        }`}>
                          {severityLabel}
                        </span>
                        <span className="px-2 py-1 rounded-md bg-white border border-black/5 text-black/60">
                          Confidence: {confidence}%
                        </span>
                      </div>
                    </div>
                    <p className="text-sm text-black/70 leading-relaxed mb-3">{ins.description}</p>
                    <div className="flex items-center justify-between">
                      <div className="inline-flex items-center px-2 py-1 bg-black/5 rounded-md text-[10px] font-semibold text-black/50 uppercase tracking-widest">
                        {ins.category ?? 'General'}
                      </div>
                      <div className="flex items-center gap-2">
                        <button className="text-[11px] font-semibold text-violet-600 bg-violet-50 hover:bg-violet-100 px-3 py-1.5 rounded-lg transition-colors">
                          {severityLabel === 'HIGH' ? 'Create Budget' : 'View Transactions'}
                        </button>
                        <button className="text-[11px] font-semibold text-black/40 hover:text-black/60 hover:bg-black/5 px-3 py-1.5 rounded-lg transition-colors">
                          Dismiss
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Right — Score + Top Categories */}
        <div className="space-y-4">

          {/* AI Health Score Card */}
          <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-6 text-center">
            <div className="flex items-center justify-center gap-2 mb-5">
              <Brain className="w-4 h-4 text-violet-600" />
              <span className="text-sm font-semibold text-black">Financial Health Score</span>
            </div>

            {loading ? (
              <HealthSkeleton />
            ) : (
              <>
                <div className="relative flex items-center justify-center w-36 h-36 mx-auto mb-4">
                  <svg className="transform -rotate-90 w-36 h-36 drop-shadow-sm">
                    <circle cx="72" cy="72" r="60" stroke="currentColor" strokeWidth="10" fill="transparent" className="text-black/5" />
                    {aiScore !== null && (
                      <circle
                        cx="72" cy="72" r="60"
                        stroke="url(#insightsHealthGradient)"
                        strokeWidth="10"
                        fill="transparent"
                        strokeDasharray={2 * Math.PI * 60}
                        strokeDashoffset={(2 * Math.PI * 60) - ((aiScore / 100) * (2 * Math.PI * 60))}
                        className="transition-all duration-1000 ease-out stroke-round"
                        strokeLinecap="round"
                      />
                    )}
                    <defs>
                      <linearGradient id="insightsHealthGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor={aiScore !== null && aiScore >= 80 ? '#10B981' : aiScore !== null && aiScore >= 60 ? '#F59E0B' : '#F43F5E'} />
                        <stop offset="100%" stopColor={aiScore !== null && aiScore >= 80 ? '#059669' : aiScore !== null && aiScore >= 60 ? '#D97706' : '#E11D48'} />
                      </linearGradient>
                    </defs>
                  </svg>
                  <div className="absolute flex flex-col items-center justify-center">
                    <span className="text-4xl font-bold text-black tracking-tight">{aiScore !== null ? aiScore : 'N/A'}</span>
                    <span className={`text-xs font-semibold uppercase tracking-wider mt-1 ${scoreColor}`}>{scoreLabel}</span>
                  </div>
                </div>

                <p className="text-xs text-black/40 leading-relaxed">
                  {aiTip ?? 'Insufficient data — add transactions and budgets to calculate your score.'}
                </p>
              </>
            )}
          </div>

          {/* AI Tip */}
          <div className="bg-[#F5F5F5] rounded-2xl p-5 border border-black/5">
            <div className="flex items-center gap-2 mb-2">
              <Brain className="w-4 h-4 text-black/40" />
              <span className="text-xs font-bold text-black/50 uppercase tracking-wider">AI Tip</span>
            </div>
            <p className="text-sm font-medium text-black/70 leading-relaxed">
              {loading
                ? 'Loading...'
                : health?.recommendations?.[1] ?? health?.recommendations?.[0] ?? 'No insights available. Add more transactions to generate tips.'}
            </p>
          </div>

          {/* Premium AI Suggestion Card */}
          <div className="bg-gradient-to-br from-violet-600 to-violet-900 rounded-2xl p-6 shadow-md relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-bl-full -z-0 group-hover:scale-110 transition-transform duration-500"></div>
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-4">
                <span className="text-[10px] font-bold text-violet-200 uppercase tracking-widest border border-violet-400/30 px-2 py-1 rounded-md">
                  AI Suggestion
                </span>
                <Brain className="w-4 h-4 text-violet-300" />
              </div>
              {loading ? (
                <div className="space-y-3 animate-pulse">
                  <div className="h-5 w-40 bg-white/20 rounded" />
                  <div className="h-12 w-full bg-white/10 rounded" />
                </div>
              ) : topRecommendation ? (
                <>
                  <h3 className="text-lg font-bold text-white mb-2 tracking-tight">{topRecommendation.title}</h3>
                  <p className="text-sm text-violet-100/80 leading-relaxed mb-5">
                    {topRecommendation.description}
                  </p>
                  <div className="bg-black/20 backdrop-blur-sm rounded-xl p-3 flex items-center justify-between">
                    <span className="text-xs font-medium text-white/70">Impact Score:</span>
                    <span className="text-sm font-bold text-emerald-400 tracking-tight">{Number(topRecommendation.impact_score).toFixed(1)}/10</span>
                  </div>
                </>
              ) : (
                <p className="text-sm text-violet-100/80 leading-relaxed">
                  No suggestions available. Add more transactions to generate recommendations.
                </p>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
