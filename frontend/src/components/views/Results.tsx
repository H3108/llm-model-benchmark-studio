import { useEffect, useState, useMemo } from 'react'
import { Search } from 'lucide-react'
import { Benchmark, CapabilityResult } from '../../lib/api'
import { CAPABILITY_LABELS } from '../../lib/intelligenceView'
import { Input } from '../ui'
import { providerInitials, providerColor, PROVIDER_LABELS } from '../../lib/providers'
import { RESULT_PAGE_SIZE, Pagination, fmtDateTime, benchmarkComposite } from '../../lib/format'
import { ResultRow, SortDirection, SortKey } from '../../lib/types'
import { Empty } from './Empty'

export function Results({ results, capabilityResults }: { results: Benchmark[]; capabilityResults: CapabilityResult[] }) {
  const [sort, setSort] = useState<SortKey>('tested_at')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [query, setQuery] = useState('')
  const [statusSeg, setStatusSeg] = useState('all')
  const [typeSeg, setTypeSeg] = useState<'all' | 'perf' | 'cap'>('all')
  const [page, setPage] = useState(1)

  const allRows = useMemo<ResultRow[]>(() => {
    const perfRows = results.map(r => ({
      kind: 'perf' as const,
      id: `p-${r.id}`,
      model_id: r.model_id,
      provider: r.provider,
      type: '运行性能',
      status: r.status,
      latency_ms: r.latency_ms,
      first_token_ms: r.first_token_ms,
      tokens_per_second: r.tokens_per_second,
      score: benchmarkComposite(r),
      tested_at: r.tested_at,
      error_message: r.error_message,
    }))
    const capRows = capabilityResults.map(r => ({
      kind: 'cap' as const,
      id: `c-${r.id}`,
      model_id: r.model_id,
      provider: r.provider,
      type: CAPABILITY_LABELS[r.capability] ?? r.capability,
      status: r.status,
      latency_ms: r.latency_ms,
      first_token_ms: r.first_token_ms,
      tokens_per_second: r.tokens_per_second,
      score: r.score ?? null,
      tested_at: r.tested_at,
      error_message: r.error_message,
    }))
    return [...perfRows, ...capRows]
  }, [results, capabilityResults])

  const filtered = allRows.filter(r => {
    const q = query.trim().toLowerCase()
    if (q && !`${r.model_id} ${r.provider} ${r.type}`.toLowerCase().includes(q)) return false
    if (statusSeg === 'success' && r.status !== 'success') return false
    if (statusSeg === 'failed' && r.status !== 'failed') return false
    if (typeSeg === 'perf' && r.kind !== 'perf') return false
    if (typeSeg === 'cap' && r.kind !== 'cap') return false
    return true
  })

  const ordered = [...filtered].sort((a, b) => {
    let cmp = 0
    if (sort === 'score') {
      const av = a.score ?? -1
      const bv = b.score ?? -1
      cmp = av - bv
    } else if (sort === 'model_id') {
      cmp = a.model_id.localeCompare(b.model_id)
    } else if (sort === 'status') {
      cmp = a.status.localeCompare(b.status)
    } else if (sort === 'tested_at') {
      cmp = (Date.parse(a.tested_at) || 0) - (Date.parse(b.tested_at) || 0)
    } else {
      const av = a[sort]
      const bv = b[sort]
      if (av == null && bv == null) cmp = 0
      else if (av == null) cmp = 1
      else if (bv == null) cmp = -1
      else cmp = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: 'base' })
    }
    return sortDirection === 'asc' ? cmp : -cmp
  })
  const visibleResults = ordered.slice((page - 1) * RESULT_PAGE_SIZE, page * RESULT_PAGE_SIZE)
  useEffect(() => { setPage(1) }, [query, statusSeg, typeSeg, sort, sortDirection, allRows.length])
  const setSortKey = (key: SortKey) => {
    if (sort === key) setSortDirection(direction => direction === 'asc' ? 'desc' : 'asc')
    else {
      setSort(key)
      setSortDirection(key === 'model_id' || key === 'tested_at' ? 'asc' : 'desc')
    }
  }
  const sortableTh = (key: SortKey, label: string, cls = '') => (
    <th key={key} className={`sortable ${cls}`} onClick={() => setSortKey(key)}>
      {label} <span className="ar">{sort === key ? (sortDirection === 'asc' ? '↑' : '↓') : '↕'}</span>
    </th>
  )
  const numCell = (v: number | null | undefined, suffix: string) => v == null ? <span className="mid">—</span> : <>{v.toFixed(1)}{suffix}</>

  return (
    <div className="page-content">
      <div className="metrics-row results-metrics">
        <div className="stat">
          <div className="k">测试记录</div>
          <div className="v">{allRows.length} <small>条</small></div>
          <div className="d">运行性能 + 能力</div>
        </div>
        <div className="stat">
          <div className="k">成功率</div>
          <div className="v">{(() => {
            const ok = allRows.filter(r => r.status === 'success').length
            return allRows.length ? Math.round(ok / allRows.length * 100) : '—'
          })()}<small>%</small></div>
          <div className="d warn">{allRows.filter(r => r.status === 'success').length} 成功</div>
        </div>
        <div className="stat">
          <div className="k">平均 TTFT</div>
          <div className="v">{(() => {
            const values = allRows.flatMap(r => r.first_token_ms == null ? [] : [r.first_token_ms])
            return values.length ? Math.round(values.reduce((s, v) => s + v, 0) / values.length) : '—'
          })()} <small>ms</small></div>
          <div className="d">含失败重试</div>
        </div>
        <div className="stat">
          <div className="k">平均延迟</div>
          <div className="v">{(() => {
            const values = allRows.flatMap(r => r.latency_ms == null ? [] : [r.latency_ms])
            return values.length ? Math.round(values.reduce((s, v) => s + v, 0) / values.length) : '—'
          })()} <small>ms</small></div>
          <div className="d">端到端</div>
        </div>
        <div className="stat">
          <div className="k">平均吞吐</div>
          <div className="v">{(() => {
            const values = allRows.flatMap(r => r.tokens_per_second == null ? [] : [r.tokens_per_second])
            return values.length ? (values.reduce((s, v) => s + v, 0) / values.length).toFixed(1) : '—'
          })()} <small>t/s</small></div>
          <div className="d up">流式输出</div>
        </div>
        <div className="stat">
          <div className="k">流式成功</div>
          <div className="v">{results.filter(r => r.streaming_status === 'PASS').length} <small>条</small></div>
          <div className="d up">流式输出通过</div>
        </div>
      </div>

      <div className="tbl-bar">
        <div className="search-wrap">
          <Search size={16} />
          <Input placeholder="筛选模型或批次…" value={query} onChange={e => setQuery(e.target.value)} />
        </div>
        <div className="seg sm">
          <button className={statusSeg === 'all' ? 'active' : ''} onClick={() => setStatusSeg('all')}>全部</button>
          <button className={statusSeg === 'success' ? 'active' : ''} onClick={() => setStatusSeg('success')}>成功</button>
          <button className={statusSeg === 'failed' ? 'active' : ''} onClick={() => setStatusSeg('failed')}>失败</button>
        </div>
        <div className="seg sm">
          <button className={typeSeg === 'all' ? 'active' : ''} onClick={() => setTypeSeg('all')}>全部类型</button>
          <button className={typeSeg === 'perf' ? 'active' : ''} onClick={() => setTypeSeg('perf')}>性能</button>
          <button className={typeSeg === 'cap' ? 'active' : ''} onClick={() => setTypeSeg('cap')}>能力</button>
        </div>
      </div>

      <div className="tbl-wrap">
        <table className="dt">
          <thead><tr>
            {sortableTh('model_id', '模型')}
            <th>提供方</th>
            <th>类型</th>
            {sortableTh('latency_ms', '延迟', 'col-num')}
            {sortableTh('first_token_ms', 'TTFT', 'col-num')}
            {sortableTh('tokens_per_second', '吞吐', 'col-num')}
            {sortableTh('score', '得分', 'col-num')}
            {sortableTh('status', '状态')}
            {sortableTh('tested_at', '时间', 'col-num')}
            <th>错误信息</th>
          </tr></thead>
          <tbody>
            {visibleResults.map(row => {
              const isFree = row.model_id.toLowerCase().includes(':free')
              const baseId = isFree ? row.model_id.replace(/:free$/i, '') : row.model_id
              const stLabel = row.status === 'success' ? '成功' : '失败'
              const stTone = row.status === 'success' ? 'ok' : 'bad'
              return (
                <tr key={row.id}>
                  <td>
                    <div className="id-cell">
                      <span className="id-name">{baseId}{isFree && <span className="suf">:free</span>}</span>
                    </div>
                  </td>
                  <td><span className="pv"><span className="pv-ic" style={{ background: providerColor(row.provider) }}>{providerInitials(row.provider)}</span>{PROVIDER_LABELS[row.provider] ?? row.provider}</span></td>
                  <td className="muted">{row.type}</td>
                  <td className="col-num">{numCell(row.latency_ms, ' ms')}</td>
                  <td className="col-num">{numCell(row.first_token_ms, ' ms')}</td>
                  <td className="col-num">{numCell(row.tokens_per_second, ' t/s')}</td>
                  <td className="col-num">{row.score != null ? <span className="score-num">{row.score.toFixed(1)}</span> : <span className="mid">—</span>}</td>
                  <td><span className={`sp ${stTone}`}><span className="d" />{stLabel}</span></td>
                  <td className="col-num muted">{fmtDateTime(row.tested_at)}</td>
                  <td className="err-cell">{row.error_message || '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {!ordered.length && <Empty text="暂无测试数据，请选择模型执行性能或能力测试" />}
      </div>
      <Pagination page={page} pageSize={RESULT_PAGE_SIZE} total={ordered.length} onChange={setPage} />
    </div>
  )
}

