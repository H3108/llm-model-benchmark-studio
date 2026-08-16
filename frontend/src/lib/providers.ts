/** Friendly display names for every supported provider plus the "all" pseudo-provider. */
export const PROVIDER_LABELS: Record<string, string> = {
  all: '全部 Provider',
  openrouter: 'OpenRouter',
  siliconflow: 'SiliconFlow',
  opencode: 'OpenCode',
  tencentcloud: '腾讯云混元',
 nvidia: 'NVIDIA NIM',
 google: 'Google Gemini',
}

/** Distinct accent colors per provider for visual differentiation. */
export const PROVIDER_COLORS: Record<string, string> = {
  openrouter: '#f97316',
  siliconflow: '#0d9488',
  opencode: '#8b5cf6',
  tencentcloud: '#2563eb',
  nvidia: '#84cc16',
  google: '#ea4335',
}

export function providerColor(provider: string): string {
  return PROVIDER_COLORS[provider] ?? '#64748b'
}

/** Return a human-readable label for a provider key, falling back to the raw key. */
export function providerLabel(provider: string): string {
  return PROVIDER_LABELS[provider] ?? provider
}

/** Canonical order of providers available for catalog sync.
 *  Single source of truth so the "sync all" loop, the per-provider sync
 *  dropdown and the model picker never drift apart (kept google in sync). */
export const SYNC_PROVIDERS: string[] = [
  'openrouter', 'siliconflow', 'opencode', 'tencentcloud', 'nvidia', 'google',
]

/** Two-letter initials for provider avatars (matches prototype pv-ic). */
export function providerInitials(provider: string): string {
  const map: Record<string, string> = {
    openrouter: 'OR',
    siliconflow: 'SF',
    opencode: 'OC',
    tencentcloud: 'TC',
    nvidia: 'NV',
    google: 'GG',
  }
  return map[provider] ?? provider.slice(0, 2).toUpperCase()
}
