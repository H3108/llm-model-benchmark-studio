import { useRef, useEffect, useState } from 'react'
import { XCircle } from 'lucide-react'
import { ApiError, api, getAdminToken, Model, Benchmark, CapabilityResult, type Leaderboard as LeaderboardData, CapabilityTask } from './lib/api'
import { Button, PageLoader, TopProgress } from './components/ui'
import { AdminWorkspace } from './components/admin/AdminWorkspace'
import { requestErrorMessage } from './lib/format'
import { View } from './lib/types'
import { AuthStatus } from './components/views/AuthStatus'
import { CapLab } from './components/views/CapLab'
import { DesignSystemPage } from './components/views/DesignSystemPage'
import { Detail } from './components/views/Detail'
import { Explorer } from './components/views/Explorer'
import { FirstRunBanner } from './components/views/FirstRunBanner'
import { Home } from './components/views/Home'
import { IntelligencePage } from './components/views/IntelligencePage'
import { Leaderboard } from './components/views/Leaderboard'
import { Recommend } from './components/views/Recommend'
import { PerfLab } from './components/views/PerfLab'
import { PermissionsPage } from './components/views/PermissionsPage'
import { Results } from './components/views/Results'
import { Sidebar } from './components/views/Sidebar'
import { Topbar } from './components/views/Topbar'

