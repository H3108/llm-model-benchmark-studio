import { useEffect, useRef, useState } from 'react'
import { ChevronDown, X } from 'lucide-react'

export interface MSelOption {
  value: string
  label: string
  color?: string
  initials?: string
  count?: number
}

interface Props {
  label: string
  options: MSelOption[]
  selected: Set<string>
  onChange: (next: Set<string>) => void
  maxShownChips?: number
}

/**
 * 多选下拉字段：触发按钮(label ▾ + 已选数 badge) + 已选 chip 列表 + 弹出列表(全选/清空 + checkbox 列表)。
 * - 点外部 / Esc 关闭 popover
 * - 已选 chip 超过 maxShownChips 时折叠成 `+N`
 * - 列表自带滚动(> 6 项 自动出滚动条)
 */
export function MultiSelectChipField({
  label,
  options,
  selected,
  onChange,
  maxShownChips = 4,
}: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onEsc)
    }
  }, [open])

  const total = options.length
  // 只统计当前 options 范围内的已选项（外部可能传多了 set）
  const selCount = options.reduce((n, o) => n + (selected.has(o.value) ? 1 : 0), 0)
  const noneSelected = selCount === 0

  const toggleOne = (v: string) => {
    const next = new Set(selected)
    if (next.has(v)) next.delete(v)
    else next.add(v)
    onChange(next)
  }
  const selectAll = () => onChange(new Set(options.map((o) => o.value)))
  const clearAll = () => onChange(new Set())

  const selectedOptions = options.filter((o) => selected.has(o.value))
  const shownChips = selectedOptions.slice(0, maxShownChips)
  const overflow = selectedOptions.length - shownChips.length

  return (
    <div className="msel" ref={ref}>
      <div className="filter-group">
        <span className="lbl">{label}</span>
        <button
          type="button"
          className={`msel-trigger ${open ? 'open' : ''}`}
          onClick={() => setOpen((o) => !o)}
        >
          <span className="msel-trigger-label">{noneSelected ? label : `${label} · ${selCount}`}</span>
          {!noneSelected && <span className="msel-trigger-badge">{selCount}</span>}
          <ChevronDown size={13} className="msel-trigger-caret" />
        </button>
        {shownChips.map((o) => (
          <span key={o.value} className="chip msel-chip">
            {o.label}
            <X
              size={12}
              className="msel-chip-x"
              onClick={(e) => {
                e.stopPropagation()
                toggleOne(o.value)
              }}
            />
          </span>
        ))}
        {overflow > 0 && <span className="chip msel-chip-more">+{overflow}</span>}
      </div>
      {open && (
        <div className="msel-panel">
          <div className="msel-head">
            <button type="button" className="msel-head-btn" onClick={selectAll}>全选</button>
            <button type="button" className="msel-head-btn" onClick={clearAll}>清空</button>
            <span className="msel-head-count">已选 {selCount} / {total}</span>
          </div>
          <div className="msel-list">
            {options.map((o) => {
              const isOn = selected.has(o.value)
              return (
                <div
                  key={o.value}
                  className={`msel-row ${isOn ? 'on' : ''}`}
                  onClick={() => toggleOne(o.value)}
                  role="checkbox"
                  aria-checked={isOn}
                >
                  <span className={`msel-check ${isOn ? 'on' : ''}`}>
                    {isOn && (
                      <svg viewBox="0 0 12 12" width="10" height="10" fill="none" aria-hidden="true">
                        <path
                          d="M2.5 6 l2.5 2.5 l4.5 -5"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    )}
                  </span>
                  {o.initials && (
                    <span
                      className="msel-logo"
                      style={o.color ? { background: o.color } : undefined}
                    >
                      {o.initials}
                    </span>
                  )}
                  <span className="msel-label">{o.label}</span>
                  {typeof o.count === 'number' && (
                    <span className="msel-count">{o.count}</span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}