export type Model = {
  id: number; provider: string; model_id: string; model_name?: string | null
  context_length?: number | null; pricing_input?: number | null; pricing_output?: number | null
  capabilities?: Record<string, unknown> | null; organization?: string | null
  family?: string | null; is_free?: boolean | null; catalog_status?: string | null
  access_status?: string | null; model_type?: string | null; tags?: unknown[] | null
  source?: string | null; source_updated_at?: string | null; last_access_checked_at?: string | null
  excluded_reason?: string | null; updated_at: string
}

export type Benchmark = {
  id: number; run_id?: string | null; provider: string; model_id: string; status: string
  latency_ms?: number | null; first_token_ms?: number | null; tokens_generated?: number | null
  tokens_per_second?: number | null; streaming_supported?: boolean | null
  streaming_status?: string | null; tested_at: string; error_message?: string | null
}

export type Score = {
  model_id: string; provider: string; availability_score: number; speed_score: number
  latency_score: number; context_score: number; overall_score: number; tests: number
  operational_score?: number; capability_score?: number; capabilities?: Record<string, number>
  success_rate: number; avg_first_token_ms?: number | null; avg_latency_ms?: number | null
  avg_tokens_per_second?: number | null
}

export type RecommendationReason = {
  score_breakdown?: { operational_score?: number; capability_score?: number; overall_score?: number }
  benchmark_count?: number
  capability_reason?: string
}

export type Recommendation = {
  task: string
  profile: string
  weights: Record<string, number>
  model: Score | null
  reason: string
  recommendation_reason: RecommendationReason
}

export type Leaderboard = { profile: string; weights: Record<string, number>; fastest_model?: Score | null; most_stable_model?: Score | null; highest_score_model?: Score | null; rankings: Score[] }

export type Intelligence = {
  model_id: string; profile: string; operational_score: number; capability_score: number
  overall_score: number; capabilities: Record<string, number>
  benchmark_statistics: { benchmark_count: number; successful_benchmark_count: number; success_rate: number; avg_first_token_ms?: number | null; avg_latency_ms?: number | null; avg_tokens_per_second?: number | null; capability_benchmark_count: number; capability_scored_count: number }
}

export type CapabilityRanking = { rank: number; model_id: string; capability: string; score: number; tests: number; successful_tests: number }
export type CapabilityTask = { id: number; task_key: string; capability: string; name: string; prompt: string; expected_format: string; enabled: boolean; version: string; created_at: string; updated_at: string }
export type CapabilityResult = { id: number; run_id?: string | null; model_id: string; provider: string; task_key: string; task_version: string; capability: string; status: string; score?: number | null; latency_ms?: number | null; first_token_ms?: number | null; tokens_generated?: number | null; tokens_per_second?: number | null; raw_output?: string | null; evaluation_details?: Record<string, unknown> | null; error_message?: string | null; tested_at: string }
export type CapabilityRun = { run_id: string; results: CapabilityResult[] }
export type BenchmarkRun = { id: number; run_id: string; created_at: string; total_models: number; success_count: number; duration?: number | null }
export type ModelSyncRun = { id: number; sync_run_id: string; provider: string; started_at: string; completed_at?: string | null; status: 'running' | 'success' | 'failed'; received_count: number; inserted_count: number; updated_count: number; inactive_count: number; error_message?: string | null }
export type AuditLog = { id: number; action: string; detail?: string | null; created_at: string }

// Use VITE_API_URL for dev (points to local backend). In production (Docker),
// set VITE_API_URL="" at build time so requests use same-origin relative URLs
// (routed by nginx). The ?? operator lets an explicit empty string take effect.
const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'
const ADMIN_TOKEN_KEY = 'benchmark-studio.admin-token'
const ADMIN_LAST_AUTH_KEY = 'benchmark-studio.admin-last-auth'

export class ApiError extends Error {
  status: number
  code?: string