export default function App() {
  const [view, setView] = useState<View>('home')
  const [models, setModels] = useState<Model[]>([])
  const [results, setResults] = useState<Benchmark[]>([])
  const [leaderboard, setLeaderboard] = useState<LeaderboardData | null>(null)
  const [capabilityTasks, setCapabilityTasks] = useState<CapabilityTask[]>([])
  const [capabilityResults, setCapabilityResults] = useState<CapabilityResult[]>([])
  const [selected, setSelected] = useState<Model | null>(null)
  const [loading, setLoading] = useState(true)
  const [navLoading, setNavLoading] = useState(false)
  const [error, setError] = useState('')
  const [running, setRunning] = useState(false)
  const [runMessage, setRunMessage] = useState('')
  const [adminToken, setAdminToken] = useState(() => getAdminToken())
  const [authError, setAuthError] = useState<401 | 403 | null>(null)
  const [tokenDraft, setTokenDraft] = useState(() => getAdminToken())
  const [showToken, setShowToken] = useState(false)
  const [capabilityRunning, setCapabilityRunning] = useState(false)
  const [capabilityMessage, setCapabilityMessage] = useState('')
  const [benchmarkCompleted, setBenchmarkCompleted] = useState(0)
  const [benchmarkFailed, setBenchmarkFailed] = useState(0)
  const [syncing, setSyncing] = useState(false)
  const [syncMessage, setSyncMessage] = useState('')
  const [capabilitySuccessCount, setCapabilitySuccessCount] = useState(0)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('theme') as 'dark' | 'light') || 'dark'
    }
    return 'dark'
  })

  // Lab view model selection states
  const [labQuery, setLabQuery] = useState('')
  const [labProvider, setLabProvider] = useState('all')
  const [labFreeOnly, setLabFreeOnly] = useState(true)
  const [labTestedOnly, setLabTestedOnly] = useState(false)
  const [labChecked, setLabChecked] = useState<string[]>([])

  useEffect(() => {
    const updateSidebarOpen = () => {
      setSidebarOpen(window.innerWidth > 760)
    }
    updateSidebarOpen()
    window.addEventListener('resize', updateSidebarOpen)
    return () => window.removeEventListener('resize', updateSidebarOpen)
  }, [])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('theme', theme)
  }, [theme])

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark')
  }

  const loadData = async () => {
    setLoading(true)
    setError('')
    const [modelsResponse, resultsResponse, capabilityResultsResponse, leaderboardResponse, tasksResponse, codingResponse, structuredResponse, instructionResponse] = await Promise.allSettled([
      api.models(),
      api.results(),
      api.capabilityResults(),
      api.leaderboard('default', true),
      api.capabilityTasks(),
      api.capabilityLeaderboard('coding'),
      api.capabilityLeaderboard('structured_output'),
      api.capabilityLeaderboard('instruction_following'),
    ])
    const failures: string[] = []
    if (modelsResponse.status === 'fulfilled') setModels(modelsResponse.value)
    else failures.push('模型数据')
    if (resultsResponse.status === 'fulfilled') setResults(resultsResponse.value)
    else failures.push('测试结果')
    if (capabilityResultsResponse.status === 'fulfilled') setCapabilityResults(capabilityResultsResponse.value)
    else failures.push('能力测试记录')
    if (leaderboardResponse.status === 'fulfilled') setLeaderboard(leaderboardResponse.value)
    else failures.push('排行榜')
    if (tasksResponse.status === 'fulfilled') setCapabilityTasks(tasksResponse.value)
    else failures.push('能力任务')
    const capabilityResponses = [codingResponse, structuredResponse, instructionResponse]
    if (capabilityResponses.some(response => response.status === 'fulfilled')) {
      setCapabilitySuccessCount(capabilityResponses.reduce((total, response) => response.status === 'fulfilled'
        ? total + response.value.rankings.reduce((count, row) => count + row.successful_tests, 0)
        : total, 0))
    } else {
      failures.push('能力统计')
    }
    if (failures.length) setError(`部分数据加载失败：${failures.join('、')}。可点击刷新重试。`)
    setLoading(false)
  }
  useEffect(() => { loadData() }, [])

  // 切换菜单时,顶部进度条做一次短暂的高级感"导航加载"反馈(非阻塞,内容仍即时渲染)
  const prevView = useRef(view)
  useEffect(() => {
    if (prevView.current === view) return
    prevView.current = view
    setNavLoading(true)
    const t = setTimeout(() => setNavLoading(false), 520)
    return () => clearTimeout(t)
  }, [view])

  // 性能/能力测试完成后的提示横幅 6s 自动消失；运行中不消失
  useEffect(() => {
    if (!runMessage || running) return
    const t = setTimeout(() => setRunMessage(''), 6000)
    return () => clearTimeout(t)
  }, [runMessage, running])
  useEffect(() => {
    if (!capabilityMessage || capabilityRunning) return
    const t = setTimeout(() => setCapabilityMessage(''), 6000)
    return () => clearTimeout(t)
  }, [capabilityMessage, capabilityRunning])

  const handleAuthFailure = (error: unknown) => {
    if (!(error instanceof ApiError) || (error.status !== 401 && error.status !== 403)) return
    setAuthError(error.status)
    // Do not keep an invalid credential in localStorage: otherwise every
    // protected action repeats the same 403 until the user manually replaces it.
    if (error.status === 403) {
      api.setAdminToken('')
      setAdminToken('')
      setTokenDraft('')
    }
  }

  const runBenchmark = async (ids: string[], options: { redirectToResults?: boolean } = {}) => {
    if (!ids.length) return
    setRunning(true)
    setAuthError(null)
    setRunMessage(`正在测试 ${ids.length} 个模型…`)
    setBenchmarkCompleted(0)
    setBenchmarkFailed(0)
    setView('lab') // stay in lab view during test
    try {
      const next = await api.run(ids)
      setResults(prev => [...next, ...prev])
      const completed = next.filter(item => item.status === 'success').length
      const failed = next.filter(item => item.status === 'failed').length
      setBenchmarkCompleted(completed)
      setBenchmarkFailed(failed)
      setRunMessage(`测试完成：${completed}/${next.length} 成功，失败 ${failed}`)

      // The benchmark request has already persisted its results. A temporary
      // failure while refreshing the secondary views should not make a
      // successful test look like it failed.
      const [latestResults, latestLeaderboard] = await Promise.allSettled([
        api.results(),
        api.leaderboard('default', true),
      ])
      if (latestResults.status === 'fulfilled') setResults(latestResults.value)
      if (latestLeaderboard.status === 'fulfilled') setLeaderboard(latestLeaderboard.value)
      // Only redirect to results if option is true (default true for backward compatibility)
      if (options.redirectToResults !== false) {
        setView('results')
      }
    } catch (e) {
      handleAuthFailure(e)
      setRunMessage(requestErrorMessage(e, '测试失败'))
    } finally {
      setRunning(false)
    }
  }

  const runCapability = async (ids: string[], tasks: string[]) => {
    if (!ids.length || !tasks.length) return
    setCapabilityRunning(true)
    setAuthError(null)
    setCapabilityMessage(`正在评测 ${ids.length} 个模型，共 ${tasks.length} 个任务...`)
    setView('cap') // 保持在能力测试页，不要跳到性能测试
    try {
      const response = await api.runCapability(ids, tasks)
      setCapabilityResults(response.results)
      setCapabilityMessage(`能力评测完成：成功 ${response.results.filter(item => item.status === 'success').length}，失败 ${response.results.filter(item => item.status === 'failed').length}`)
      const [latestResults, latestLeaderboard] = await Promise.allSettled([api.capabilityResults(), api.leaderboard('default', true)])
      if (latestResults.status === 'fulfilled') setCapabilityResults(latestResults.value)
      if (latestLeaderboard.status === 'fulfilled') setLeaderboard(latestLeaderboard.value)
    } catch (e) {
      handleAuthFailure(e)
      setCapabilityMessage(requestErrorMessage(e, '能力评测失败'))
    } finally {
      setCapabilityRunning(false)
    }
  }

  const syncModels = async () => {
    setSyncing(true)
    setAuthError(null)
    setSyncMessage('')
    try {
      // Sync all five providers sequentially so the user gets the full
      // free-model catalog in one click. Individual failures are collected
      // but do not abort the others.
      const providers = ['openrouter', 'siliconflow', 'opencode', 'tencentcloud', 'nvidia']
      const allModels: Model[] = []
      const errors: string[] = []
      for (const provider of providers) {
        try {
          setSyncMessage(`正在同步 ${provider} 模型目录…`)
          const synced = await api.syncModels(provider)
          allModels.push(...synced)
        } catch (err) {
          const msg = err instanceof Error ? err.message : '未知错误'
          errors.push(`${provider}: ${msg}`)
        }
      }
      // Merge: replace synced providers' models, keep unsynced ones intact.
      const syncedProviders = new Set(providers)
      const keptModels = models.filter(m => !syncedProviders.has(m.provider))
      const merged = [...allModels, ...keptModels]
      setModels(merged)
      if (errors.length) {
        setSyncMessage(`同步完成：${allModels.length} 个模型（${errors.length} 个 Provider 失败：${errors.join('；')}）`)
      } else {
        setSyncMessage(`模型同步完成：共 ${allModels.length} 个模型`)
      }
    } catch (e) {
      handleAuthFailure(e)
      setSyncMessage(requestErrorMessage(e, '模型同步失败'))
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="app-shell">
      <TopProgress active={loading || navLoading} />
      <Sidebar 
        view={view} 
        setView={setView} 
        adminToken={adminToken} 
        onTokenChange={token => { setAdminToken(token); api.setAdminToken(token); setAuthError(null) }} 
        tokenDraft={tokenDraft} 
        setTokenDraft={setTokenDraft}
        showToken={showToken}
        onToggleShow={() => setShowToken(!showToken)}
        authError={authError}
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
        theme={theme}
        toggleTheme={toggleTheme}
        models={models}
      />
      <main className="main-area">
        <Topbar 
          view={view} 
          setView={setView}
          loading={loading} 
          refresh={loadData} 
          sidebarOpen={sidebarOpen}
          setSidebarOpen={setSidebarOpen}
          theme={theme}
          toggleTheme={toggleTheme}
        />
        {error && <div className="alert"><XCircle size={16} />{error}<Button variant="ghost" onClick={loadData}>重试</Button></div>}
        {authError && view !== 'perms' && <AuthStatus status={authError} onOpenSettings={() => { setTokenDraft(adminToken); setView('perms') }} onDismiss={() => setAuthError(null)} />}
        {!loading && view !== 'home' && !error && results.length === 0 && <FirstRunBanner onStart={() => setView('lab')} />}
        {loading && <PageLoader label="正在加载数据" kicker="SYS · LOADING" />}
        {!loading && view === 'home' && (
          <Home 
            models={models} 
            results={results} 
            capabilitySuccessCount={capabilitySuccessCount} 
            capabilityTasks={capabilityTasks}
            capabilityResults={capabilityResults}
            leaderboard={leaderboard} 
            onStart={() => setView('lab')} 
            onModels={() => setView('explorer')} 
            onLeaderboard={() => setView('leaderboard')} 
            onIntelligence={() => setView('intelligence')} 
          />
        )}
        {!loading && view === 'explorer' && (
          <Explorer 
            models={models} 
            results={results}
            labChecked={labChecked}
            setLabChecked={setLabChecked}
            setSelected={setSelected} 
            setView={setView} 
          />
        )}
        {!loading && view === 'lab' && (
          <PerfLab
            models={models}
            running={running}
            message={runMessage}
            onCloseMessage={() => setRunMessage('')}
            benchmarkCompleted={benchmarkCompleted}
            benchmarkFailed={benchmarkFailed}
            runBenchmark={runBenchmark}
            labChecked={labChecked}
            setLabChecked={setLabChecked}
            setView={setView}
            setSelected={setSelected}
          />
        )}
        {!loading && view === 'cap' && (
          <CapLab
            models={models}
            tasks={capabilityTasks}
            capabilityRunning={capabilityRunning}
            capabilityMessage={capabilityMessage}
            onCloseMessage={() => setCapabilityMessage('')}
            runCapability={runCapability}
            labChecked={labChecked}
            setLabChecked={setLabChecked}
            setView={setView}
            setSelected={setSelected}
          />
        )}
        {!loading && view === 'results' && <Results results={results} capabilityResults={capabilityResults} />}
        {!loading && view === 'leaderboard' && <Leaderboard data={leaderboard} models={models} />}
        {!loading && view === 'intelligence' && <IntelligencePage models={models} results={results} />}
        {!loading && view === 'recommend' && <Recommend models={models} setView={setView} setSelected={setSelected} />}
        {!loading && view === 'admin' && <AdminWorkspace adminToken={adminToken} onNavigate={(v) => setView(v as View)} />}
        {!loading && view === 'perms' && <PermissionsPage adminToken={adminToken} onTokenChange={token => { setAdminToken(token); api.setAdminToken(token); setAuthError(null) }} />}
        {!loading && view === 'system' && <DesignSystemPage />}
        {selected && <Detail model={selected} close={() => setSelected(null)} runBenchmark={runBenchmark} />}
      </main>
    </div>
  )
}

