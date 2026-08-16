import { ShieldAlert } from 'lucide-react'
import { Button } from '../ui'

export function AuthStatus({ status, onOpenSettings, onDismiss }: { status: 401 | 403; onOpenSettings: () => void; onDismiss: () => void }) {
  const missing = status === 401
  return (
    <div className="auth-status" role="alert">
      <ShieldAlert size={16} className="auth-status-icon" aria-hidden="true" />
      <span className="auth-status-text">
        <strong>{missing ? '需要 Admin Token' : 'Admin Token 无效'}</strong>
        {' · '}
        {missing
          ? '运行测试前请先在「管理权限」中填写并保存。'
          : '当前 Token 无法通过校验，请重新保存。'}
      </span>
      <span className="spacer" />
      <div className="auth-status-actions">
        <Button onClick={onOpenSettings} className="btn-sm">{missing ? '填写 Token' : '重新配置'}</Button>
        <Button variant="ghost" onClick={onDismiss} className="btn-sm">关闭</Button>
      </div>
    </div>
  )
}

