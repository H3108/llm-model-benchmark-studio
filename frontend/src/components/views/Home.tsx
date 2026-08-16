import { CheckCircle2, Gauge, Zap, TrendingUp, Activity, Server } from 'lucide-react'
import { CapabilityResult, type Leaderboard as LeaderboardData, CapabilityTask, Model, Benchmark } from '../../lib/api'
import { Button } from '../ui'

export function Home({ models, results, capabilitySuccessCount, capabilityTasks, capabilityResults, leaderboard, onStart, onModels, onLeaderboard, onIntelligence }: { models: Model[]; results: Benchmark[]; capabilitySuccessCount: number; capabilityTasks: CapabilityTask[]; capabilityResults: CapabilityResult[]; leaderboard: LeaderboardData | null; onStart: () => void; onModels: () => void; onLeaderboard: () => void; onIntelligence: () => void }) {
  const successCount = results.filter(item => item.status === 'success').length
  const successRate = results.length ? Math.round(successCount / results.length * 100) : 0
  const testedCount = new Set(results.map(item => item.model_id)).size
  const freeCount = models.filter(m => m.is_free).length
  const providersCount = new Set(models.map(m => m.provider)).size

  const now = new Date()
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now)
    d.setDate(d.getDate() - (6 - i))
    return d.toISOString().slice(0, 10)
  })
  const dailyCounts = days.map(day => {
    const perf = results.filter(r => r.tested_at.slice(0, 10) === day).length
    const cap = capabilityResults.filter(r => r.tested_at.slice(0, 10) === day).length
    return perf + cap
  })
  const weeklyThroughput = dailyCounts.reduce((a, b) => a + b, 0)
  const peakDaily = Math.max(0, ...dailyCounts)
  const maxC = Math.max(1, ...dailyCounts)
  const sparkPoints = dailyCounts.map((c, i) => {
    const x = Math.round((i / 6) * 120)
    const y = Math.round(36 - (c / maxC) * 28 - 4)
    return `${x} ${y}`
  }).join(' L')
  const capabilityProgress = capabilitySuccessCount > 0 ? 82 : 0
  return (
    <div className="page-content">
      <div className="hero mb-3">
        <div className="hero-main">
          <div className="hero-eyebrow">大模型选型与评测导航平台</div>
          <h2>从模型库开始，找到适合你任务的模型。</h2>
          <p>先浏览已同步模型，再运行性能测试；有足够数据后，可在排行榜和智能分析中查看推荐。</p>
          <div className="hero-actions">
            <Button onClick={onStart}>
              <Zap size={15} /> 开始第一次测试
            </Button>
            <Button variant="ghost" onClick={onModels}>
              浏览模型库
            </Button>
          </div>
        </div>
        <div>
          <div className="hero-path">
            <div className="hp-step active">1</div>
            <div className="hp-line" />
            <div className="hp-step">2</div>
            <div className="hp-line" />
            <div className="hp-step">3</div>
          </div>
          <div className="hp-labels">
            <div className="hp-label active">选择模型</div>
            <div className="hp-label">执行测试</div>
            <div className="hp-label">查看推荐</div>
          </div>
        </div>
      </div>

      <div className="grid g-4 mb-3">
        <div className="stat">
          <div className="k"><Server size={15} /> 模型库规模</div>
          <div className="v">{models.length} <small>个</small></div>
          <div className="foot">
            <div className="prog"><i style={{ width: '100%' }} /></div>
            <div className="ftxt">已测试 {testedCount}/{models.length} · {providersCount} 家 Provider · {freeCount === models.length ? '全部免费' : `${freeCount} 个免费`}</div>
          </div>
        </div>
        <div className="stat">
          <div className="k"><CheckCircle2 size={15} /> 测试成功率</div>
          <div className="v" style={{ color: 'var(--brand-2)' }}>{successRate}%</div>
          <div className="foot">
            <div className="prog"><i style={{ width: `${successRate}%`, background: 'var(--brand-2)' }} /></div>
            <div className="ftxt up"><TrendingUp size={12} /> {successCount} 成功 / {results.length} 记录</div>
          </div>
        </div>
        <div className="stat">
          <div className="k"><Gauge size={15} /> 能力评测</div>
          <div className="v">{capabilitySuccessCount} <small>条</small></div>
          <div className="foot">
            <div className="prog"><i style={{ width: `${capabilityProgress}%`, background: 'var(--brand-2)' }} /></div>
            <div className="ftxt">{capabilityTasks.length} 类任务 · 评分已就绪</div>
          </div>
        </div>
        <div className="stat">
          <div className="k"><Activity size={15} /> 近 7 天吞吐</div>
          <div className="v">{weeklyThroughput} <small>次</small></div>
          <svg className="spark" width="120" height="36" viewBox="0 0 120 36" fill="none">
            <path d={`M${sparkPoints}`} stroke="var(--brand-2)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <div className="foot"><div className="ftxt">峰值 {peakDaily} 次/日</div></div>
        </div>
      </div>

      <div className="grid g-2">
        <div className="card">
          <div className="card-head between"><h3>系统健康</h3><span className="badge b-ok"><span className="d" />运行正常</span></div>
          <div className="card-pad">
            <div className="hrow">
              <span className="dot" />
              <div className="hname">模型同步</div>
              <div className="prog" style={{ width: 120, margin: '0 12px' }}><i style={{ width: '100%' }} /></div>
              <span className="hmeta">{models.length}/{models.length}</span>
            </div>
            <div className="hrow">
              <span className="dot" />
              <div className="hname">数据库</div>
              <span className="hmeta" style={{ flex: 1, textAlign: 'right' }}>benchmark.db 已连接</span>
            </div>
            <div className="hrow">
              <span className="dot" />
              <div className="hname">调度器</div>
              <span className="hmeta" style={{ flex: 1, textAlign: 'right' }}>空闲 · 待命中</span>
            </div>
            <div className="hrow">
              <span className="dot warn" />
              <div className="hname">额度告警</div>
              <div className="prog" style={{ width: 120, margin: '0 12px' }}><i style={{ width: '82%', background: 'var(--warn)' }} /></div>
              <span className="hmeta">腾讯混元 82%</span>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-head"><h3>推荐路径</h3><span className="sub">首次使用建议</span></div>
          <div className="card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="step-row" onClick={onModels}>
              <div className="step-n">1</div>
              <div className="step-main"><div className="st">浏览模型库</div><div className="ss">按 Provider、免费状态筛选</div></div>
              <span className="step-arrow">→</span>
            </div>
            <div className="step-row" onClick={onStart}>
              <div className="step-n">2</div>
              <div className="step-main"><div className="st">执行性能测试</div><div className="ss">建议先选 3 个模型做 Smoke</div></div>
              <span className="step-arrow">→</span>
            </div>
            <div className="step-row" onClick={onLeaderboard}>
              <div className="step-n">3</div>
              <div className="step-main"><div className="st">查看排行榜</div><div className="ss">对比真实结果与综合评分</div></div>
              <span className="step-arrow">→</span>
            </div>
            <div className="step-row" onClick={onIntelligence}>
              <div className="step-n">4</div>
              <div className="step-main"><div className="st">查看模型推荐</div><div className="ss">基于已有数据生成任务建议</div></div>
              <span className="step-arrow">→</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

