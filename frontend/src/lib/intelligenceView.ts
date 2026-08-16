import type { Intelligence, Leaderboard as LeaderboardData, Model } from './api'

export const CAPABILITY_LABELS: Record<string, string> = {
  coding: '代码生成',
  reasoning: '推理',
  structured_output: '结构化输出',
  instruction_following: '指令遵循',
  tool_calling: '工具调用',
  long_context: '长文本',
}

export const OP_LABELS: Record<string, string> = {
  availability: '可用性',
  speed: '速度',
  latency: '延迟',
  context: '上下文',
}

export const CAPABILITY_HINTS: Record<string, string> = {
  coding: '让模型写一个最简单的 FastAPI hello world 接口，考察其基础代码生成能力。',
  reasoning: '给出需要多步推理的问题，考察模型的逻辑推导与思考能力。',
  structured_output: '要求模型返回包含 name、status、summary 三个字段的 JSON 对象，考察结构化输出能力。',
  instruction_following: '要求用恰好 3 个要点说明 API 健康检查的作用、且不加引言，考察指令遵循能力。',
  tool_calling: '给出可调用的工具定义，考察模型能否正确生成工具调用参数。',
  long_context: '提供长文本上下文，考察模型在长上下文中的信息提取与记忆能力。',
}

export type ConfidenceLevel = 'high' | 'medium' | 'low'

export interface Confidence {
  level: ConfidenceLevel
  label: string
  score: number
}

export interface Percentile {
  rank: number
  total: number
  label: string
}

export interface Insight {
  type: 'strength' | 'risk' | 'info'
  title: string
  description: string
}

export interface RadarItem {
  key: string
  label: string
  score: number
}

export interface RankedCapability extends RadarItem {
  rank: number
}

export interface MiniStat {
  label: string
  value: string
}

export interface IntelligenceView {
  modelId: string
  modelName: string
  provider: string
  profile: string
  overallScore: number
  operationalScore: number
  capabilityScore: number
  percentile: Percentile | null
  verdict: string
  insights: Insight[]
  radar: RadarItem[]
  capabilitiesRanked: RankedCapability[]
  miniStats: MiniStat[]
  confidence: Confidence
  sampleCount: number
}

export function deriveConfidence(totalSamples: number): Confidence {
  if (totalSamples >= 500) return { level: 'high', label: '高', score: 0.92 }
  if (totalSamples >= 100) return { level: 'high', label: '高', score: 0.86 }
  if (totalSamples >= 50) return { level: 'high', label: '高', score: 0.78 }
  if (totalSamples >= 20) return { level: 'medium', label: '中', score: 0.68 }
  if (totalSamples >= 5) return { level: 'medium', label: '中', score: 0.58 }
  return { level: 'low', label: '低', score: 0.42 }
}

export function derivePercentile(modelId: string, leaderboard: LeaderboardData): Percentile | null {
  const index = leaderboard.rankings.findIndex(row => row.model_id === modelId)
  if (index === -1) return null
  const total = leaderboard.rankings.length
  const percentile = Math.max(1, Math.ceil(((index + 1) / total) * 100))
  return { rank: index + 1, total, label: `前 ${percentile}%` }
}

export function generateVerdict(
  intelligence: Intelligence,
  model: Model,
  percentile: Percentile | null,
): string {
  const { overall_score, operational_score, capability_score, capabilities, benchmark_statistics } = intelligence
  const parts: string[] = []

  parts.push(
    `${model.model_name || model.model_id} 综合评分 ${overall_score}，运行性能 ${operational_score}，能力评分 ${capability_score}。`,
  )

  const entries = Object.entries(capabilities)
  if (entries.length) {
    entries.sort((a, b) => b[1] - a[1])
    const [bestKey, bestScore] = entries[0]
    const [worstKey, worstScore] = entries[entries.length - 1]
    parts.push(
      `最强维度为 ${CAPABILITY_LABELS[bestKey] || bestKey}（${bestScore}），最弱维度为 ${CAPABILITY_LABELS[worstKey] || worstKey}（${worstScore}）。`,
    )
  }

  const latency = benchmark_statistics.avg_latency_ms
  const ttft = benchmark_statistics.avg_first_token_ms
  if (latency != null && ttft != null) {
    parts.push(`平均延迟 ${Math.round(latency)}ms，首 Token ${Math.round(ttft)}ms。`)
  }

  parts.push(
    `基于 ${benchmark_statistics.benchmark_count} 条性能测试与 ${benchmark_statistics.capability_scored_count} 条能力测试样本。`,
  )

  if (percentile) {
    parts.push(`综合排名${percentile.label}。`)
  }

  if (entries.length) {
    const topKey = entries[0][0]
    const recommendation =
      topKey === 'coding'
        ? '代码生成任务'
        : topKey === 'reasoning'
          ? '推理与分析任务'
          : topKey === 'tool_calling'
            ? '智能体/工具调用任务'
            : topKey === 'long_context'
              ? '长文本处理任务'
              : topKey === 'structured_output'
                ? '结构化输出任务'
                : '通用指令任务'
    parts.push(`建议优先用于 ${recommendation}。`)
  }

  return parts.join('')
}

