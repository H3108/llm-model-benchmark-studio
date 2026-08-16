import { useMemo } from 'react'
import { Search, Zap, AlertCircle, CheckCircle, X, Server } from 'lucide-react'
import { Model } from '../../lib/api'
import { Loader, Button } from '../ui'
import { providerInitials, PROVIDER_LABELS, providerColor } from '../../lib/providers'
import { PERF_METRICS } from '../../lib/format'
import { View } from '../../lib/types'
import { ModelSelector } from './ModelSelector'

export function PerfLab({
  models,
  running,
  message,
  bannerTone,
  onCloseMessage,
  benchmarkCompleted,
  benchmarkFailed,
  runBenchmark,
  labChecked,
  setLabChecked,
  setView,
  setSelected,
}: {
  models: Model[];
  running: boolean;
  message: string;
  bannerTone: 'success' | 'danger';
  onCloseMessage: () => void;
  benchmarkCompleted: number;
  benchmarkFailed: number;
  runBenchmark: (ids: string[], options?: { redirectToResults?: boolean }) => void;
  labChecked: string[];
  setLabChecked: (checked: string[] | ((prev: string[]) => string[])) => void;
  setView: (v: View) => void;
  setSelected: (m: Model | null) => void;
}) {
  const selectedModels = useMemo(() => models.filter(m => labChecked.includes(m.model_id)), [models, labChecked])
  const providerDist = useMemo(() => {
    const d: Record<string, number> = {}
    selectedModels.forEach(m => { d[m.provider] = (d[m.provider] || 0) + 1 })
    return d
  }, [selectedModels])
  const avgCtx = useMemo(() => {
    const vals = selectedModels.map(m => m.context_length || 0).filter(Boolean)
    if (!vals.length) return 0
    return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length / 1000)
  }, [selectedModels])
  const estSeconds = labChecked.length * 6 * 8

  return (
    <div className="page-content">
      {message && (
        <div className={`run-banner ${running ? 'is-running' : bannerTone === 'danger' ? 'is-danger' : 'is-success'}`} role="status" aria-live="polite">
          {running ? <Loader /> : bannerTone === 'danger' ? <AlertCircle size={16} /> : <CheckCircle size={16} />}
          <span>{message}</span>
          {!running && (
            <button className="run-banner-close" onClick={onCloseMessage} aria-label="关闭提示">
              <X size={14} />
            </button>
          )}
        </div>
      )}
      <div className="lab-split">
        <ModelSelector models={models} checked={labChecked} setChecked={setLabChecked} setSelected={setSelected} />
        <div className="card" style={{ alignSelf: 'start' }}>
          <div className="card-head between">
            <h3>性能测试配置</h3>
            <span className="sub">运行性能 · 延迟 / TTFT / 吞吐 / 可用性</span>
          </div>
          <div className="card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {labChecked.length > 0 ? (
              <div className="sel-summary">
                <div className="sel-summary-top">
                  <span className="sel-count">{labChecked.length}<em>个模型</em></span>
                  <span className="sel-sub">平均上下文 {avgCtx > 0 ? `${avgCtx}K` : '—'} · 预计耗时约 {estSeconds}s</span>
                </div>
                <div className="provider-chips">
                  {Object.entries(providerDist).map(([p, n]) => (
                    <span key={p} className="chip plain"><span className="chip-ic" style={{ background: providerColor(p) }}>{providerInitials(p)}</span>{PROVIDER_LABELS[p] ?? p} · {n}
                      <button className="chip-clear" title={`清空 ${PROVIDER_LABELS[p] ?? p} 的已选模型`} aria-label={`清空 ${PROVIDER_LABELS[p] ?? p} 的已选模型`} onClick={() => {
                        const toRemove = new Set(selectedModels.filter(m => m.provider === p).map(m => m.model_id))
                        setLabChecked(prev => prev.filter(id => !toRemove.has(id)))
                      }}><X size={11} /></button>
                    </span>
                  ))}
                </div>
                <div className="sel-models">
                  {selectedModels.map(m => (
                    <span key={m.model_id} className="sel-model-chip">
                      <span className="chip-ic" style={{ background: providerColor(m.provider) }}>{providerInitials(m.provider)}</span>
                      <span className="sel-model-name" title={m.model_id}>{m.model_id}</span>
                      <button aria-label={`移除 ${m.model_id}`} title="移除该模型" onClick={() => setLabChecked(prev => prev.filter(id => id !== m.model_id))}><X size={11} /></button>
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <div className="empty-hint"><Search size={15} /> 尚未选择模型，请在左侧勾选。</div>
            )}

            <div>
              <div className="section-label">将测量的运行指标</div>
              <div className="metric-grid-2x2">
                {PERF_METRICS.map(m => (
                  <div key={m.key} className="metric">
                    <div className={`metric-icon ${m.tone}`}>{m.icon}</div>
                    <div>
                      <div className="metric-name">{m.name}</div>
                      <small>{m.desc}</small>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="callout">
              <span className="ic"><Server size={18} /></span>
              <p>调度并发上限 <b>3</b>，单请求超时 <b>60s</b>。仅免费模型会被调度，额度耗尽者自动跳过。完成后可在「运行结果」查看明细。</p>
            </div>

            <div className="row between">
              <Button variant="ghost" onClick={() => setView('explorer')}>返回</Button>
              <Button disabled={running || !labChecked.length} onClick={() => runBenchmark(labChecked, { redirectToResults: false })}>
                {running ? (<><Loader size={15} /> 正在运行...</>) : (<><Zap size={15} /> 开始执行 →</>)}
              </Button>
            </div>
            {!running && (benchmarkCompleted > 0 || benchmarkFailed > 0) && (
              <Button variant="ghost" onClick={() => setView('results')}>
                查看详细结果（{benchmarkCompleted} 成功, {benchmarkFailed} 失败）
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

