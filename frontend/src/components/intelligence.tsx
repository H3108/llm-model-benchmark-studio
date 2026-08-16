import type { Insight, IntelligenceView, MiniStat, RankedCapability } from '../lib/intelligenceView'

const DIM_ORDER = ['reasoning', 'coding', 'structured_output', 'instruction_following', 'tool_calling', 'long_context']
const DIM_LABELS: Record<string, string> = {
  reasoning: '推理',
  coding: '代码',
  structured_output: '结构化',
  instruction_following: '通用',
  tool_calling: '工具',
  long_context: '长文',
}
const DIM_LABELS_RANK: Record<string, string> = {
  reasoning: '推理 Reasoning',
  coding: '代码 Coding',
  structured_output: '结构化 Struct.',
  instruction_following: '通用 General',
  tool_calling: '工具调用 Tool',
  long_context: '长文本 Long',
}

function dimColor(score: number): string {
  if (score >= 85) return 'var(--brand-2)'
  if (score >= 70) return 'var(--info)'
  return 'var(--warn)'
}

export function RadarChart({ items, weights }: { items: { key: string; label: string; score: number }[]; weights?: Record<string, number> }) {
  const map = new Map(items.map(it => [it.key, it.score]))
  const scores = DIM_ORDER.map(k => map.get(k) ?? 0)
  const weightMap = weights ?? {}
  const labels = DIM_ORDER.map(k => DIM_LABELS[k])
  const max = 100
  const viewW = 360
  const viewH = 360
  const cx = 180
  const cy = 190
  const rOuter = 100
  const ringRadii = [100, 66, 33]
  const angle = (i: number) => (Math.PI * 2 * i) / 6 - Math.PI / 2
  const unit = (i: number): [number, number] => [Math.cos(angle(i)), Math.sin(angle(i))]
  const point = (i: number, rr: number): [number, number] => [cx + rr * Math.cos(angle(i)), cy + rr * Math.sin(angle(i))]
  const polyOuter = scores.map((s, i) => point(i, (s / max) * rOuter).join(',')).join(' ')
  const rings = ringRadii.map(rr => DIM_ORDER.map((_, i) => point(i, rr).join(',')).join(' '))

  // Label + score are stacked as one block outside the outer ring so they never
  // overlap the data polygon or the axis spokes.
  const labelOffset = rOuter + 26
  const blockHalf = 7
  const labelPos = DIM_ORDER.map((k, i) => {
    const [ux, uy] = unit(i)
    const weighted = weightMap[k] != null && weightMap[k] > 0
    const anchor: 'middle' | 'start' | 'end' = Math.abs(ux) < 0.01 ? 'middle' : ux > 0 ? 'start' : 'end'
    const centerX = cx + ux * labelOffset
    const centerY = cy + uy * labelOffset
    return { x: centerX, y: centerY - blockHalf, anchor, weighted }
  })

  return (
    <svg viewBox={`0 0 ${viewW} ${viewH}`} width={viewW} height={viewH} role="img" aria-label="能力雷达图">
      <defs>
        <linearGradient id="radarGradIntel" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--brand-2)" stopOpacity=".38" />
          <stop offset="1" stopColor="var(--brand)" stopOpacity=".14" />
        </linearGradient>
      </defs>
      <g stroke="var(--border)" strokeWidth="1" fill="none" opacity="0.85">
        {rings.map((pts, i) => (
          <polygon key={i} points={pts} />
        ))}
      </g>
      <g stroke="var(--border)" strokeWidth="1" strokeDasharray="3 3" opacity="0.7">
        {DIM_ORDER.map((_, i) => {
          const [x, y] = point(i, rOuter)
          return <line key={i} x1={cx} y1={cy} x2={x} y2={y} />
        })}
      </g>
      <polygon className="radar-area" points={polyOuter} fill="url(#radarGradIntel)" stroke="var(--brand)" strokeWidth="2.2" strokeLinejoin="round" />
      {scores.map((s, i) => {
        const k = DIM_ORDER[i]
        const weighted = weightMap[k] != null && weightMap[k] > 0
        const [x, y] = point(i, (s / max) * rOuter)
        return <circle key={i} cx={x} cy={y} r={weighted ? 5 : 3.8} fill={dimColor(s)} stroke={weighted ? 'var(--brand)' : 'var(--surface)'} strokeWidth={weighted ? 2.2 : 1.2} />
      })}
      {labels.map((label, i) => {
        const p = labelPos[i]
        const s = Math.round(scores[i])
        return (
          <text key={`l-${i}`} x={p.x} y={p.y} textAnchor={p.anchor} dominantBaseline="middle" className={`radar-label ${p.weighted ? 'is-weighted' : ''}`} fill={p.weighted ? 'var(--brand)' : 'var(--text-2)'} fontSize="13.5" fontWeight={p.weighted ? 700 : 600} fontFamily="var(--font-mono)">
            {label}
            <tspan x={p.x} dy="14" fontSize="12.5" fontWeight="700" fontFamily="var(--font-display)" fill="var(--text)">
              {s}
            </tspan>
          </text>
        )
      })}
    </svg>
  )
}