export function generateInsights(intelligence: Intelligence, confidence: Confidence): Insight[] {
  const { capabilities, benchmark_statistics } = intelligence
  const insights: Insight[] = []
  const entries = Object.entries(capabilities).sort((a, b) => b[1] - a[1])

  const strengths = entries.filter(([, score]) => score >= 85).slice(0, 2)
  if (strengths.length) {
    const names = strengths.map(([key]) => CAPABILITY_LABELS[key] || key).join('、')
    insights.push({ type: 'strength', title: '优势', description: `${names} 表现突出，可作为首选场景。` })
  }

  const risks = entries.filter(([, score]) => score <= 70).slice(0, 2)
  if (risks.length) {
    const names = risks.map(([key]) => CAPABILITY_LABELS[key] || key).join('、')
    insights.push({ type: 'risk', title: '风险', description: `${names} 相对薄弱，复杂任务需谨慎验证。` })
  } else if (entries.length && entries[entries.length - 1][1] < 80) {
    const [key, score] = entries[entries.length - 1]
    insights.push({
      type: 'risk',
      title: '风险',
      description: `${CAPABILITY_LABELS[key] || key}（${score}）是最弱维度，可能成为瓶颈。`,
    })
  }

  const totalSamples = benchmark_statistics.benchmark_count + benchmark_statistics.capability_scored_count
  insights.push({
    type: 'info',
    title: `置信度 ${confidence.score}`,
    description: `基于 ${totalSamples} 条样本，结论可信度为${confidence.label}。`,
  })

  return insights
}

function formatMs(value: number | null | undefined): string {
  return value == null ? '—' : `${Math.round(value)}ms`
}

function formatTps(value: number | null | undefined): string {
  return value == null ? '—' : `${value.toFixed(1)} t/s`
}

function formatContext(value: number | null | undefined): string {
  if (value == null) return '—'
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)}K`
  return String(value)
}

export function buildIntelligenceView({
  intelligence,
  model,
  leaderboard,
  profile = 'default',
}: {
  intelligence: Intelligence
  model: Model
  leaderboard?: LeaderboardData
  profile?: string
}): IntelligenceView {
  const totalSamples = intelligence.benchmark_statistics.benchmark_count + intelligence.benchmark_statistics.capability_scored_count
  const confidence = deriveConfidence(totalSamples)
  const percentile = leaderboard ? derivePercentile(model.model_id, leaderboard) : null

  const radar = Object.entries(intelligence.capabilities).map(([key, score]) => ({
    key,
    label: CAPABILITY_LABELS[key] || key,
    score,
  }))

  const capabilitiesRanked = [...radar]
    .sort((a, b) => b.score - a.score)
    .map((item, index) => ({ ...item, rank: index + 1 }))

  const chips = [
    { label: '运行性能', value: String(intelligence.operational_score) },
    { label: '能力评分', value: String(intelligence.capability_score) },
  ]
  if (percentile) {
    chips.push({ label: '综合排名', value: percentile.label })
  }

  const availability =
    leaderboard?.rankings.find(row => row.model_id === model.model_id)?.availability_score ??
    (intelligence.benchmark_statistics.success_rate || 0) * 100

  const miniStats: MiniStat[] = [
    { label: '平均延迟 Latency', value: formatMs(intelligence.benchmark_statistics.avg_latency_ms) },
    { label: '首 Token TTFT', value: formatMs(intelligence.benchmark_statistics.avg_first_token_ms) },
    { label: '吞吐 Throughput', value: formatTps(intelligence.benchmark_statistics.avg_tokens_per_second) },
    { label: '可用性 Availability', value: `${Math.round(availability)}%` },
    { label: '上下文 Context', value: formatContext(model.context_length) },
  ]

  return {
    modelId: model.model_id,
    modelName: model.model_name || model.model_id,
    provider: model.provider,
    profile,
    overallScore: intelligence.overall_score,
    operationalScore: intelligence.operational_score,
    capabilityScore: intelligence.capability_score,
    percentile,
    verdict: generateVerdict(intelligence, model, percentile),
    insights: generateInsights(intelligence, confidence),
    radar,
    capabilitiesRanked,
    miniStats,
    confidence,
    sampleCount: totalSamples,
  }
}

export function capabilityLabel(key: string): string {
  return CAPABILITY_LABELS[key] || key
}
