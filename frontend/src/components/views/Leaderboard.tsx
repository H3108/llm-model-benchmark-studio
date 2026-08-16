import { useEffect, useState, useMemo } from 'react'
import { CheckCircle2, Code, Puzzle, Zap, Trophy } from 'lucide-react'
import { api, CapabilityRanking, Model, Benchmark, Score, type Leaderboard as LeaderboardData } from '../../lib/api'
import { Badge } from '../ui'
import { ProviderPicker } from '../pickers'
import { providerColor, PROVIDER_LABELS } from '../../lib/providers'
import { Pagination, fmt, LEADERBOARD_PAGE_SIZE } from '../../lib/format'
import { Empty } from './Empty'
import { Highlight } from './Highlight'

export function Leaderboard({ data, models }: { data: LeaderboardData | null; models: Model[] }) {
  type Focus = 'overall' | 'performance' | 'capability'
  const CAPABILITY_DIMS = [
    { key: 'coding', label: '代码生成' },
    { key: 'structured_output', label: '结构化输出' },
    { key: 'instruction_following', label: '指令遵循' },
  ] as const
  const CAPABILITY_LABEL: Record<string, string> = Object.fromEntries(CAPABILITY_DIMS.map(d => [d.key, d.label]))

  const [focus, setFocus] = useState<Focus>('overall')
  const [provider, setProvider] = useState<string>('all')
  const [capabilityFocus, setCapabilityFocus] = useState<string>('all')
  const [capabilityRows, setCapabilityRows] = useState<CapabilityRanking[]>([])
  const [loadingCapability, setLoadingCapability] = useState(false)
  const [page, setPage] = useState(1)

  const rows = data?.rankings || []
  const providers = Array.from(new Set(rows.map(r => r.provider))).filter(Boolean)
  const providerFiltered = provider === 'all' ? rows : rows.filter(r => r.provider === provider)

  useEffect(() => {
    if (focus !== 'capability') return
    setLoadingCapability(true)
    Promise.allSettled(CAPABILITY_DIMS.map(d => api.capabilityLeaderboard(d.key)))
      .then(responses => {
        const all: CapabilityRanking[] = []
        responses.forEach((res, idx) => {
          if (res.status === 'fulfilled') {
            res.value.rankings.forEach(row => {
              all.push({ ...row, capability: CAPABILITY_DIMS[idx].key })
            })
          }
        })
        setCapabilityRows(all)
      })
      .catch(() => setCapabilityRows([]))
      .finally(() => setLoadingCapability(false))
  }, [focus])

  const capabilityByModel = useMemo(() => {
    const map = new Map<string, Record<string, CapabilityRanking>>()
    for (const row of capabilityRows) {
      if (!map.has(row.model_id)) map.set(row.model_id, {})
      map.get(row.model_id)![row.capability] = row
    }
    return map
  }, [capabilityRows])

  const dimScore = (row: Score, key: string) => {
    const fromApi = capabilityByModel.get(row.model_id)?.[key]?.score
    if (fromApi != null) return fromApi
    return row.capabilities?.[key] ?? null
  }

  const avgCapability = (row: Score) => {
    const dims = CAPABILITY_DIMS.map(d => dimScore(row, d.key)).filter((v): v is number => v != null)
    return dims.length ? dims.reduce((a, b) => a + b, 0) / dims.length : 0
  }

  const ordered = useMemo(() => {
    const list = [...providerFiltered]
    if (focus === 'performance') {
      list.sort((a, b) => (b.operational_score ?? 0) - (a.operational_score ?? 0))
    } else if (focus === 'capability') {
      if (capabilityFocus === 'all') {
        list.sort((a, b) => avgCapability(b) - avgCapability(a))
      } else {
        list.sort((a, b) => {
          const sa = dimScore(a, capabilityFocus) ?? 0
          const sb = dimScore(b, capabilityFocus) ?? 0
          return sb - sa
        })
      }
    } else {
      list.sort((a, b) => b.overall_score - a.overall_score)
    }
    return list
  }, [providerFiltered, focus, capabilityFocus, capabilityByModel])

  useEffect(() => { setPage(1) }, [focus, provider, capabilityFocus, ordered.length])
  useEffect(() => {
    const pageCount = Math.ceil(ordered.length / LEADERBOARD_PAGE_SIZE)
    if (pageCount > 0 && page > pageCount) setPage(pageCount)
  }, [page, ordered.length])

  const visibleRows = ordered.slice((page - 1) * LEADERBOARD_PAGE_SIZE, page * LEADERBOARD_PAGE_SIZE)

  const getRankClass = (index: number) => {
    if (index === 0) return 'r1'
    if (index === 1) return 'r2'
    if (index === 2) return 'r3'
    return ''
  }

  const getMedal = (index: number) => {
    if (index === 0) return '🥇'
    if (index === 1) return '🥈'
    if (index === 2) return '🥉'
    return (index + 1).toString()
  }

  const champScore = (row: Score) => {
    if (focus === 'performance') return row.operational_score ?? 0
    if (focus === 'capability') return avgCapability(row)
    return row.overall_score
  }
  const champScoreLabel = focus === 'performance' ? '运行性能分' : focus === 'capability' ? '能力综合分' : '综合分'

  const perfSorted = useMemo(() => [...providerFiltered].sort((a, b) => (b.operational_score ?? 0) - (a.operational_score ?? 0)), [providerFiltered])
  const fastest = useMemo(() => [...providerFiltered].sort((a, b) => (a.avg_latency_ms ?? Infinity) - (b.avg_latency_ms ?? Infinity))[0], [providerFiltered])
  const stableSorted = useMemo(() => [...providerFiltered].sort((a, b) => b.success_rate - a.success_rate || (b.overall_score - a.overall_score)), [providerFiltered])

  const scoreBar = (score: number, width = 78) => (
    <div style={{ display: 'flex', gap: 9, justifyContent: 'flex-end', alignItems: 'center' }}>
      <span className="score-number">{score.toFixed(1)}</span>
      <div className="sbar" style={{ width }}>
        <i style={{ width: `${Math.min(score, 100)}%` }} />
      </div>
    </div>
  )

  const infoBar = () => {
    if (focus === 'performance') return '按运行性能分排序：综合考量可用性、速度、延迟与上下文。'
    if (focus === 'capability') {
      if (loadingCapability) return '正在加载能力评分…'
      if (!capabilityRows.length) return '暂无能力评分数据，当前显示能力综合分。'
      const label = CAPABILITY_LABEL[capabilityFocus] ?? '综合'
      return `按“${label}”能力维度排序，分数为该维度独立评测平均分。`
    }
    return null
  }

  const focusLabels: Record<Focus, string> = { overall: '综合', performance: '运行性能', capability: '能力' }

  return (
    <div className="page-content">
      <div className="champs">
        {ordered.slice(0, 3).map((row, index) => (
          <div key={row.model_id} className={`champ ${getRankClass(index)}`}>
            <div className="cr">
              <span className="medal">{getMedal(index)}</span>
              <span className="rk">{index + 1}</span>
            </div>
            <div className="cid">
              <span className="id-name">{row.model_id.split('/').pop()}</span>
            </div>
            <div className="cpv">
              <span className="pv-ic" style={{ width: 18, height: 18, borderRadius: 5, fontSize: 9, background: providerColor(row.provider) }}>
                {(PROVIDER_LABELS[row.provider] ?? row.provider).slice(0, 2).toUpperCase()}
              </span>
              {PROVIDER_LABELS[row.provider] ?? row.provider}
            </div>
            <div className="cscore">
              <span className="score-number" style={{ fontSize: 20 }}>{champScore(row).toFixed(1)}</span>
              <span className="clbl">{champScoreLabel}</span>
            </div>
            <div className="cmeta">
              {focus === 'capability' ? (
                <>
                  <span>代码 {fmt(dimScore(row, 'coding'))}</span>
                  <span>结构化 {fmt(dimScore(row, 'structured_output'))}</span>
                  <span>指令 {fmt(dimScore(row, 'instruction_following'))}</span>
                </>
              ) : (
                <>
                  <span>延迟 {fmt(row.avg_latency_ms, 'ms')}</span>
                  <span>TTFT {fmt(row.avg_first_token_ms, 'ms')}</span>
                  <span>吞吐 {fmt(row.avg_tokens_per_second)} t/s</span>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="score-cards" style={{ marginBottom: 18 }}>
        {focus === 'performance' ? (
          <>
            <Highlight title="运行性能评分最高" icon={<Trophy />} tone="gold" score={perfSorted[0] || data?.highest_score_model} scoreField="operational" />
            <Highlight title="平均延迟最低" icon={<Zap />} tone="blue" score={fastest} valueFormatter={s => `${fmt(s.avg_latency_ms, ' ms')} · ${s.overall_score.toFixed(1)} 分`} />
            <Highlight title="稳定性最高" icon={<CheckCircle2 />} tone="green" score={stableSorted[0]} valueFormatter={s => `${(s.success_rate * 100).toFixed(1)}% · ${s.overall_score.toFixed(1)} 分`} />
          </>
        ) : focus === 'capability' ? (
          <>
            <Highlight title="能力综合评分最高" icon={<Trophy />} tone="gold" score={ordered[0]} valueFormatter={s => `${avgCapability(s).toFixed(1)} 分 · ${s.tests} 次测试`} />
            <Highlight title="代码生成最强" icon={<Code />} tone="blue" score={ordered.slice().sort((a, b) => (dimScore(b, 'coding') ?? 0) - (dimScore(a, 'coding') ?? 0))[0]} valueFormatter={s => `代码 ${fmt(dimScore(s, 'coding'))}`} />
            <Highlight title="结构化输出最强" icon={<Puzzle />} tone="green" score={ordered.slice().sort((a, b) => (dimScore(b, 'structured_output') ?? 0) - (dimScore(a, 'structured_output') ?? 0))[0]} valueFormatter={s => `结构化 ${fmt(dimScore(s, 'structured_output'))}`} />
          </>
        ) : (
          <>
            <Highlight title="免费模型综合评分最高" icon={<Trophy />} tone="gold" score={ordered[0] || data?.highest_score_model} />
            <Highlight title="平均延迟最低" icon={<Zap />} tone="blue" score={data?.fastest_model} />
            <Highlight title="稳定性最高" icon={<CheckCircle2 />} tone="green" score={data?.most_stable_model} />
          </>
        )}
      </div>

      <div className="card">
        <div className="card-head" style={{ justifyContent: 'space-between' }}>
          <div>
            <h3>模型排行榜</h3>
            <span className="sub">仅展示模型注册表中标记为免费的模型，并且必须有真实性能基准记录。</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
            <ProviderPicker
              value={provider}
              providers={providers}
              onChange={setProvider}
              counts={{ all: rows.length, ...Object.fromEntries(providers.map(p => [p, rows.filter(r => r.provider === p).length])) }}
              showSearch={false}
              includeDefaults={false}
            />
            <div className="seg sm">
              <button className={focus === 'overall' ? 'active' : ''} onClick={() => setFocus('overall')}>综合</button>
              <button className={focus === 'performance' ? 'active' : ''} onClick={() => setFocus('performance')}>运行性能</button>
              <button className={focus === 'capability' ? 'active' : ''} onClick={() => setFocus('capability')}>能力</button>
            </div>
            {focus === 'capability' && (
              <ProviderPicker
                value={capabilityFocus}
                providers={CAPABILITY_DIMS.map(d => d.key)}
                onChange={setCapabilityFocus}
                labels={{ all: '全部维度', ...CAPABILITY_LABEL }}
                showSearch={false}
                includeDefaults={false}
              />
            )}
            <Badge tone="info"><span className="d" />基于成功且符合资格的记录</Badge>
          </div>
        </div>
        {infoBar() && (
          <div style={{ padding: '10px 16px', background: 'var(--info-soft)', borderBottom: '1px solid var(--border)', fontSize: 12, color: 'var(--text-2)' }}>
            {infoBar()}
          </div>
        )}
        <div className="table-scroll" style={{ border: 0, borderRadius: 0 }}>
          <table className="results-table leaderboard-table">
            <thead>
              <tr>
                <th style={{ width: 56, textAlign: 'center' }}>排名</th>
                <th>模型</th>
                <th>服务商</th>
                {focus === 'performance' && (
                  <>
                    <th>运行性能分</th>
                    <th>可用性</th>
                    <th>速度</th>
                    <th>延迟</th>
                    <th>上下文</th>
                    <th>吞吐</th>
                    <th>成功率</th>
                  </>
                )}
                {focus === 'capability' && (
                  <>
                    <th>能力综合分</th>
                    <th>代码生成</th>
                    <th>结构化输出</th>
                    <th>指令遵循</th>
                    <th>成功率</th>
                  </>
                )}
                {focus === 'overall' && (
                  <>
                    <th>综合分</th>
                    <th>能力分</th>
                    <th>延迟</th>
                    <th>TTFT</th>
                    <th>吞吐</th>
                    <th>成功率</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row, index) => {
                const globalIndex = (page - 1) * LEADERBOARD_PAGE_SIZE + index
                return (
                  <tr key={row.model_id}>
                    <td style={{ textAlign: 'center' }}>
                      {globalIndex < 3 ? (
                        <span style={{ fontSize: 18 }}>{getMedal(globalIndex)}</span>
                      ) : (
                        <div className={`rank ${getRankClass(globalIndex)}`}>{globalIndex + 1}</div>
                      )}
                    </td>
                    <td>
                      <div className="model-cell">
                        <span className="model-dot" style={{ background: providerColor(row.provider) }} />
                        <div>
                          <strong>{row.model_id.split('/').pop()}</strong>
                          <small>{row.model_id}</small>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="provider-tag" style={{ ["--pc" as string]: providerColor(row.provider) } as React.CSSProperties}>
                        {PROVIDER_LABELS[row.provider] ?? row.provider}
                      </span>
                    </td>
                    {focus === 'performance' && (
                      <>
                        <td>{scoreBar(row.operational_score ?? 0)}</td>
                        <td className="mono">{fmt(row.availability_score)}</td>
                        <td className="mono">{fmt(row.speed_score)}</td>
                        <td className="mono">{fmt(row.avg_latency_ms, ' ms')}</td>
                        <td className="mono">{fmt(row.context_score)}</td>
                        <td className="mono">{fmt(row.avg_tokens_per_second)}</td>
                        <td className="mono">{fmt(row.success_rate * 100, '%')}</td>
                      </>
                    )}
                    {focus === 'capability' && (
                      <>
                        <td>{scoreBar(avgCapability(row))}</td>
                        <td className="mono">{fmt(dimScore(row, 'coding'))}</td>
                        <td className="mono">{fmt(dimScore(row, 'structured_output'))}</td>
                        <td className="mono">{fmt(dimScore(row, 'instruction_following'))}</td>
                        <td className="mono">{fmt(row.success_rate * 100, '%')}</td>
                      </>
                    )}
                    {focus === 'overall' && (
                      <>
                        <td>{scoreBar(row.overall_score)}</td>
                        <td className="mono">{fmt(row.capability_score)}</td>
                        <td className="mono">{fmt(row.avg_latency_ms, ' ms')}</td>
                        <td className="mono">{fmt(row.avg_first_token_ms, ' ms')}</td>
                        <td className="mono">{fmt(row.avg_tokens_per_second)}</td>
                        <td className="mono">{fmt(row.success_rate * 100, '%')}</td>
                      </>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
          {!ordered.length && (
            <Empty
              text={models.length ? `暂无${focusLabels[focus]}数据` : '暂无模型数据，请先同步模型'}
            />
          )}
        </div>
        <Pagination page={page} pageSize={LEADERBOARD_PAGE_SIZE} total={ordered.length} onChange={setPage} />
      </div>
      <p className="muted" style={{ fontSize: '11.5px', marginTop: 12 }}>
        * {focus === 'performance' ? '运行性能分 = 可用性、速度、延迟、上下文的加权得分。' : focus === 'capability' ? '能力综合分 = 各能力维度独立评测平均得分。' : '综合分 = 运行性能 60% + 能力 40%。'}
        覆盖 {providers.length} 家提供方共 {rows.length} 个免费模型。数据时间 {new Date().toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}。
      </p>
    </div>
  )
}

