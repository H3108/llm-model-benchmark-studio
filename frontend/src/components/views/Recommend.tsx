import { useCallback, useEffect, useState } from 'react'
import { Sparkles, ArrowRight, AlertTriangle, RefreshCw, Activity, Gauge, Timer, CheckCircle, Cpu, Coins, Boxes } from 'lucide-react'
import { api, Model, Score, Recommendation } from '../../lib/api'
import { View } from '../../lib/types'
import { Button } from '../ui'
import { requestErrorMessage, localizeCapabilityText } from '../../lib/format'
import { CapabilityTags } from './CapabilityTags'

const TASKS: { key: string; label: string }[] = [
  { key: 'default', label: '通用' },
  { key: 'coding', label: '代码生成' },
  { key: 'agent', label: '智能体' },
  { key: 'chat', label: '对话' },
]

export function Recommend({
  models,
  setView,
}: {
  models: Model[]
  setView: (v: View) => void
}) {
  const [task, setTask] = useState('coding')
  const [loading, setLoading] = useState(true)
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

  const m: Score | null = data?.model ?? null
  // 用 recommend 返回的 model_id 在模型目录里取完整档案（含组织/上下文/价格/能力标签）
  const full = m ? models.find(x => x.model_id === m.model_id) ?? null : null
  const reason = data?.recommendation_reason
  const breakdown = reason?.score_breakdown ?? {}
  const opScore = breakdown.operational_score ?? m?.operational_score ?? 0
  const capScore = breakdown.capability_score ?? m?.capability_score ?? 0
  const hasCap = capScore > 0

  return (
    <div className="page-content" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="rec-taskbar">
        <div className="rec-pills">
          {TASKS.map(t => (
            <button
              key={t.key}
              className={task === t.key ? 'rec-pill active' : 'rec-pill'}
              onClick={() => setTask(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <span className="rec-task-meta">
          {loading ? '分析中…' : data ? `命中评分档 ${data.profile}` : ''}
        </span>
        <div className="rec-task-actions">
          <Button variant="ghost" onClick={() => fetchRec(task)} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'spin' : ''} /> {loading ? '推荐中' : '重新推荐'}
          </Button>
        </div>
      </div>

      {loading && <RecSkeleton />}
      {!loading && error && <div className="alert"><AlertTriangle size={14} />{error}</div>}

      {!loading && !error && data && (
        m ? (
          <div className="card rec-hero">
            <div className="rec-hero-top" />
            <div className="card-pad">
              <div className="rec-hero-head">
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
                  <div className="rec-avatar"><Sparkles size={22} /></div>
                  <div style={{ minWidth: 0 }}>
                    <div className="rec-model-name">{m.model_id}</div>
                    <span className="badge badge-neutral" style={{ marginTop: 6 }}>{m.provider}</span>
                  </div>
                </div>
                <div className="rec-score">
                  <div className="rec-score-ring"><b>{m.overall_score.toFixed(1)}</b></div>
                  <p className="rec-score-label">综合评分</p>
                </div>
              </div>

              <div className="metrics-row four" style={{ marginBottom: 20 }}>
                <div className="metric"><div className="metric-icon green"><Activity size={19} /></div><div><small>可用性</small><strong>{m.availability_score.toFixed(2)}</strong></div></div>
                <div className="metric"><div className="metric-icon blue"><Gauge size={19} /></div><div><small>速度</small><strong>{m.avg_tokens_per_second != null ? `${Math.round(m.avg_tokens_per_second)} t/s` : '—'}</strong></div></div>
                <div className="metric"><div className="metric-icon amber"><Timer size={19} /></div><div><small>延迟</small><strong>{m.avg_latency_ms != null ? `${Math.round(m.avg_latency_ms)} ms` : '—'}</strong></div></div>
                <div className="metric"><div className="metric-icon green"><CheckCircle size={19} /></div><div><small>成功率</small><strong>{`${Math.round((m.success_rate ?? 0) * 100)}%`}</strong></div></div>
              </div>

              {data.reason && (
                <div className="rec-reason"><p>{data.reason}</p></div>
              )}

              {reason && (
                <div className="rec-breakdown">
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 10 }}>评分构成</div>
                  <div className="bd-row">
                    <span className="bd-label">性能</span>
                    <span className="bd-track"><span className="bd-fill" style={{ width: `${Math.round(opScore * 100)}%` }} /></span>
                    <span className="bd-val">{opScore.toFixed(2)}</span>
                  </div>
                  <div className="bd-row">
                    <span className="bd-label">能力</span>
                    <span className="bd-track"><span className={`bd-fill ${hasCap ? '' : 'muted'}`} style={{ width: `${Math.round(capScore * 100)}%` }} /></span>
                    <span className={`bd-val ${hasCap ? '' : 'muted'}`}>{hasCap ? capScore.toFixed(2) : '—'}</span>
                  </div>
                  <div className="rec-meta">
                    {typeof reason.benchmark_count === 'number' && <span>基于 {reason.benchmark_count} 次性能基准测试</span>}
                    {reason.capability_reason && <span> · {localizeCapabilityText(reason.capability_reason)}</span>}
                    {!hasCap && <span> · 能力维度暂无能力测试数据</span>}
                  </div>
                </div>
              )}

              {full && (
                <div className="rec-profile">
                  <div className="rec-section-title">模型档案</div>
                  <div className="rec-profile-grid">
                    {full.organization && (
                      <div className="rec-pf">
                        <span className="rec-pf-k"><Cpu size={13} /> 组织</span>
                        <span className="rec-pf-v">{full.organization}</span>
                      </div>
                    )}
                    {full.context_length ? (
                      <div className="rec-pf">
                        <span className="rec-pf-k"><Boxes size={13} /> 上下文</span>
                        <span className="rec-pf-v">{full.context_length.toLocaleString()} token</span>
                      </div>
                    ) : null}
                    <div className="rec-pf">
                      <span className="rec-pf-k"><Coins size={13} /> 价格</span>
                      <span className="rec-pf-v">{full.is_free ? '免费' : '付费'}</span>
                    </div>
                    {full.model_type && (
                      <div className="rec-pf">
                        <span className="rec-pf-k">类型</span>
                        <span className="rec-pf-v">{full.model_type}</span>
                      </div>
                    )}
                  </div>
                  {full.capabilities && Object.keys(full.capabilities).length > 0 && (
                    <div className="rec-cap-block">
                      <span className="rec-pf-k" style={{ display: 'block', marginBottom: 8 }}>能力标签</span>
                      <CapabilityTags capabilities={full.capabilities} large />
                    </div>
                  )}
                </div>
              )}

              <div className="rec-cta">
                <Button variant="primary" onClick={() => setView('lab')}><Gauge size={14} /> 去性能测试 <ArrowRight size={14} /></Button>
                <Button variant="ghost" onClick={() => setView('cap')}><Boxes size={14} /> 去能力测试</Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="card card-pad" style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '40px 24px' }}>
            <Sparkles size={28} color="var(--brand)" />
            <p style={{ margin: 0, color: 'var(--text-2)', fontSize: 13 }}>{data.reason || '该任务暂无足够数据，先去跑一轮性能/能力测试吧。'}</p>
            <div className="rec-cta" style={{ justifyContent: 'center' }}>
              <Button variant="primary" onClick={() => setView('lab')}><Gauge size={14} /> 去性能测试</Button>
              <Button variant="ghost" onClick={() => setView('cap')}><Boxes size={14} /> 去能力测试</Button>
            </div>
          </div>
        )
      )}
    </div>
  )
}

function RecSkeleton() {
  return (
    <div className="card rec-skeleton">
      <div className="rec-hero-top" />
      <div className="card-pad">
        <div className="rec-hero-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div className="skel skel-avatar" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div className="skel" style={{ width: 200, height: 16 }} />
              <div className="skel" style={{ width: 80, height: 18, borderRadius: 6 }} />
            </div>
          </div>
          <div className="skel skel-ring" />
        </div>
        <div className="metrics-row four" style={{ marginBottom: 20 }}>
          {[0, 1, 2, 3].map(i => (
            <div className="skel-metric" key={i}>
              <div className="skel skel-m-icon" />
              <div className="skel skel-m-line1" />
              <div className="skel skel-m-line2" />
            </div>
          ))}
        </div>
        <div className="skel" style={{ width: '55%', height: 14, marginBottom: 16 }} />
        <div className="rec-breakdown">
          <div className="skel" style={{ width: 72, height: 14, marginBottom: 12 }} />
          <div className="skel" style={{ height: 8, marginBottom: 10 }} />
          <div className="skel" style={{ height: 8, width: '72%' }} />
        </div>
      </div>
    </div>
  )
}
