import { useEffect, useState } from 'react'
import { Activity, Server, Copy, Search, CircleDot, Target, CheckCircle2, FlaskConical } from 'lucide-react'
import { Model, Benchmark } from '../../lib/api'
import { Button, Input } from '../ui'
import { providerInitials, providerColor, PROVIDER_LABELS } from '../../lib/providers'
import { Pagination, MODEL_PAGE_SIZE, fmtDateTime, modelTestStats, CAP_CAT_LABEL, modelCapCats } from '../../lib/format'
import { View } from '../../lib/types'
import { Empty } from './Empty'

export function Explorer({ 
  models, 
  results, 
  labChecked,
  setLabChecked,
  setSelected, 
  setView 
}: { 
  models: Model[]; 
  results: Benchmark[]; 
  labChecked: string[];
  setLabChecked: (checked: string[] | ((prev: string[]) => string[])) => void;
  setSelected: (m: Model | null) => void; 
  setView: (v: View) => void;
}) {
  const [query, setQuery] = useState('')
  const [provider, setProvider] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [capFilter, setCapFilter] = useState('all')
  const checked = labChecked
  const setChecked = setLabChecked
  const [page, setPage] = useState(1)

  const testStats = modelTestStats(results)
  const testedIds = new Set(testStats.keys())
  const successfulIds = new Set([...testStats].filter(([, stats]) => stats.successful).map(([id]) => id))
  const providers = [...new Set(models.map(m => m.provider))].sort()
  const filtered = models.filter(m => {
    const q = query.trim().toLowerCase()
    if (q && !`${m.model_name || ''} ${m.model_id} ${m.organization || ''}`.toLowerCase().includes(q)) return false
    if (provider !== 'all' && m.provider !== provider) return false
    if (statusFilter === 'available' && m.catalog_status === 'inactive') return false
    if (statusFilter === 'inactive' && m.catalog_status !== 'inactive') return false
    if (statusFilter === 'partial') return false
    if (capFilter !== 'all' && !modelCapCats(m).includes(capFilter)) return false
    return true
  })
  const pageCount = Math.ceil(filtered.length / MODEL_PAGE_SIZE)
  const visibleModels = filtered.slice((page - 1) * MODEL_PAGE_SIZE, page * MODEL_PAGE_SIZE)
  useEffect(() => { setPage(1) }, [query, provider, statusFilter, capFilter, results.length, models.length])
  useEffect(() => { if (pageCount > 0 && page > pageCount) setPage(pageCount) }, [page, pageCount])
  const toggle = (id: string) => setChecked(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  const toggleVisible = () => {
    const visibleIds = visibleModels.map(model => model.model_id)
    const allVisibleSelected = visibleIds.length > 0 && visibleIds.every(id => checked.includes(id))
    setChecked(prev => allVisibleSelected
      ? prev.filter(id => !visibleIds.includes(id))
      : [...new Set([...prev, ...visibleIds])])
  }
  return (
    <div className="page-content">
      <div className="metrics-row four">
        <div className="stat">
          <div className="k"><Server size={15} /> 免费模型</div>
          <div className="v">{models.filter(m => m.is_free).length} <small>个</small></div>
          <div className="d up">全部可测</div>
        </div>
        <div className="stat">
          <div className="k"><CircleDot size={15} /> 提供方</div>
          <div className="v">{providers.length} <small>家</small></div>
          <div className="d up">全部在线</div>
        </div>
        <div className="stat">
          <div className="k"><CheckCircle2 size={15} /> 已测试</div>
          <div className="v">{testedIds.size} <small>个</small></div>
          <div className="d up">{models.length ? Math.round(testedIds.size / models.length * 100) : 0}% 覆盖</div>
        </div>
        <div className="stat">
          <div className="k"><Activity size={15} /> 测试成功率</div>
          <div className="v">{results.length ? Math.round(results.filter(r => r.status === 'success').length / results.length * 100) : 0}<small>%</small></div>
          <div className="d warn">部分额度波动</div>
        </div>
      </div>

        <div className="tbl-bar">
          <div className="search-wrap">
            <Search size={16} />
            <Input placeholder="搜索模型 ID、能力或提供方…" value={query} onChange={e => setQuery(e.target.value)} />
          </div>
          <Button variant="ghost" onClick={() => setView('lab')}><FlaskConical size={14} /> 性能测试</Button>
          <Button variant="ghost" onClick={() => setView('cap')}><Target size={14} /> 能力测试</Button>
        </div>

      <div className="filters">
        <div className="filter-group">
          <span className="lbl">提供方</span>
          <span className={`chip ${provider === 'all' ? 'on' : ''}`} onClick={() => setProvider('all')}>全部</span>
          {providers.map(p => (
            <span key={p} className={`chip ${provider === p ? 'on' : ''}`} onClick={() => setProvider(p)}>{PROVIDER_LABELS[p] ?? p}</span>
          ))}
        </div>
        <span className="filter-divider" />
        <div className="filter-group">
          <span className="lbl">状态</span>
          <span className={`chip ${statusFilter === 'all' ? 'on' : ''}`} onClick={() => setStatusFilter('all')}>全部</span>
          <span className={`chip ${statusFilter === 'available' ? 'on' : ''}`} onClick={() => setStatusFilter('available')}>可用</span>
          <span className={`chip ${statusFilter === 'partial' ? 'on' : ''}`} onClick={() => setStatusFilter('partial')}>部分完成</span>
          <span className={`chip ${statusFilter === 'inactive' ? 'on' : ''}`} onClick={() => setStatusFilter('inactive')}>已停用</span>
        </div>
        <span className="filter-divider" />
        <div className="filter-group">
          <span className="lbl">能力</span>
          <span className={`chip ${capFilter === 'all' ? 'on' : ''}`} onClick={() => setCapFilter('all')}>全部</span>
          <span className={`chip ${capFilter === 'general' ? 'on' : ''}`} onClick={() => setCapFilter('general')}>通用</span>
          <span className={`chip ${capFilter === 'code' ? 'on' : ''}`} onClick={() => setCapFilter('code')}>代码</span>
          <span className={`chip ${capFilter === 'long' ? 'on' : ''}`} onClick={() => setCapFilter('long')}>长文本</span>
        </div>
      </div>

      <div className={`batchbar ${checked.length ? 'show' : ''}`}>
        <span className="cnt">已选 {checked.length} 个</span>
        <span className="muted" style={{ fontSize: 12 }}>对其发起运行性能或能力测试</span>
        <span className="spacer">
          <Button variant="ghost" onClick={() => setChecked([])}>清除</Button>
          <Button variant="primary" onClick={() => setView('lab')}><FlaskConical size={14} /> 性能测试</Button>
          <Button variant="primary" onClick={() => setView('cap')}><Target size={14} /> 能力测试</Button>
        </span>
      </div>

      <div className="tbl-wrap">
        <table className="dt">
          <thead><tr>
            <th className="col-sel"><span className={`cbx ${visibleModels.length && visibleModels.every(m => checked.includes(m.model_id)) ? 'on' : ''}`} role="checkbox" aria-label="全选" onClick={toggleVisible} /></th>
            <th>模型 ID</th>
            <th>提供方</th>
            <th className="col-mid">上下文</th>
            <th className="col-mid">定价</th>
            <th>能力</th>
            <th>状态</th>
            <th className="col-num">最后同步</th>
          </tr></thead>
          <tbody>
            {visibleModels.map(model => {
              const cats = modelCapCats(model)
              const isChecked = checked.includes(model.model_id)
              const showSuf = model.is_free && !model.model_id.includes(':free')
              return (
                <tr key={model.model_id} className={isChecked ? 'sel' : ''}>
                  <td className="col-sel"><span className={`cbx ${isChecked ? 'on' : ''}`} role="checkbox" onClick={(e) => { e.stopPropagation(); toggle(model.model_id) }} /></td>
                  <td>
                    <div className="id-cell">
                      <span className="id-name" style={{ cursor: 'pointer' }} onClick={() => setSelected(model)}>{model.model_id}{showSuf ? <span className="suf">:free</span> : ''}</span>
                      <span className="id-copy" title="复制 ID" onClick={(e) => { e.stopPropagation(); navigator.clipboard?.writeText(model.model_id) }}><Copy size={13} /></span>
                    </div>
                  </td>
                  <td><span className="pv"><span className="pv-ic" style={{ background: providerColor(model.provider) }}>{providerInitials(model.provider)}</span>{PROVIDER_LABELS[model.provider] ?? model.provider}</span></td>
                  <td className="col-mid num">{model.context_length ? `${Math.round(model.context_length / 1000)}K` : '—'}</td>
                  <td className="col-mid">{model.is_free ? <span className="tag-free">免费</span> : <span className="tag-paid">付费</span>}</td>
                  <td className="muted">{cats.length ? cats.map(c => CAP_CAT_LABEL[c] ?? c).join(' / ') : '通用'}</td>
                  <td><span className={`sp ${model.catalog_status === 'inactive' ? 'bad' : 'ok'}`}><span className="d" />{model.catalog_status === 'inactive' ? '已停用' : '可用'}</span></td>
                  <td className="col-num muted">{fmtDateTime(model.updated_at)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {!filtered.length && <Empty text={models.length ? '当前筛选条件下没有模型' : '暂无模型，请先同步模型库'} />}
      </div>
      <Pagination page={page} pageSize={MODEL_PAGE_SIZE} total={filtered.length} onChange={setPage} />
    </div>
  )
}


