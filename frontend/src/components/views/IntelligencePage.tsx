import { useEffect, useState, useMemo } from 'react'
import { CircleDot, Gauge, XCircle } from 'lucide-react'
import { ApiError, api, Model, Benchmark, Intelligence, type Leaderboard as LeaderboardData } from '../../lib/api'
import { buildIntelligenceView, CAPABILITY_LABELS } from '../../lib/intelligenceView'
import { RadarChart, MiniStats, InsightsCard, VerdictBand, CapabilityRankingCard } from '../intelligence'
import { PageLoader } from '../ui'
import { ProviderPicker, ProfilePicker, ProfileConfig } from '../pickers'
import { OP_LABELS, requestErrorMessage, orderModels, modelTestStats, PROFILE_LABELS } from '../../lib/format'
import { ModelPicker } from './ModelPicker'

export function IntelligencePage({ models, results }: { models: Model[]; results: Benchmark[] }) {
  const orderedModels = orderModels(models, results)
  const testedIds = new Set(modelTestStats(results).keys())
  const testedModels = orderedModels.filter(model => testedIds.has(model.model_id))
  const [modelId, setModelId] = useState(testedModels[0]?.model_id || '')
  const [providerFilter, setProviderFilter] = useState('all')
  const [profile, setProfile] = useState('default')
  const [intelligence, setIntelligence] = useState<Intelligence | null>(null)
  const [leaderboard, setLeaderboard] = useState<LeaderboardData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [profiles, setProfiles] = useState<Record<string, ProfileConfig>>({})

  const model = models.find(m => m.model_id === modelId)
  const testedProviders = Array.from(new Set(testedModels.map(m => m.provider))).sort()
  const filteredModels = providerFilter === 'all' ? testedModels : testedModels.filter(m => m.provider === providerFilter)

  useEffect(() => {
    if (providerFilter === 'all') return
    if (!filteredModels.some(m => m.model_id === modelId)) {
      setModelId(filteredModels[0]?.model_id || '')
    }
  }, [providerFilter, testedModels.length])

  useEffect(() => {
    setIntelligence(null)
    setLeaderboard(null)
    if (!modelId) {
      setLoading(false)
      setError('')
      return
    }
    setLoading(true)
    setError('')
    Promise.allSettled([
      api.intelligence(modelId, profile),
      api.leaderboard(profile),
    ])
      .then(([detailRes, lbRes]) => {
        if (detailRes.status === 'fulfilled') {
          setIntelligence(detailRes.value)
        } else {
          const e = detailRes.reason
          if (e instanceof ApiError && e.status === 404) {
            setIntelligence(null)
          } else {
            setError(requestErrorMessage(e, '智能分析数据加载失败'))
          }
        }
        if (lbRes.status === 'fulfilled') setLeaderboard(lbRes.value)
      })
      .finally(() => setLoading(false))
  }, [modelId, profile])

  useEffect(() => {
    api.scoringProfiles()
      .then(res => setProfiles(res.profiles))
      .catch(() => setProfiles({}))
  }, [])

  const view = useMemo(() => {
    if (!intelligence || !model) return null
    return buildIntelligenceView({ intelligence, model, leaderboard: leaderboard ?? undefined, profile })
  }, [intelligence, model, leaderboard, profile])

  const currentProfile = profiles[profile]

  return (
    <div className="page-content">
      <div className="model-bar">
        <div className="model-bar-group">
          <span className="model-bar-label">供应商</span>
          <ProviderPicker
            value={providerFilter}
            providers={testedProviders}
            onChange={setProviderFilter}
            labels={{ all: '全部供应商' }}
            showSearch={false}
            includeDefaults={false}
          />
        </div>
        <ModelPicker models={filteredModels} value={modelId} onChange={setModelId} />
        <div className="model-bar-group">
          <span className="model-bar-label">评分配置</span>
          <ProfilePicker value={profile} onChange={setProfile} profiles={profiles} />
        </div>
      </div>

      {!testedModels.length && !loading && (
        <div className="selection-hint intelligence-empty-hint">
          <CircleDot size={13} />
          <span>暂无已测试模型，请先在“性能测试”中完成一次测试。</span>
        </div>
      )}
      {error && (
        <div className="alert">
          <XCircle size={16} />
          {error}
        </div>
      )}
      {loading && <PageLoader compact label="正在加载智能分析" kicker="INTEL · SYNC" />}

      {modelId && view && (
        <>
          <VerdictBand view={view} />
          {currentProfile && (
            <div className="card score-weights-card">
              <div className="card-head between">
                <h3>评分权重</h3>
                <span className="sub">当前配置：{PROFILE_LABELS[profile] ?? profile}</span>
              </div>
              <div className="card-pad sw-pad">
                <div className="sw-block">
                  <div className="sw-title">综合合成</div>
                  <div className="sw-split">
                    <div className="sw-chip">
                      <span className="sw-k">运行性能</span>
                      <span className="sw-v">{Math.round((currentProfile.weights.operational ?? 0) * 100)}%</span>
                    </div>
                    <span className="sw-plus">+</span>
                    <div className="sw-chip">
                      <span className="sw-k">能力评分</span>
                      <span className="sw-v">{Math.round((currentProfile.weights.capability ?? 0) * 100)}%</span>
                    </div>
                  </div>
                </div>
                {Object.keys(currentProfile.capability_weights || {}).length > 0 && (
                  <div className="sw-block">
                    <div className="sw-title">能力维度权重</div>
                    <div className="sw-rows">
                      {Object.entries(currentProfile.capability_weights)
                        .sort((a, b) => b[1] - a[1])
                        .map(([k, w]) => (
                          <div className="sw-row" key={k}>
                            <span className="sw-k">{CAPABILITY_LABELS[k] ?? k}</span>
                            <span className="sw-bar"><i style={{ width: `${Math.round(w * 100)}%` }} /></span>
                            <span className="sw-v">{Math.round(w * 100)}%</span>
                          </div>
                        ))}
                    </div>
                  </div>
                )}
                {Object.keys(currentProfile.operational_weights || {}).length > 0 && (
                  <div className="sw-block">
                    <div className="sw-title">运行性能指标权重</div>
                    <div className="sw-rows">
                      {Object.entries(currentProfile.operational_weights)
                        .sort((a, b) => b[1] - a[1])
                        .map(([k, w]) => (
                          <div className="sw-row" key={k}>
                            <span className="sw-k">{OP_LABELS[k] ?? k}</span>
                            <span className="sw-bar"><i style={{ width: `${Math.round(w * 100)}%` }} /></span>
                            <span className="sw-v">{Math.round(w * 100)}%</span>
                          </div>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
          <div className="intell-evidence">
            <div className="card">
              <div className="card-head between"><h3>能力雷达</h3><span className="sub">{view.modelName} · 6 个维度</span></div>
              <div className="card-pad radar-pad-v">
                <div className="radar-chart-wrap"><RadarChart items={view.radar} weights={currentProfile?.capability_weights} /></div>
                <div className="radar-dims-grid">
                  {view.radar.map(item => {
                    const color = item.score >= 85 ? 'var(--brand-2)' : item.score >= 70 ? 'var(--info)' : 'var(--warn)'
                    const w = currentProfile?.capability_weights?.[item.key]
                    const weighted = w != null && w > 0
                    return (
                      <div className={`dim-row ${weighted ? 'is-weighted' : ''}`} key={item.key}>
                        <div className="dn">
                          <span className="dot" style={{ background: color, boxShadow: `0 0 0 3px color-mix(in srgb, ${color} 25%, transparent)` }} />
                          {item.label}
                        </div>
                        <div className="sbar"><i style={{ width: `${Math.min(item.score, 100)}%`, background: color }} /></div>
                        <div className="ds">{Math.round(item.score)}</div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
            <InsightsCard insights={view.insights} />
          </div>
          <div className="intell-detail">
            <CapabilityRankingCard items={view.capabilitiesRanked} />
            <MiniStats stats={view.miniStats} />
          </div>
        </>
      )}

      {modelId && !loading && !view && !error && (
        <div className="untested">
          <div className="ui-ic"><Gauge size={24} /></div>
          <div className="ui-ttl">当前模型暂无智能分析数据</div>
          <div className="ui-desc">所选模型尚未产生足够的成功测试记录，无法生成能力雷达与诊断结论。请选择其他已测试模型，或先在「性能测试」中运行评测。</div>
        </div>
      )}
      {!modelId && !loading && testedModels.length > 0 && (
        <div className="intel-placeholder">
          <Gauge size={28} />
          <span>选择上方的模型，查看评分明细与能力对比</span>
        </div>
      )}
    </div>
  )
}
