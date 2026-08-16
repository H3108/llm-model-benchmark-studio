import { Timer, CheckCircle2, Gauge, TrendingUp } from 'lucide-react'
import { ApiError, Model, Benchmark } from './api'
import { Button } from '../components/ui'
import { ModelTestStats } from './types'

export const OP_LABELS: Record<string, string> = {
  availability: '可用性',
  speed: '速度',
  latency: '延迟',
  context: '上下文',
}

export const PROFILE_LABELS: Record<string, string> = {
  default: '综合',
  coding: '代码生成',
  agent: '智能体',
  chat: '长文本',
}


export const MODEL_PAGE_SIZE = 25

export const SELECT_PAGE_SIZE = 15

export const RESULT_PAGE_SIZE = 25

export const LEADERBOARD_PAGE_SIZE = 20


export function fmt(value: number | null | undefined, suffix = '') { return value == null ? '—' : `${value.toFixed(1)}${suffix}` }

export function fmtDateTime(s: string | undefined | null) {
  if (!s) return '—'
  try {
    const d = new Date(s)
    const p = (n: number) => String(n).padStart(2, '0')
    return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
  } catch { return '—' }
}

export const CAP_CAT_LABEL: Record<string, string> = { general: '通用', code: '代码', long: '长文本' }

export function modelCapCats(m: Model): string[] {
  const keys = m.capabilities ? Object.keys(m.capabilities) : []
  if (!keys.length) return []
  const set = new Set<string>()
  for (const k of keys) {
    const key = k.toLowerCase()
    if (key.includes('code')) set.add('code')
    else if (key.includes('long') || key.includes('context')) set.add('long')
    else set.add('general')
  }
  return [...set]
}


export function benchmarkComposite(b: Benchmark): number | null {
  if (b.status !== 'success') return null
  const lat = b.latency_ms
  const tps = b.tokens_per_second
  if (lat == null && tps == null) return null
  const latScore = lat == null ? 70 : Math.max(0, Math.min(100, 100 - (lat - 200) / 16))
  const tpsScore = tps == null ? 70 : Math.max(0, Math.min(100, 30 + tps * 0.5))
  return Math.round(latScore * 0.5 + tpsScore * 0.5)
}

export function statusTone(status?: string | null): 'success' | 'danger' | 'info' | 'neutral' { return status === 'success' || status === 'PASS' ? 'success' : status === 'failed' || status === 'FAIL' ? 'danger' : status === 'running' ? 'info' : 'neutral' }

export function requestErrorMessage(error: unknown, fallback: string) {
  if (error instanceof ApiError) {
    if (error.status === 401) return '需要配置 Admin Token，请在左侧“管理权限”中填写后重试。'
    if (error.status === 403) return 'Admin Token 无效，请检查左侧“管理权限”中的 Token。'
    if (error.status === 503) return '后端未配置 Admin Token，请检查 backend/.env。'
    if (error.status === 502) return '模型服务请求失败，请检查 Provider 配置或稍后重试。'
    return error.message || fallback
  }
  if (error instanceof TypeError && /fetch/i.test(error.message)) return '无法连接后端服务，请检查后端是否启动。'
  return error instanceof Error ? error.message : fallback
}


export function modelTestStats(results: Benchmark[]) {
  const stats = new Map<string, ModelTestStats>()
  for (const result of results) {
    const timestamp = Date.parse(result.tested_at) || 0
    const current = stats.get(result.model_id)
    if (!current) {
      stats.set(result.model_id, { tested: true, successful: result.status === 'success', latestAt: timestamp, latestStatus: result.status })
      continue
    }
    current.tested = true
    current.successful ||= result.status === 'success'
    if (timestamp >= current.latestAt) {
      current.latestAt = timestamp
      current.latestStatus = result.status
    }
  }
  return stats
}


export function orderModels(models: Model[], results: Benchmark[]) {
  const stats = modelTestStats(results)
  return [...models].sort((a, b) => {
    const aStats = stats.get(a.model_id)
    const bStats = stats.get(b.model_id)
    if (!!aStats !== !!bStats) return aStats ? -1 : 1
    if (aStats && bStats) {
      if (aStats.latestAt !== bStats.latestAt) return bStats.latestAt - aStats.latestAt
      if (aStats.successful !== bStats.successful) return aStats.successful ? -1 : 1
    }
    return (a.model_name || a.model_id).localeCompare(b.model_name || b.model_id, undefined, { sensitivity: 'base' })
  })
}


export function Pagination({ page, pageSize, total, onChange }: { page: number; pageSize: number; total: number; onChange: (page: number) => void }) {
  const pageCount = Math.ceil(total / pageSize)
  if (pageCount <= 1) return null
  const first = (page - 1) * pageSize + 1
  const last = Math.min(page * pageSize, total)
  return (
    <div className="pagination" aria-label="分页">
      <span>显示 {first}-{last} / 共 {total}</span>
      <div className="pagination-actions">
        <Button variant="outline" onClick={() => onChange(page - 1)} disabled={page <= 1}>上一页</Button>
        <strong>第 {page} / {pageCount} 页</strong>
        <Button variant="outline" onClick={() => onChange(page + 1)} disabled={page >= pageCount}>下一页</Button>
      </div>
    </div>
  )
}



export const PERF_METRICS = [
  { key: 'latency', name: '延迟', desc: '完整请求平均耗时（秒）', icon: <Timer size={18} />, tone: 'blue' },
  { key: 'ttft', name: 'TTFT', desc: '首个 token 延迟（秒）', icon: <Gauge size={18} />, tone: 'teal' },
  { key: 'throughput', name: '吞吐', desc: '输出速度（tokens/秒）', icon: <TrendingUp size={18} />, tone: 'green' },
  { key: 'availability', name: '可用性', desc: '成功请求占比（%）', icon: <CheckCircle2 size={18} />, tone: 'amber' },
] as const

