import { useRef, useEffect, useState } from 'react'
import { ShieldAlert, AlertCircle, Activity, CircleDot, X, Shield } from 'lucide-react'
import { api, setAdminLastAuth, getAdminLastAuth, ApiError, AuditLog, Benchmark } from '../../lib/api'
import { Loader } from '../ui'

export function PermissionsPage({ adminToken, onTokenChange }: { adminToken: string; onTokenChange: (token: string) => void }) {
  const [tokenDraft, setTokenDraft] = useState(adminToken)
  const [showToken, setShowToken] = useState(false)
  const [tokenError, setTokenError] = useState('')
  const [lastAuth, setLastAuth] = useState(() => getAdminLastAuth())
  const [auditLog, setAuditLog] = useState<AuditLog[]>([])
  const [auditLoading, setAuditLoading] = useState(false)
  const [auditAuthError, setAuditAuthError] = useState(false)
  const tokenInputRef = useRef<HTMLInputElement>(null)

  const permissions = [
    { action: '浏览模型与结果', guest: true, admin: true },
    { action: '运行 Benchmark', guest: true, admin: true },
    { action: '同步模型目录', guest: false, admin: true },
    { action: '配置 Admin Token', guest: false, admin: true },
    { action: '管理提供方白名单', guest: false, admin: true },
    { action: '查看操作审计', guest: false, admin: true },
  ]

  const isAdmin = adminToken.trim().length > 0
  const role = isAdmin ? 'admin' : 'viewer'

  const loadAuditLog = async () => {
    setAuditLoading(true)
    setAuditAuthError(false)
    try {
      const rows = await api.auditLog(20)
      setAuditLog(rows)
    } catch (e) {
      // A 403 means the Admin Token is missing or doesn't match the backend,
      // not that there is no data — distinguish it from a genuinely empty log.
      if (e instanceof ApiError && e.status === 403) setAuditAuthError(true)
      setAuditLog([])
    } finally {
      setAuditLoading(false)
    }
  }

  useEffect(() => {
    loadAuditLog()
  }, [])

  const applyToken = async (token: string) => {
    const trimmed = token.trim()
    setTokenError('')
    if (!trimmed) {
      onTokenChange('')
      setAdminLastAuth('')
      setLastAuth('')
      await api.createAuditLog('清除 Admin Token', '管理员退出管理员模式').catch(() => {})
      loadAuditLog()
      return
    }
    const result = await api.verifyToken(trimmed)
    if (!result.valid) {
      setTokenError(result.configured ? 'Token 无效，与后端 ADMIN_TOKEN 不一致。' : '后端未配置 ADMIN_TOKEN，无法校验。')
      return
    }
    onTokenChange(trimmed)
    const iso = new Date().toISOString()
    setAdminLastAuth(iso)
    setLastAuth(iso)
    await api.createAuditLog('更新 Admin Token', '由管理员执行，旧 Token 已失效').catch(() => {})
    loadAuditLog()
  }

  const formatTime = (iso: string): string => {
    if (!iso) return '—'
    const date = new Date(iso)
    if (Number.isNaN(date.getTime())) return '—'
    const p = (n: number) => String(n).padStart(2, '0')
    return `${p(date.getMonth() + 1)}-${p(date.getDate())} ${p(date.getHours())}:${p(date.getMinutes())}`
  }

  const formatAuth = formatTime

  return (
    <div className="page-content">
      <div className="perms-top-grid">
        <div className="card">
          <div className="card-head"><h3>当前会话</h3></div>
          <div className="card-pad">
            <div className="kv"><span className="muted">角色</span><span className={`badge ${isAdmin ? 'b-brand' : 'b-muted'}`}><span className="d" />{role === 'admin' ? '管理员' : '访客'}</span></div>
            <div className="kv"><span className="muted">Admin Token</span><span className={isAdmin ? 'badge b-ok' : 'badge b-warn'}><span className="d" />{isAdmin ? '已配置' : '未配置'}</span></div>
            <div className="kv"><span className="muted">生效范围</span><span className="mono" style={{ fontSize: 12 }}>{isAdmin ? '全局写操作' : '只读浏览'}</span></div>
            <div className="kv"><span className="muted">最近认证</span><span className="mono" style={{ fontSize: 12 }}>{formatAuth(lastAuth)}</span></div>
            <div className="callout" style={{ marginTop: 12, background: 'var(--info-soft)', borderColor: 'color-mix(in srgb, var(--info) 30%, transparent)' }}>
              <span className="ic" style={{ color: 'var(--info)' }}><CircleDot size={18} /></span>
              <p>所有写操作与管理接口均需 <b>X-Admin-Token</b>，值须与后端 <b>ADMIN_TOKEN</b> 一致。{isAdmin ? '当前以管理员身份拥有写权限。' : '访客角色仅可浏览，配置 Token 后解锁管理功能。'}</p>
            </div>
            {isAdmin ? (
              <button className="btn btn-ghost" style={{ width: '100%', marginTop: 12 }} onClick={() => applyToken('')}>
                退出管理员（切回访客）
              </button>
            ) : (
              <button className="btn btn-soft" style={{ width: '100%', marginTop: 12 }} onClick={() => tokenInputRef.current?.focus()}>
                配置并切换到管理员
              </button>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-head"><h3>Admin Token 配置</h3><span className="sub">安全 · 不显明文</span></div>
          <div className="card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <div className="section-label">当前 Token</div>
              <div className="row between" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '12px 14px' }}>
                <span className="mono" style={{ letterSpacing: 2 }}>••••••••••••••••••••••••</span>
                <span className={isAdmin ? 'badge b-ok' : 'badge b-warn'}><span className="d" />{isAdmin ? '有效' : '未配置'}</span>
              </div>
              <p className="muted" style={{ fontSize: 11.5, margin: '8px 0 0' }}>出于安全，系统永不展示 Token 明文，仅支持覆盖更新。</p>
            </div>
            <div>
              <div className="section-label">更新 Token</div>
              <div className="input">
                <Shield size={16} />
                <input
                  ref={tokenInputRef}
                  value={tokenDraft}
                  onChange={e => setTokenDraft(e.target.value)}
                  placeholder="输入新的 Admin Token"
                  type={showToken ? 'text' : 'password'}
                />
              </div>
              <div className="row between" style={{ marginTop: 12 }}>
                <span className="muted" style={{ fontSize: 11.5 }}>将写入后端 .env 的 ADMIN_TOKEN</span>
                <button className="btn btn-primary" onClick={() => { applyToken(tokenDraft); setTokenDraft(tokenDraft.trim()) }}>保存并更新</button>
              </div>
              {tokenError && <div className="callout" style={{ marginTop: 12, background: 'var(--danger-soft)', borderColor: 'color-mix(in srgb, var(--danger) 30%, transparent)' }}>
                <span className="ic" style={{ color: 'var(--danger)' }}><AlertCircle size={16} /></span>
                <p>{tokenError}</p>
              </div>}
            </div>
          </div>
        </div>
      </div>

      <div className="grid g-2" style={{ marginTop: 16 }}>
        <div className="card">
          <div className="card-head"><h3>权限矩阵</h3><span className="sub">访客 / 管理员</span></div>
          <table className="dt matrix" style={{ borderRadius: 0, border: 0 }}>
            <thead><tr><th>功能</th><th>访客</th><th>管理员</th></tr></thead>
            <tbody>
              {permissions.map((perm, i) => (
                <tr key={i}>
                  <td>{perm.action}</td>
                  <td className={perm.guest ? 'yes' : 'no'}>{perm.guest ? '✓' : '—'}</td>
                  <td className={perm.admin ? 'yes' : 'no'}>{perm.admin ? '✓' : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card">
          <div className="card-head"><h3>操作审计</h3><span className="sub">最近管理动作</span></div>
          <div className="card-pad" style={{ padding: '0 18px' }}>
            {auditLoading ? (
              <div className="audit-item"><span className="ai-ic"><Loader size={14} /></span><div className="ai-main"><b>加载审计记录…</b></div></div>
            ) : auditAuthError ? (
              <div className="audit-item"><span className="ai-ic" style={{ color: 'var(--warn)' }}><ShieldAlert size={16} /></span><div className="ai-main"><b>需要管理员权限查看</b><p>审计记录已存在，但需在上方「Admin Token」填入与后端 .env 一致的 Token 并保存后才能查看。</p></div></div>
            ) : auditLog.length === 0 ? (
              <div className="audit-item"><span className="ai-ic"><CircleDot size={16} /></span><div className="ai-main"><b>暂无管理动作</b><p>执行同步、测试或更新 Token 后将自动记录</p></div></div>
            ) : (
              auditLog.map((log, i) => (
                <div className="audit-item" key={log.id ?? i}>
                  <span className="ai-ic"><Activity size={16} /></span>
                  <div className="ai-main"><b>{log.action}</b><p>{log.detail}</p></div>
                  <span className="ai-time">{formatTime(log.created_at)}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
