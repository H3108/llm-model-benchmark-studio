import { useEffect, useMemo, useState } from 'react'
import { Info, Gauge, AlertCircle, CheckCircle, X, Search } from 'lucide-react'
import { CapabilityTask, Model } from '../../lib/api'
import { CAPABILITY_HINTS } from '../../lib/intelligenceView'
import { Loader, Button, Badge } from '../ui'
import { providerInitials, PROVIDER_LABELS, providerColor } from '../../lib/providers'
import { View } from '../../lib/types'
import { ModelSelector } from './ModelSelector'

export function CapLab({
  models,
  tasks,
  capabilityRunning,
  capabilityMessage,
  bannerTone,
  onCloseMessage,
  runCapability,
  capabilityCompleted,
  capabilityFailed,
  labChecked,
  setLabChecked,
  setView,
  setSelected,
}: {
  models: Model[];
  tasks: CapabilityTask[];
  capabilityRunning: boolean;
  capabilityMessage: string;
  bannerTone: 'success' | 'danger';
  onCloseMessage: () => void;
  runCapability: (ids: string[], tasks: string[]) => void;
  capabilityCompleted: number;
  capabilityFailed: number;
  labChecked: string[];
  setLabChecked: (checked: string[] | ((prev: string[]) => string[])) => void;
  setView: (v: View) => void;
  setSelected: (m: Model | null) => void;
}) {
  const [selectedTasks, setSelectedTasks] = useState<string[]>([])
  const toggleTask = (key: string) => setSelectedTasks(prev => prev.includes(key) ? prev.filter(x => x !== key) : [...prev, key])
  useEffect(() => {
    setSelectedTasks(prev => prev.length ? prev : tasks.filter(task => task.enabled).map(task => task.task_key))
  }, [tasks])
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
  const estSeconds = labChecked.length * (selectedTasks.length || 1) * 8
  return (
    <div className="page-content">
      {capabilityMessage && (
        <div className={`run-banner ${capabilityRunning ? 'is-running' : bannerTone === 'danger' ? 'is-danger' : 'is-success'}`} role="status" aria-live="polite">
          {capabilityRunning ? <Loader /> : bannerTone === 'danger' ? <AlertCircle size={16} /> : <CheckCircle size={16} />}
          <span>{capabilityMessage}</span>
          {!capabilityRunning && (
            <button className="run-banner-close" onClick={onCloseMessage} aria-label="关闭提示">
              <X size={14} />
            </button>
          )}
        </div>
      )}
      <div className="lab-split">
        <ModelSelector models={models} checked={labChecked} setChecked={setLabChecked} setSelected={setSelected} />
        <div className="card" style={{ alignSelf: 'start' }}>
          <div className="card-head"><h3>能力测试配置</h3></div>
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
              <div className="section-label">选择能力评测任务</div>
              <div className="task-list" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {tasks.map(task => {
                  const isChecked = selectedTasks.includes(task.task_key)
                  const hint = CAPABILITY_HINTS[task.capability] || task.prompt
                  return (
                    <label key={task.id} className={`task-opt ${isChecked ? 'on' : ''}`}>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        disabled={capabilityRunning}
                        onChange={() => toggleTask(task.task_key)}
                      />
                      <span>{task.name}</span>
                      <span className="task-hint" tabIndex={0} aria-label={hint}>
                        <Info size={14} />
                        <span className="task-tooltip" role="tooltip">{hint}</span>
                      </span>
                      <Badge tone="info">{task.capability}</Badge>
                    </label>
                  )
                })}
                {!tasks.length && <span className="muted">暂无可用能力任务</span>}
              </div>
            </div>
            <div className="callout">
              <span className="ic"><Gauge size={18} /></span>
              <p>已选 <b>{labChecked.length}</b> 个模型。能力测试将评估上方勾选任务维度，每个任务生成结构化评分。仅免费模型会被调度，额度耗尽者自动跳过。</p>
            </div>
            <div className="row between">
              <Button variant="ghost" onClick={() => setView('explorer')}>返回</Button>
              <Button variant="primary" disabled={capabilityRunning || !labChecked.length || !selectedTasks.length} onClick={() => runCapability(labChecked, selectedTasks)}>
                {capabilityRunning ? (<><Loader size={15} /> 能力评测中...</>) : (<><Gauge size={15} /> 开始执行 →</>)}
              </Button>
            </div>
            {!capabilityRunning && (capabilityCompleted > 0 || capabilityFailed > 0) && (
              <Button variant="ghost" onClick={() => setView('results')}>
                查看详细结果（{capabilityCompleted} 成功, {capabilityFailed} 失败）
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

