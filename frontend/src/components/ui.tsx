import type { ButtonHTMLAttributes, InputHTMLAttributes, PropsWithChildren } from 'react'

export function Button({ className = '', variant = 'primary', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'outline' }) {
  return <button className={`btn btn-${variant} ${className}`} {...props} />
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) { return <input className="input" {...props} /> }
export function Card({ children, className = '' }: PropsWithChildren<{ className?: string }>) { return <section className={`card ${className}`}>{children}</section> }
export function Badge({ children, tone = 'neutral' }: PropsWithChildren<{ tone?: 'neutral' | 'success' | 'danger' | 'info' | 'warn' }>) {
  const cls = tone === 'warn' ? 'badge-warning' : `badge-${tone}`
  return <span className={`badge ${cls}`}>{children}</span>
}

/* ---- Loading System: 品牌轨道环 + 顶部进度条 ----
   切换菜单 / 拉取数据时统一使用,替代旧版左上角小转圈。 */
export function TopProgress({ active }: { active: boolean }) {
  return (
    <div
      className={`top-progress ${active ? 'is-active' : ''}`}
      role="progressbar"
      aria-hidden={!active}
    >
      <span className="top-progress__bar" />
    </div>
  )
}

export function PageLoader({
  label = '正在加载数据',
  kicker = 'SYS · LOADING',
  compact = false,
}: {
  label?: string
  kicker?: string
  compact?: boolean
}) {
  return (
    <div
      className={`page-loader ${compact ? 'is-compact' : ''}`}
      role="status"
      aria-live="polite"
    >
      <div className="loader-orb" aria-hidden="true">
        <span className="ring r1" />
        <span className="ring r2" />
        <span className="ring r3" />
        <span className="core" />
      </div>
      <div className="loader-meta">
        <div className="loader-kicker">{kicker}</div>
        <div className="loader-label">
          {label}
          <span className="loader-dots"><i /><i /><i /></span>
        </div>
      </div>
    </div>
  )
}

/* 行内轨道环 — 用于按钮 / 状态条内的小型加载,与 PageLoader 同一套品牌语言 */
export function Loader({ size = 16, label }: { size?: number; label?: string }) {
  return (
    <span className="loader-ring" style={{ width: size, height: size }} role="status" aria-label={label ?? '加载中'}>
      <span className="loader-ring__spin" />
    </span>
  )
}
