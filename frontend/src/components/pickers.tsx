import { useState } from 'react'
import type { ReactNode } from 'react'
import { ChevronDown, Search, SlidersHorizontal } from 'lucide-react'
import { PROVIDER_LABELS, providerColor, SYNC_PROVIDERS } from '../lib/providers'
import { CAPABILITY_LABELS } from '../lib/intelligenceView'

export type ProfileConfig = {
  weights: Record<string, number>
  operational_weights: Record<string, number>
  capability_weights: Record<string, number>
}

function summarizeProfile(cfg?: ProfileConfig): string {
  if (!cfg) return ''
  const capW = cfg.capability_weights || {}
  if (Object.keys(capW).length === 0) return '纯运行性能（可用性/速度/延迟/上下文）'
  const parts = Object.entries(capW)
    .sort((a, b) => b[1] - a[1])
    .map(([k, w]) => `${CAPABILITY_LABELS[k] ?? k} ${Math.round(w * 100)}%`)
  return `重 ${parts.join(' · ')}`
}

export function ProviderPicker({
  value,
  providers,
  onChange,
  counts,
  labels,
  icon,
  showSearch = true,
  includeDefaults = true,
  includeAll = true,
}: {
  value: string
  providers: string[]
  onChange: (provider: string) => void
  counts?: Record<string, number>
  labels?: Record<string, string>
  icon?: ReactNode
  showSearch?: boolean
  includeDefaults?: boolean
  includeAll?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const defaultProviders = includeDefaults ? SYNC_PROVIDERS : []
  const allProviders = Array.from(new Set([...defaultProviders, ...providers])).sort()
  const filtered = allProviders.filter(option => {
    if (!query.trim()) return true
    const label = labels?.[option] ?? PROVIDER_LABELS[option] ?? option
    return label.toLowerCase().includes(query.trim().toLowerCase())
  })
  const options = includeAll ? ['all', ...filtered] : filtered

  const formatLabel = (option: string) => {
    const label = option === 'all' ? (labels?.all ?? '全部') : (labels?.[option] ?? PROVIDER_LABELS[option] ?? option)
    const count = counts?.[option]
    return count != null ? `${label} (${count})` : label
  }

  return (
    <div
      className="provider-picker"
      data-open={open}
      onBlur={event => {
        const next = event.relatedTarget as Node | null
        if (next && event.currentTarget.contains(next)) return
        window.setTimeout(() => setOpen(false), 120)
      }}
    >
      {icon != null ? <span className="provider-picker-icon">{icon}</span> : <SlidersHorizontal size={15} className="provider-picker-icon" />}
      <button
        type="button"
        className="provider-picker-trigger"
        onClick={() => setOpen(current => !current)}
        aria-label="筛选 Provider"
        aria-expanded={open}
      >
        <span>
          {value !== 'all' && PROVIDER_LABELS[value] && (
            <span className="opt-dot" style={{ background: providerColor(value) }} />
          )}
          {formatLabel(value)}
        </span>
        <ChevronDown size={14} data-icon="chevron" />
      </button>
      {open && (
        <div className="provider-picker-menu" role="listbox">
          {showSearch && (
            <div className="provider-picker-search">
              <Search size={14} />
              <input
                autoFocus
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder="搜索 Provider"
                aria-label="搜索 Provider"
              />
            </div>
          )}
          {options.length ? options.map(option => {
            return (
              <button
                type="button"
                key={option}
                className={`provider-picker-option ${value === option ? 'is-selected' : ''}`}
                onMouseDown={event => event.preventDefault()}
                onClick={() => { onChange(option); setQuery(''); setOpen(false) }}
                role="option"
                aria-selected={value === option}
              >
                <span>
                  {option !== 'all' && PROVIDER_LABELS[option] && (
                    <span className="opt-dot" style={{ background: providerColor(option) }} />
                  )}
                  {formatLabel(option)}
                </span>
                {value === option && <span className="provider-picker-check">✓</span>}
              </button>
            )
          }) : <div className="provider-picker-empty">没有匹配的 Provider</div>}
        </div>
      )}
    </div>
  )
}

const PROFILE_OPTIONS = [
  { value: 'default', label: '综合', sub: 'Default', color: 'var(--brand)' },
  { value: 'coding', label: '代码生成', sub: 'Coding', color: 'var(--brand-2)' },
  { value: 'agent', label: '智能体', sub: 'Agent', color: 'var(--info)' },
  { value: 'chat', label: '长文本', sub: 'Long', color: 'var(--warn)' },
] as const

export function ProfilePicker({ value, onChange, profiles }: { value: string; onChange: (profile: string) => void; profiles?: Record<string, ProfileConfig> }) {
  const [open, setOpen] = useState(false)
  const selected = PROFILE_OPTIONS.find(o => o.value === value) ?? PROFILE_OPTIONS[0]
  return (
    <div
      className="profile-picker"
      data-open={open}
      onBlur={event => {
        const next = event.relatedTarget as Node | null
        if (next && event.currentTarget.contains(next)) return
        window.setTimeout(() => setOpen(false), 120)
      }}
    >
      <button
        type="button"
        className="profile-picker-trigger"
        onClick={() => setOpen(current => !current)}
        aria-label="评分配置"
        aria-expanded={open}
      >
        <span>
          <span className="prof-dot" style={{ background: selected.color }} />
          {selected.label}
        </span>
        <ChevronDown size={14} data-icon="chevron" />
      </button>
      {open && (
        <div className="profile-picker-menu" role="listbox">
          {PROFILE_OPTIONS.map(option => {
            const desc = summarizeProfile(profiles?.[option.value])
            return (
              <button
                type="button"
                key={option.value}
                className={`profile-picker-option ${value === option.value ? 'is-selected' : ''}`}
                onMouseDown={event => event.preventDefault()}
                onClick={() => { onChange(option.value); setOpen(false) }}
                role="option"
                aria-selected={value === option.value}
              >
                <span>
                  <span className="prof-dot" style={{ background: option.color }} />
                  <span className="prof-label">
                    <span>{option.label}</span>
                    <small>{option.sub}{desc ? ` · ${desc}` : ''}</small>
                  </span>
                </span>
                {value === option.value && <span className="profile-picker-check">✓</span>}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
