import { FlaskConical, Gauge, Trophy, Activity, Settings2, Puzzle, Target, Server, Shield, LayoutDashboard, Sparkles } from 'lucide-react'
import { Benchmark, Model } from '../../lib/api'
import { View } from '../../lib/types'

export function Sidebar({ 
  view, 
  setView, 
  adminToken, 
  onTokenChange, 
  tokenDraft, 
  setTokenDraft,
  showToken,
  onToggleShow,
  authError,
  sidebarOpen,
  setSidebarOpen,
  theme,
  toggleTheme,
  models
}: { 
  view: View; 
  setView: (view: View) => void; 
  adminToken: string; 
  onTokenChange: (token: string) => void; 
  tokenDraft: string; 
  setTokenDraft: (token: string) => void;
  showToken: boolean;
  onToggleShow: () => void;
  authError?: 401 | 403 | null;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  theme: 'dark' | 'light';
  toggleTheme: () => void;
  models: Model[];
}) {
  const nav = [
    { id: 'home' as View, label: '首页', icon: LayoutDashboard },
    { id: 'explorer' as View, label: '模型库', icon: Server, count: models.length.toString() },
    { id: 'lab' as View, label: '性能测试', icon: FlaskConical },
    { id: 'cap' as View, label: '能力测试', icon: Target },
    { id: 'results' as View, label: '测试结果', icon: Activity },
    { id: 'leaderboard' as View, label: '模型排行榜', icon: Trophy },
    { id: 'intelligence' as View, label: '智能分析', icon: Gauge },
    { id: 'recommend' as View, label: '任务推荐', icon: Sparkles },
  ]
  const sysNav = [
    { id: 'admin' as View, label: '运维工作区', icon: Settings2 },
    { id: 'perms' as View, label: '管理权限', icon: Shield },
    { id: 'system' as View, label: '设计系统', icon: Puzzle },
  ]
  const saveToken = () => onTokenChange(tokenDraft.trim())
  const closeSidebar = () => { if (window.innerWidth < 860) setSidebarOpen(false) }
  
  return (
    <>
      <aside className={`sidebar ${sidebarOpen ? 'sidebar-open' : ''}`}>
        <div className="brand">
          <div className="brand-mark">
            <Activity size={20} />
          </div>
          <div>
            <strong>Benchmark Studio</strong>
            <small>LLM 评测控制台</small>
          </div>
        </div>

        <div className="workspace-label">主导航</div>
        <nav>
          {nav.map(item => (
            <button
              key={item.id}
              className={view === item.id ? 'nav-item active' : 'nav-item'}
              onClick={() => { setView(item.id); closeSidebar() }}
            >
              <item.icon size={18} />
              {item.label}
              {item.count && <span className="count">{item.count}</span>}
            </button>
          ))}
        </nav>

        <div className="workspace-label">系统</div>
        <nav>
          {sysNav.map(item => (
            <button
              key={item.id}
              className={view === item.id ? 'nav-item active' : 'nav-item'}
              onClick={() => { setView(item.id); closeSidebar() }}
            >
              <item.icon size={18} />
              {item.label}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="system-status">
            <span className={adminToken ? 'pulse' : 'pulse muted-pulse'} /> 
            <div>
              {adminToken ? 'API 正常' : '未配置 Admin Token'}
              <small style={{ display: 'block', color: '#5b6987', fontSize: '10px', marginTop: '2px' }}>
                6 家提供方 · {models.length} 模型
              </small>
            </div>
          </div>
        </div>
      </aside>
      <div className={`scrim ${sidebarOpen ? 'show' : ''}`} onClick={() => setSidebarOpen(false)} />
    </>
  )
}