  constructor(message: string, status: number, code?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

export function getAdminToken(): string {
  // The admin token is only ever read back from the user's own localStorage,
  // never baked into the bundle, so it cannot leak to page visitors.
  try { return localStorage.getItem(ADMIN_TOKEN_KEY) || '' } catch { return '' }
}

export function setAdminToken(token: string): void {
  try {
    if (token) localStorage.setItem(ADMIN_TOKEN_KEY, token)
    else localStorage.removeItem(ADMIN_TOKEN_KEY)
  } catch {
    // Storage can be unavailable in private or restricted browser contexts.
  }
}

export function getAdminLastAuth(): string {
  // ISO timestamp of the last successful token save, used only for display.
  try { return localStorage.getItem(ADMIN_LAST_AUTH_KEY) || '' } catch { return '' }
}

export function setAdminLastAuth(iso: string): void {
  try {
    if (iso) localStorage.setItem(ADMIN_LAST_AUTH_KEY, iso)
    else localStorage.removeItem(ADMIN_LAST_AUTH_KEY)
  } catch {
    // Storage can be unavailable in private or restricted browser contexts.
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const headers = new Headers(options?.headers)
  if (options?.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  const token = getAdminToken()
  if (token) headers.set('X-Admin-Token', token)
  const response = await fetch(`${API}${path}`, { ...options, headers })
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new ApiError(body.message || body.detail || `Request failed (${response.status})`, response.status, body.error)
  }
  return response.json()
}

export const api = {
  models: () => request<Model[]>('/api/models'),
  syncModels: (provider = 'openrouter') => request<Model[]>(`/api/models/sync?provider=${encodeURIComponent(provider)}`),
  results: () => request<Benchmark[]>('/api/benchmark/results'),
  benchmarkRuns: () => request<BenchmarkRun[]>('/api/benchmark/runs'),
  syncRuns: () => request<ModelSyncRun[]>('/api/models/sync/runs'),
  run: (models: string[]) => request<Benchmark[]>('/api/benchmark/run', { method: 'POST', body: JSON.stringify({ models }) }),
  capabilityTasks: () => request<CapabilityTask[]>('/api/capabilities/tasks'),
  capabilityResults: () => request<CapabilityResult[]>('/api/capabilities/results'),
  runCapability: (models: string[], tasks: string[]) => request<CapabilityRun>('/api/capabilities/benchmark', { method: 'POST', body: JSON.stringify({ models, tasks }) }),
  leaderboard: (profile = 'default', free = false) => request<Leaderboard>(`/api/leaderboard?profile=${encodeURIComponent(profile)}&free=${free}`),
  scoringProfiles: () => request<{ version: string; profiles: Record<string, { weights: Record<string, number>; operational_weights: Record<string, number>; capability_weights: Record<string, number> }> }>('/api/scoring/profiles'),
  recommend: (task = 'coding') => request<Recommendation>(`/api/recommend?task=${encodeURIComponent(task)}`),
  intelligence: (modelId: string, profile = 'coding') => request<Intelligence>(`/api/models/${encodeURIComponent(modelId)}/intelligence?profile=${encodeURIComponent(profile)}`),
  capabilityLeaderboard: (capability: string) => request<{ capability: string; rankings: CapabilityRanking[] }>(`/api/leaderboard/capability?capability=${encodeURIComponent(capability)}`),
  auditLog: (limit = 50) => request<AuditLog[]>(`/api/audit/log?limit=${limit}`),
  createAuditLog: (action: string, detail?: string) => request<AuditLog>('/api/audit/log', { method: 'POST', body: JSON.stringify({ action, detail }) }),
  verifyToken: async (token: string): Promise<{ valid: boolean; configured: boolean }> => {
    try {
      const response = await fetch(`${API}/api/admin/verify`, {
        headers: token ? { 'X-Admin-Token': token } : {},
      })
      if (!response.ok) return { valid: false, configured: false }
      return await response.json()
    } catch {
      return { valid: false, configured: false }
    }
  },
  setAdminToken,
  getAdminLastAuth,
  setAdminLastAuth,
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: any) => request<T>(path, { method: 'POST', body: JSON.stringify(body) })
}
