import { useCallback, useEffect, useState } from 'react'
import { Sparkles, ArrowRight, AlertTriangle, RefreshCw, Zap } from 'lucide-react'
import { api, Model, Score, Recommendation } from '../../lib/api'
import { View } from '../../lib/types'
import { Button } from '../ui'
import { requestErrorMessage } from '../../lib/format'

const TASKS: { key: string; label: string }[] = [
  { key: 'default', label: '通用' },
  { key: 'coding', label: '代码生成' },
  { key: 'agent', label: '智能体' },
  { key: 'chat', label: '对话' },
]

export function Recommend({
  models,
  setView,
  setSelected,
}: {
  models: Model[]
  setView: (v: View) => void
  setSelected: (m: Model | null) => void
}) {
  const [task, setTask] = useState('coding')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [data, setData] = useState<Recommendation | null>(null)

  const fetchRec = useCallback(async (t: string) => {
    setLoading(true)
    setError('')
    try {
      const res = await api.recommend(t)
      setData(res)
    } catch (e) {
      setError(requestErrorMessage(e, '推荐失败'))
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchRec(task)
  }, [task, fetchRec])

  const openDetail = () => {
    if (!data?.model) return
    const full = models.find(m => m.model_id === data.model!.model_id)
    if (full) setSelected(full)
  }

  const m: Score | null = data?.model ?? null
  const reason = data?.recommendation_reason
  const breakdown = reason?.score_breakdown ?? {}

  return (
    <div style={{ padding: '0 32px 32px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {TASKS.map(t => (
          <button
            key={t.key}
            className={task === t.key ? 'btn btn-soft' : 'btn btn-ghost'}
            onClick={() => setTask(t.key)}
          >
            {t.label}
          </button>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-3)' }}>
          {data ? `命中评分档：${data.profile}` : ''}
        </span>
      </div>

      <div>
        <Button variant="ghost" onClick={() => fetchRec(task)} disabled={loading}>
          <RefreshCw size={14} className={loading ? 'spin' : ''} /> {loading ? '推荐中…' : '重新推荐'}
        </Button>
      </div>

      {loading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 'var(--r-sm)', background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-2)', fontSize: 12.5 }}>
          <RefreshCw size={14} className="spin" />正在为你推荐最合适的模型…
        </div>
      )}
      {error && <div className="alert"><AlertTriangle size={14} />{error}</div>}

      {!loading && !error && data && (
        m ? (
          <div className="card card-pad">
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--brand-soft)', color: 'var(--brand)', display: 'grid', placeItems: 'center' }}>
                  <Sparkles size={19} />
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{m.model_id}</div>
                  <span className="badge badge-neutral" style={{ marginTop: 4 }}>{m.provider}</span>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 11, color: 'var(--text-3)' }}>综合评分</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--font-display)', letterSpacing: '-.4px' }}>{m.overall_score.toFixed(1)}</div>
              </div>
            </div>

            <div className="metrics-row four" style={{ marginBottom: 16 }}>
              <div className="metric"><div className="metric-icon teal"><Zap size={19} /></div><div><small>可用性</small><strong>{m.availability_score.toFixed(2)}</strong></div></div>
              <div className="metric"><div className="metric-icon blue"><Zap size={19} /></div><div><small>速度</small><strong>{m.avg_tokens_per_second != null ? `${Math.round(m.avg_tokens_per_second)} t/s` : '—'}</strong></div></div>
              <div className="metric"><div className="metric-icon amber"><Zap size={19} /></div><div><small>延迟</small><strong>{m.avg_latency_ms != null ? `${Math.round(m.avg_latency_ms)} ms` : '—'}</strong></div></div>
              <div className="metric"><div className="metric-icon green"><Zap size={19} /></div><div><small>成功率</small><strong>{`${Math.round((m.success_rate ?? 0) * 100)}%`}</strong></div></div>
            </div>

            {data.reason && (
              <p style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6, margin: '0 0 16px' }}>{data.reason}</p>
            )}

            {reason && (
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 10 }}>评分构成</div>
                <Bar label="Operational" value={breakdown.operational_score ?? m.operational_score} />
                <Bar label="Capability" value={breakdown.capability_score ?? m.capability_score} />
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 10, fontSize: 12, color: 'var(--text-3)' }}>
                  {typeof reason.benchmark_count === 'number' && <span>基于 {reason.benchmark_count} 次 Benchmark</span>}
                  {reason.capability_reason && <span>{reason.capability_reason}</span>}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
              <Button variant="ghost" onClick={() => setView('lab')}>去性能测试 <ArrowRight size={14} /></Button>
              <Button variant="ghost" onClick={openDetail}>查看详情</Button>
            </div>
          </div>
        ) : (
          <div className="card card-pad" style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '40px 24px' }}>
            <Sparkles size={28} color="var(--brand)" />
            <p style={{ margin: 0, color: 'var(--text-2)', fontSize: 13 }}>{data.reason || '暂无足够的 Benchmark 数据，先去跑一轮性能/能力测试吧。'}</p>
            <Button variant="ghost" onClick={() => setView('lab')}>去测试</Button>
          </div>
        )
      )}
    </div>
  )
}

function Bar({ label, value }: { label: string; value?: number }) {
  const v = value ?? 0
  const pct = Math.max(0, Math.min(100, Math.round(v * 100)))
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: 'var(--text-3)', marginBottom: 8 }}>
      <span style={{ width: 96 }}>{label}</span>
      <span style={{ flex: 1, height: 6, background: 'var(--surface-2)', borderRadius: 4, overflow: 'hidden' }}>
        <span style={{ display: 'block', height: '100%', width: `${pct}%`, background: 'var(--brand)' }} />
      </span>
      <span style={{ width: 40, textAlign: 'right', color: 'var(--text-2)' }}>{v.toFixed(2)}</span>
    </div>
  )
}
