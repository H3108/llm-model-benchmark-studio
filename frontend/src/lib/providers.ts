/**
 * Provider display metadata — built-in fallback + dynamic loading from /api/providers.
 *
 * The built-in 6 providers are hard-coded here as a fallback so the UI renders
 * correctly even before (or without) the backend being reachable. On app mount,
 * `ensureProvidersLoaded()` fetches `/api/providers` and replaces the cache with
 * the backend's view (which includes dynamically-configured custom providers).
 * If the fetch fails, the fallback is kept silently — no error thrown.
 */

export interface ProviderMeta {
  id: string
  label: string
  color: string
  initials: string
  syncable: boolean
}

// ── Built-in fallback (matches backend main.py /api/providers built-in list) ──
const FALLBACK: ProviderMeta[] = [
  { id: 'openrouter', label: 'OpenRouter', color: '#f97316', initials: 'OR', syncable: true },
  { id: 'siliconflow', label: 'SiliconFlow', color: '#0d9488', initials: 'SF', syncable: true },
  { id: 'opencode', label: 'OpenCode', color: '#8b5cf6', initials: 'OC', syncable: true },
  { id: 'tencentcloud', label: '腾讯云混元', color: '#2563eb', initials: 'TC', syncable: true },
  { id: 'nvidia', label: 'NVIDIA NIM', color: '#84cc16', initials: 'NV', syncable: true },
  { id: 'google', label: 'Google Gemini', color: '#ea4335', initials: 'GG', syncable: true },
  { id: 'all', label: '全部服务商', color: '#64748b', initials: 'ALL', syncable: false },
]

// ── Runtime cache (replaced after successful /api/providers fetch) ──
let _cache: ProviderMeta[] | null = null
let _loadPromise: Promise<void> | null = null

function metaById(id: string): ProviderMeta | undefined {
  return (_cache ?? FALLBACK).find((m) => m.id === id)
}

/** Human-readable label for a provider key; falls back to the raw key. */
export function providerLabel(provider: string): string {
  return metaById(provider)?.label ?? provider
}

/** Accent color for a provider; falls back to slate. */
export function providerColor(provider: string): string {
  return metaById(provider)?.color ?? '#64748b'
}

/** Two-letter initials for provider avatars. */
export function providerInitials(provider: string): string {
  return metaById(provider)?.initials ?? provider.slice(0, 2).toUpperCase()
}

/**
 * Providers available for catalog sync (excludes the "all" pseudo-provider).
 * Single source of truth so the sync-all loop, dropdown, and picker stay in sync.
 */
export function SYNC_PROVIDERS(): string[] {
  return (_cache ?? FALLBACK)
    .filter((m) => m.syncable && m.id !== 'all')
    .map((m) => m.id)
}

/** All provider labels as a record (for components expecting the old dict shape). */
export const PROVIDER_LABELS: Record<string, string> = new Proxy(
  {},
  {
    get: (_target, prop: string) => providerLabel(prop),
  },
)

/** Fetch /api/providers and populate the runtime cache. Idempotent + safe. */
export async function ensureProvidersLoaded(): Promise<void> {
  if (_cache || _loadPromise) return _loadPromise ?? undefined
  _loadPromise = (async () => {
    try {
      const res = await fetch('/api/providers')
      if (!res.ok) return
      const data: ProviderMeta[] = await res.json()
      if (Array.isArray(data) && data.length > 0) {
        // Always keep the "all" pseudo-provider at the end.
        const hasAll = data.some((m) => m.id === 'all')
        _cache = hasAll ? data : [...data, FALLBACK.find((m) => m.id === 'all')!]
      }
    } catch {
      // Network error or backend unreachable — keep fallback silently.
    } finally {
      _loadPromise = null
    }
  })()
  return _loadPromise
}
