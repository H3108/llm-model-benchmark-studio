

export type View = 'home' | 'explorer' | 'lab' | 'cap' | 'results' | 'leaderboard' | 'intelligence' | 'recommend' | 'admin' | 'perms' | 'system';

export type SortKey = 'model_id' | 'status' | 'first_token_ms' | 'latency_ms' | 'tokens_per_second' | 'tested_at' | 'score'

export type SortDirection = 'asc' | 'desc'


export type ModelTestStats = { tested: boolean; successful: boolean; latestAt: number; latestStatus?: string }


export type ResultRow = {
  kind: 'perf' | 'cap'
  id: string
  model_id: string
  provider: string
  type: string
  status: string
  latency_ms?: number | null
  first_token_ms?: number | null
  tokens_per_second?: number | null
  score: number | null
  tested_at: string
  error_message?: string | null
}

