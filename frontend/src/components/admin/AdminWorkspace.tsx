import { useEffect, useMemo, useState } from 'react'
import { Activity, CheckCircle2, Database, Info, Lock, RefreshCw, Server, Settings2, XCircle, Zap } from 'lucide-react'
import { api, ApiError, type Benchmark, type BenchmarkRun, type CapabilityTask, type Model, type ModelSyncRun } from '../../lib/api'
import { providerLabel, SYNC_PROVIDERS } from '../../lib/providers'
import { ProviderPicker } from '../pickers'
import { PageLoader, TopProgress, Loader } from '../ui'

type AdminData = {
  models: Model[]
  results: Benchmark[]
  benchmarkRuns: BenchmarkRun[]
  syncRuns: ModelSyncRun[]
  capabilityTasks: CapabilityTask[]
}

const initialData: AdminData = {
  models: [],
  results: [],
  benchmarkRuns: [],
  syncRuns: [],
  capabilityTasks: [],
}

function formatDate(value: string | null | undefined) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString()
}

function formatDateShort(value: string | null | undefined) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  const p = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()} ${p(date.getHours())}:${p(date.getMinutes())}:${p(date.getSeconds())}`
}

function formatDuration(value: number | null | undefined) {
  return value == null ? '—' : `${value.toFixed(1)} s`
}

function StatusBadge({ status }: { status: 'success' | 'failed' | 'running' | string }) {
  if (status === 'success') return <span className="sp ok"><span className="d" />成功</span>
  if (status === 'failed') return <span className="sp bad"><span className="d" />失败</span>
  return <span className="sp warn"><span className="d" />进行中</span>
}

export function AdminWorkspace({ adminToken = '', onNavigate }: { adminToken?: string; onNavigate?: (view: string) => void }) {
  const [data, setData] = useState<AdminData>(initialData)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncProvider, setSyncProvider] = useState('openrouter')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const loadData = async (showRefreshState = false) => {
    if (showRefreshState) setRefreshing(true)
    else setLoading(true)
    setError('')

    const [models, results, benchmarkRuns, syncRuns, capabilityTasks] = await Promise.allSettled([
      api.models(),
      api.results(),
      api.benchmarkRuns(),
      api.syncRuns(),
      api.capabilityTasks(),
    ])

    const failures: string[] = []
    const next = <T,>(response: PromiseSettledResult<T>, label: string, previous: T): T => {
      if (response.status === 'fulfilled') return response.value
      failures.push(label)
      return previous
    }

    setData(previous => ({
      models: next(models, '模型库', previous.models),
      results: next(results, '性能测试', previous.results),
      benchmarkRuns: next(benchmarkRuns, '测试批次', previous.benchmarkRuns),
      syncRuns: next(syncRuns, '同步历史', previous.syncRuns),
      capabilityTasks: next(capabilityTasks, '能力任务', previous.capabilityTasks),
    }))
    if (failures.length) setError(`部分运维数据加载失败：${failures.join('、')}。请刷新后重试。`)
    setLoading(false)
    setRefreshing(false)
  }

  useEffect(() => { void loadData() }, [])

  const runSync = async () => {
    setSyncing(true)
    setMessage(`正在同步 ${providerLabel(syncProvider)} 模型目录…`)
    setError('')
    try {
      const models = await api.syncModels(syncProvider)
      setData(previous => ({ ...previous, models }))
      setMessage(`模型同步完成：当前共有 ${models.length} 个已确认免费模型。`)
      await loadData(true)
    } catch (cause) {
      if (cause instanceof ApiError && (cause.status === 401 || cause.status === 403)) {
        setError('同步需要有效的 Admin Token，请在左侧“管理权限”中配置后重试。')
      } else {
        setError(cause instanceof Error ? cause.message : '模型同步失败')
      }
      setMessage('')
    } finally {
      setSyncing(false)
    }
  }

  const summary = useMemo(() => {
    const successfulResults = data.results.filter(result => result.status === 'success')
    const testedModels = new Set(data.results.map(result => result.model_id))
    const providerCount = new Set(data.models.map(model => model.provider)).size
    return {
      successfulResults: successfulResults.length,
      testedModels: testedModels.size,
      providerCount,
      successRate: data.results.length ? `${Math.round((successfulResults.length / data.results.length) * 100)}%` : '—',
      latestSync: data.syncRuns[0] ?? null,
    }
  }, [data])

  if (loading) {
    return (
      <>
        <TopProgress active={loading} />
        <PageLoader label="正在加载运维数据" kicker="OPS · SYNC" />
      </>
    )
  }

  const successRateClass = summary.successRate !== '—' && parseInt(summary.successRate) < 60 ? 'warn' : 'up'

  return (
    <div className="page-content">
      {error && (
        <div className="callout mb-3" style={{ background: 'var(--danger-soft)', borderColor: 'color-mix(in srgb, var(--danger) 30%, transparent)' }}>
          <span className="ic" style={{ color: 'var(--danger)' }}><XCircle size={18} /></span>
          <p>{error}</p>
        </div>
      )}

      {!adminToken && (
        <div className="lock-banner mb-3">
          <Lock size={18} className="lb-ic" />
          <p><b>当前为访客角色</b>，同步、配置等管理操作已锁定。请在「管理权限」中配置 Admin Token 并切换为管理员后操作。</p>
          {onNavigate && (
            <button className="btn-link" onClick={() => onNavigate('perms')}>前往配置 →</button>
          )}
        </div>
      )}

      {message && (
        <div className="callout mb-3" style={{ background: 'var(--brand-2-soft)', borderColor: 'color-mix(in srgb, var(--brand-2) 30%, transparent)' }}>
          <span className="ic" style={{ color: 'var(--brand-2)' }}><CheckCircle2 size={18} /></span>
          <p>{message}</p>
        </div>
      )}

      <div className="grid g-5 mb-3">
        <div className="stat">
          <div className="k"><Server size={15} /> 模型总数</div>
          <div className="v">{data.models.length} <small>个</small></div>
          <div className="d up">已同步</div>
        </div>
        <div className="stat">
          <div className="k"><Settings2 size={15} /> 服务商数量</div>
          <div className="v">{summary.providerCount} <small>家</small></div>
          <div className="d up">全部在线</div>
        </div>
        <div className="stat">
          <div className="k"><Activity size={15} /> 测试记录</div>
          <div className="v">{data.results.length} <small>条</small></div>
          <div className="d">运行性能 + 能力</div>
        </div>
        <div className="stat">
          <div className="k"><CheckCircle2 size={15} /> 测试成功率</div>
          <div className="v">{summary.successRate.replace('%', '')}<small>%</small></div>
          <div className={`d ${successRateClass}`}>部分服务商额度波动</div>
        </div>
        <div className="stat">
          <div className="k"><Zap size={15} /> 能力任务</div>
          <div className="v">{data.capabilityTasks.filter(task => task.enabled).length} <small>个</small></div>
          <div className="d up">全部就绪</div>
        </div>
      </div>

      <div className="grid g-2" style={{ gridTemplateColumns: '1.3fr 1fr' }}>
        <div className="card">
          <div className="card-head"><h3>模型目录同步</h3><span className="sub">从所选服务商同步免费模型目录，自动过滤付费模型</span></div>
          <div className="card-pad">
            <div className="row between wrap" style={{ marginBottom: 16, alignItems: 'center' }}>
              <div className="row" style={{ gap: 10, alignItems: 'center' }}>
                <span className="muted" style={{ fontSize: 12.5 }}>服务商</span>
                <ProviderPicker
                  value={syncProvider}
                  providers={SYNC_PROVIDERS()}
                  onChange={setSyncProvider}
                  showSearch={false}
                  includeDefaults={false}
                  includeAll={false}
                />
              </div>
              <button className="btn btn-primary" onClick={() => void runSync()} disabled={syncing}>
                {syncing ? <Loader size={14} /> : <RefreshCw size={15} />} {syncing ? '同步中…' : '同步模型'}
              </button>
            </div>
            <div className="callout" style={{ background: 'var(--brand-2-soft)', borderColor: 'color-mix(in srgb, var(--brand-2) 30%, transparent)' }}>
              <span className="ic" style={{ color: 'var(--brand-2)' }}><Info size={18} /></span>
              <p>最近同步成功:{summary.latestSync ? `${providerLabel(summary.latestSync.provider)} · 接收 ${summary.latestSync.received_count} · 新增 ${summary.latestSync.inserted_count} / 更新 ${summary.latestSync.updated_count} (${formatDateShort(summary.latestSync.completed_at ?? summary.latestSync.started_at)})。` : '暂无同步记录。'}</p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-head"><h3>最近同步状态</h3><span className="sub">最近一次同步的接收与更新摘要</span></div>
          <div className="card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="kv"><span className="muted">服务商</span><span className="mono">{summary.latestSync ? providerLabel(summary.latestSync.provider) : '—'}</span></div>
            <div className="kv"><span className="muted">最近接收</span><span className="mono" style={{ color: 'var(--brand-2)' }}>{summary.latestSync?.received_count ?? '—'} 个模型</span></div>
            <div className="kv"><span className="muted">更新数量</span><span className="mono" style={{ color: 'var(--brand)' }}>{summary.latestSync?.updated_count ?? '—'} 个模型</span></div>
            <div className="kv"><span className="muted">同步时间</span><span className="num">{formatDateShort(summary.latestSync?.completed_at ?? summary.latestSync?.started_at)}</span></div>
          </div>
        </div>
      </div>

      <div className="grid g-3" style={{ marginTop: 16 }}>
        <div className="card">
          <div className="card-head"><h3>数据健康度</h3><span className="sub">当前数据库中的可用性与覆盖情况</span></div>
          <div className="card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            <div className="kv"><span className="muted">已测试模型</span><span className="mono">{summary.testedModels} / {data.models.length || '—'}</span></div>
            <div className="kv"><span className="muted">成功性能测试</span><span className="mono">{summary.successfulResults} / {data.results.length}</span></div>
            <div className="kv"><span className="muted">最近模型同步</span><span className="num">{formatDateShort(summary.latestSync?.completed_at ?? summary.latestSync?.started_at)}</span></div>
            <div className="kv"><span className="muted">数据库状态</span><span className="badge b-ok"><span className="d" />可读取</span></div>
          </div>
        </div>
        <div className="card">
          <div className="card-head"><h3>系统状态</h3><span className="sub">后端服务与调度运行情况</span></div>
          <div className="card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            <div className="kv"><span className="muted">后端 API</span><span className="badge b-ok"><span className="d" />正常</span></div>
            <div className="kv"><span className="muted">数据库 benchmark.db</span><span className="badge b-ok"><span className="d" />已连接</span></div>
            <div className="kv"><span className="muted">调度器</span><span className="badge b-ok"><span className="d" />空闲</span></div>
            <div className="kv"><span className="muted">受限模型</span><span className={`badge ${(data.models.filter(m => m.catalog_status === 'inactive').length) > 0 ? 'b-warn' : 'b-ok'}`}><span className="d" />{(data.models.filter(m => m.catalog_status === 'inactive').length) > 0 ? `${data.models.filter(m => m.catalog_status === 'inactive').length} 个受限` : '全部可用'}</span></div>
          </div>
        </div>
        <div className="card">
          <div className="card-head"><h3>快速管理</h3></div>
          <div className="card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button className="btn btn-soft" style={{ justifyContent: 'flex-start', padding: '12px 14px' }} onClick={() => onNavigate?.('perms')}>→ 配置 Admin Token</button>
            <button className="btn btn-soft" style={{ justifyContent: 'flex-start', padding: '12px 14px' }} onClick={() => onNavigate?.('perms')}>→ 管理服务商白名单</button>
            <button className="btn btn-soft" style={{ justifyContent: 'flex-start', padding: '12px 14px' }} onClick={() => onNavigate?.('perms')}>→ 查看操作审计</button>
            <div className="callout" style={{ background: 'var(--info-soft)', borderColor: 'color-mix(in srgb, var(--info) 30%, transparent)' }}>
              <span className="ic" style={{ color: 'var(--info)' }}><Lock size={16} /></span>
              <p>带锁操作需要 Admin Token，可在「管理权限」中配置。</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid g-2" style={{ marginTop: 16 }}>
        <div className="card">
          <div className="card-head between"><h3>模型同步历史</h3><span className="badge b-info"><span className="d" />{data.syncRuns.length} 条记录 · 最近 {Math.min(data.syncRuns.length, 10)} 条</span></div>
          <div className="card-pad" style={{ padding: 0 }}>
            <div className="table-scroll admin-history-scroll" style={{ border: 0, borderRadius: 0 }}>
              <table className="dt">
                <thead><tr><th>开始时间</th><th>服务商</th><th>状态</th><th className="col-num">接收</th><th className="col-num">新增 / 更新</th></tr></thead>
                <tbody>
                  {data.syncRuns.slice(0, 10).map(run => (
                    <tr key={run.sync_run_id}>
                      <td className="num muted">{formatDateShort(run.started_at)}</td>
                      <td>{providerLabel(run.provider)}</td>
                      <td><StatusBadge status={run.status} /></td>
                      <td className="col-num">{run.received_count}</td>
                      <td className="col-num">{run.inserted_count} / {run.updated_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!data.syncRuns.length && <div className="empty"><Server size={20} /><span>暂无同步记录</span></div>}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-head between"><h3>性能基准批次历史</h3><span className="badge b-info"><span className="d" />{data.benchmarkRuns.length} 条记录 · 最近 {Math.min(data.benchmarkRuns.length, 10)} 次</span></div>
          <div className="card-pad" style={{ padding: 0 }}>
            <div className="table-scroll admin-history-scroll" style={{ border: 0, borderRadius: 0 }}>
              <table className="dt">
                <thead><tr><th>执行时间</th><th className="col-num">模型数</th><th className="col-num">成功</th><th className="col-num">失败</th><th className="col-num">耗时</th></tr></thead>
                <tbody>
                  {data.benchmarkRuns.slice(0, 10).map(run => (
                    <tr key={run.run_id}>
                      <td className="num muted">{formatDateShort(run.created_at)}</td>
                      <td className="col-num">{run.total_models}</td>
                      <td className="col-num">{run.success_count}</td>
                      <td className="col-num" style={{ color: run.total_models - run.success_count > 0 ? 'var(--danger)' : undefined }}>{Math.max(0, run.total_models - run.success_count)}</td>
                      <td className="col-num">{formatDuration(run.duration)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!data.benchmarkRuns.length && <div className="empty"><Activity size={20} /><span>暂无性能测试批次</span></div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