export function ScoreGauge({ score }: { score: number }) {
  const w = 170
  const h = 92
  const cx = w / 2
  const cy = h - 10
  const r = w / 2 - 16
  const circ = Math.PI * r
  const pct = Math.max(0, Math.min(100, score)) / 100
  const dash = circ * pct
  const path = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`
  return (
    <div className="score-gauge">
      <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`综合评分 ${score}`}>
        <defs>
          <linearGradient id="gaugeGradIntel" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="var(--brand)" />
            <stop offset="100%" stopColor="var(--brand-2)" />
          </linearGradient>
        </defs>
        <path className="gauge-track" d={path} />
        <path className="gauge-fill" d={path} strokeDasharray={`${dash} ${circ}`} />
      </svg>
      <div className="gauge-center">
        <div className="pct">{Math.round(score)}%</div>
        <div className="pct-label">达标率</div>
      </div>
    </div>
  )
}

function tierLabel(score: number): string {
  if (score >= 85) return '优秀'
  if (score >= 70) return '良好'
  return '待提升'
}

export function VerdictBand({ view }: { view: IntelligenceView }) {
  return (
    <div className="intell-verdict">
      <div className="iv-score-block">
        <div className="iv-score">
          <span className="score-label">Overall Score</span>
          <div className="score-value-row">
            <span className="score-value">{view.overallScore.toFixed(1)}</span>
            <span className="score-outof">/ 100</span>
          </div>
          <span className="score-rank">
            <span className="rank-dot" />
            {tierLabel(view.overallScore)} · {view.percentile ? view.percentile.label : '未入榜'}
          </span>
        </div>
        <ScoreGauge score={view.overallScore} />
      </div>
      <div className="iv-verdict">
        <div className="iv-verdict-top">
          <span className="iv-tag">诊断结论</span>
          <span className="iv-model mono">{view.modelName} · {view.provider}</span>
          <span className="badge b-teal" style={{ marginLeft: 'auto' }}>
            <span className="d" />
            {view.sampleCount} 样本 · 置信 {view.confidence.score.toFixed(2)}
          </span>
        </div>
        <p className="iv-text" dangerouslySetInnerHTML={{ __html: view.verdict }} />
        <div className="iv-chips">
          <div className="vchip">
            <span className="vck">运行性能</span>
            <span className="vcv">{view.operationalScore.toFixed(1)}</span>
          </div>
          <div className="vchip">
            <span className="vck">能力评分</span>
            <span className="vcv">{view.capabilityScore.toFixed(1)}</span>
          </div>
          {view.percentile && (
            <div className="vchip">
              <span className="vck">综合排名</span>
              <span className="vcv">{view.percentile.label}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const INSIGHT_ICONS: Record<string, React.ReactNode> = {
  strength: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M20 6 9 17l-5-5"/></svg>
  ),
  risk: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>
  ),
  info: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/></svg>
  ),
}

export function InsightsCard({ insights }: { insights: Insight[] }) {
  return (
    <div className="card">
      <div className="card-head between"><h3>模型洞察</h3><span className="sub">推荐理由与风险</span></div>
      <div className="card-pad" style={{ gap: 16 }}>
        {insights.map((it, i) => (
          <div key={i} className={`insight ${it.type === 'strength' ? 'ok' : it.type === 'risk' ? 'warn' : 'info'}`}>
            <div className="ic">{INSIGHT_ICONS[it.type]}</div>
            <div className="body">
              <div className="it">{it.title}</div>
              <div className="id">{it.description}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function CapabilityRankingCard({ items }: { items: RankedCapability[] }) {
  return (
    <div className="card">
      <div className="card-head"><h3>能力维度排行</h3><span className="sub">6 维度 · 由强到弱</span></div>
      <div className="card-pad">
        <div className="cap-list loose">
          {items.map((it) => {
            const color = dimColor(it.score)
            return (
              <div className="cap-row" key={it.key}>
                <span className="cap-idx">{it.rank}</span>
                <span className="cn">{DIM_LABELS_RANK[it.key] ?? it.label}</span>
                <div className="cm">
                  <div className="sbar" style={{ flex: 1, minWidth: 120 }}>
                    <i style={{ width: `${Math.min(it.score, 100)}%`, background: color }} />
                  </div>
                  <span className="cv" style={{ color }}>{Math.round(it.score)}</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function MiniStatIcon(label: string): React.ReactNode {
  if (label.includes('Latency')) return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
  )
  if (label.includes('TTFT')) return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v20M2 12h20M6 6l12 12M18 6 6 18"/></svg>
  )
  if (label.includes('Throughput')) return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M13 2 3 14h7l-1 8 10-12h-7z"/></svg>
  )
  if (label.includes('Availability')) return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.1V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10"/><circle cx="18" cy="17" r="4"/><path d="M18 15v4"/></svg>
  )
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M8 4v16"/></svg>
  )
}

export function MiniStats({ stats }: { stats: MiniStat[] }) {
  return (
    <div className="card">
      <div className="card-head"><h3>关键指标</h3><span className="sub">运行性能快照</span></div>
      <div className="card-pad">
        <div className="mini-row">
          {stats.map((s) => (
            <div className="mini-stat" key={s.label}>
              <div className="ic">{MiniStatIcon(s.label)}</div>
              <div>
                <div className="mv">{s.value}</div>
                <div className="mk">{s.label}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
