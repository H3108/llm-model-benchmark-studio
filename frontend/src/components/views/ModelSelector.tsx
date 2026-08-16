import { useMemo, useEffect, useState } from 'react'
import { Copy } from 'lucide-react'
import { Model } from '../../lib/api'
import { ProviderPicker } from '../pickers'
import { providerInitials, providerColor, PROVIDER_LABELS } from '../../lib/providers'
import { Pagination, SELECT_PAGE_SIZE } from '../../lib/format'
import { Empty } from './Empty'

export function ModelSelector({
  models,
  checked,
  setChecked,
  setSelected,
}: {
  models: Model[];
  checked: string[];
  setChecked: (checked: string[] | ((prev: string[]) => string[])) => void;
  setSelected: (m: Model | null) => void;
}) {
  const [page, setPage] = useState(1)
  const [providerFilter, setProviderFilter] = useState('all')

  const filtered = models.filter(m => {
    if (!m.is_free) return false
    if (providerFilter !== 'all' && m.provider !== providerFilter) return false
    return true
  })
  const labProviders = [...new Set(models.filter(m => m.is_free).map(m => m.provider))].sort()
  const providerCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    models.filter(m => m.is_free).forEach(m => { counts[m.provider] = (counts[m.provider] || 0) + 1 })
    return counts
  }, [models])
  const pageCount = Math.ceil(filtered.length / SELECT_PAGE_SIZE)
  const visibleModels = filtered.slice((page - 1) * SELECT_PAGE_SIZE, page * SELECT_PAGE_SIZE)
  useEffect(() => { setPage(1) }, [models.length, providerFilter])
  useEffect(() => { if (pageCount > 0 && page > pageCount) setPage(pageCount) }, [page, pageCount])

  const toggleLabCheck = (id: string) => {
    setChecked((prev: string[]) => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }
  const toggleVisible = () => {
    const visibleIds = visibleModels.map(model => model.model_id)
    const allVisibleSelected = visibleIds.length > 0 && visibleIds.every(id => checked.includes(id))
    setChecked(prev => allVisibleSelected
      ? prev.filter(id => !visibleIds.includes(id))
      : [...new Set([...prev, ...visibleIds])])
  }

  return (
    <div className="card">
      <div className="card-head between">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h3>选择模型</h3>
          <span className="sub">免费模型 · 点击行首勾选</span>
        </div>
        <ProviderPicker
          value={providerFilter}
          providers={labProviders}
          counts={providerCounts}
          onChange={setProviderFilter}
          showSearch={false}
          includeDefaults={false}
        />
      </div>
      <div className="card-pad" style={{ padding: 0 }}>
        <div className="tbl-wrap" style={{ border: 0, borderRadius: 0 }}>
          <table className="dt">
            <thead><tr>
              <th className="col-sel"><span className={`cbx ${visibleModels.length && visibleModels.every(m => checked.includes(m.model_id)) ? 'on' : ''}`} role="checkbox" aria-label="全选" onClick={toggleVisible} /></th>
              <th>模型 ID</th>
              <th>提供方</th>
              <th className="col-mid">上下文</th>
              <th>状态</th>
            </tr></thead>
            <tbody>
              {visibleModels.map(model => {
                const isChecked = checked.includes(model.model_id)
                const showSuf = model.is_free && !model.model_id.includes(':free')
                return (
                  <tr key={model.model_id} className={isChecked ? 'sel' : ''}>
                    <td className="col-sel"><span className={`cbx ${isChecked ? 'on' : ''}`} role="checkbox" onClick={(e) => { e.stopPropagation(); toggleLabCheck(model.model_id) }} /></td>
                    <td>
                      <div className="id-cell">
                        <span className="id-name" style={{ cursor: 'pointer' }} onClick={() => setSelected(model)}>{model.model_id}{showSuf ? <span className="suf">:free</span> : ''}</span>
                        <span className="id-copy" title="复制 ID" onClick={(e) => { e.stopPropagation(); navigator.clipboard?.writeText(model.model_id) }}><Copy size={13} /></span>
                      </div>
                    </td>
                    <td><span className="pv"><span className="pv-ic" style={{ background: providerColor(model.provider) }}>{providerInitials(model.provider)}</span>{PROVIDER_LABELS[model.provider] ?? model.provider}</span></td>
                    <td className="col-mid num">{model.context_length ? `${Math.round(model.context_length / 1000)}K` : '—'}</td>
                    <td><span className={`sp ${model.catalog_status === 'inactive' ? 'bad' : 'ok'}`}><span className="d" />{model.catalog_status === 'inactive' ? '已停用' : '可用'}</span></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {!filtered.length && <Empty text="暂无免费模型" />}
        </div>
        <Pagination page={page} pageSize={SELECT_PAGE_SIZE} total={filtered.length} onChange={setPage} />
      </div>
    </div>
  )
}

