import { useEffect, useState } from 'react'
import { Info, Gauge, AlertCircle, X } from 'lucide-react'
import { CapabilityTask, Model } from '../../lib/api'
import { CAPABILITY_HINTS } from '../../lib/intelligenceView'
import { Loader, Button, Badge } from '../ui'
import { View } from '../../lib/types'
import { ModelSelector } from './ModelSelector'

export function CapLab({
  models,
  tasks,
  capabilityRunning,
  capabilityMessage,
  onCloseMessage,
  runCapability,
  labChecked,
  setLabChecked,
  setView,
  setSelected,
}: {
  models: Model[];
  tasks: CapabilityTask[];
  capabilityRunning: boolean;
  capabilityMessage: string;
  onCloseMessage: () => void;
  runCapability: (ids: string[], tasks: string[]) => void;
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
  return (
    <div className="page-content">
      {capabilityMessage && (
        <div className={`run-banner ${capabilityRunning ? 'is-running' : ''}`} role="status" aria-live="polite">
          {capabilityRunning ? <Loader /> : <AlertCircle size={16} />}
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
          </div>
        </div>
      </div>
    </div>
  )
}

