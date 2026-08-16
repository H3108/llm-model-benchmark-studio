import { Zap, Menu, Clock } from 'lucide-react'
import { Button } from '../ui'
import { View } from '../../lib/types'

export function Topbar({ 
  view, 
  setView,
  loading, 
  refresh,
  sidebarOpen,
  setSidebarOpen,
  theme,
  toggleTheme
}: { 
  view: View; 
  setView: (view: View) => void;
  loading: boolean; 
  refresh: () => void;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  theme: 'dark' | 'light';
  toggleTheme: () => void;
}) {
  const titles = {
    home: ['首页', '从模型发现到测试结果，一站式完成大模型选择与评测'],
    explorer: ['模型库', '浏览已同步的真实免费模型，按提供方与能力筛选'],
    lab: ['性能测试', '选择模型，一键测量延迟 / TTFT / 吞吐 / 可用性'],
    cap: ['能力测试', '选择模型与评测任务，评估多维度能力表现'],
    results: ['测试结果', '查看模型性能、吞吐与失败记录，支持筛选排序'],
    leaderboard: ['模型排行榜', '综合评分排行，可按提供方与维度筛选'],
    intelligence: ['智能分析', '单模型深度评分、能力雷达、推荐与风险'],
    recommend: ['任务推荐', '按任务目标挑选最合适的免费模型'],
    admin: ['运维工作区', '同步模型目录、查看运行状态、管理系统健康'],
    perms: ['管理权限', '配置 Admin Token、查看权限矩阵与操作审计'],
    system: ['设计系统', 'Instrument 美学令牌、组件与状态规范总览']
  }
  
  const SunIcon = () => (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4.5"/>
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>
    </svg>
  )
  
  const MoonIcon = () => (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>
    </svg>
  )
  
  return (
    <header className="topbar">
      <div className="topbar-lead">
        <button className="mobile-menu-button" onClick={() => setSidebarOpen(!sidebarOpen)} aria-label="打开导航菜单">
          <Menu size={18} />
        </button>
        <div className="crumb">
          <h1>{titles[view]?.[0] || view}</h1>
          <p>{titles[view]?.[1] || ''}</p>
        </div>
      </div>
      <div className="topbar-actions">
        <span className="stamp">
          <Clock size={13} /> 更新于 {new Date().toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
        </span>
        <button 
          className="icon-btn" 
          onClick={toggleTheme} 
          title="切换深/浅主题"
          style={{ 
            width: 36, height: 36, borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', 
            background: 'var(--surface-2)', color: 'var(--text-2)', display: 'grid', placeItems: 'center',
            transition: 'all .15s'
          }}
        >
          {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
        </button>
        {view !== 'admin' && view !== 'perms' && view !== 'system' && (
          <Button onClick={() => setView('lab')} disabled={loading}>
            <Zap size={15} /> 运行测试
          </Button>
        )}
      </div>
    </header>
  )
}

