import { TopProgress, Loader, PageLoader } from '../ui'
import { Empty } from './Empty'

export function DesignSystemPage() {
  const brandTokens = [
    { name: '--brand', desc: '主操作 / 激活' },
    { name: '--brand-2', desc: '数据 / 评分' },
    { name: '--success', desc: '成功 / 可用' },
    { name: '--warn', desc: '部分 / 警告' },
    { name: '--danger', desc: '失败 / 风险' },
    { name: '--info', desc: '提示 / 信息' },
  ]
  const neutralTokens = [
    { name: '--bg', desc: '画布' },
    { name: '--surface', desc: '卡片' },
    { name: '--surface-2', desc: '次级面' },
    { name: '--border', desc: '描边' },
    { name: '--text', desc: '主文字' },
    { name: '--text-3', desc: '弱文字' },
  ]

  const swatch = (t: { name: string; desc: string }) => (
    <div className="swatch" key={t.name}>
      <div className="c" style={{ background: `var(${t.name})` }} />
      <div className="m">
        <div className="h">{t.name}</div>
        <div className="s">{t.desc}</div>
      </div>
    </div>
  )

  return (
    <div className="page-content design-system-page">
      <div className="callout mb-3">
        <span className="ic">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8v5M12 16h.01" />
          </svg>
        </span>
        <p>本页为 <b>Instrument 精密仪表盘美学</b> 设计系统总览:双主题、设计令牌、组件与状态规范,可直接作为前端还原基线。</p>
      </div>

      <div className="section-label">色彩令牌 · 品牌</div>
      <div className="tok-grid mb-3">
        {brandTokens.map(swatch)}
      </div>

      <div className="section-label">色彩令牌 · 中性(随主题切换)</div>
      <div className="tok-grid mb-3">
        {neutralTokens.map(swatch)}
      </div>

      <div className="section-label">字体</div>
      <div className="grid g-3 mb-3">
        <div className="card card-pad">
          <div className="display" style={{ fontSize: 24, fontWeight: 700 }}>Space Grotesk</div>
          <div className="muted" style={{ fontSize: 12 }}>展示 / 标题 / 数字</div>
        </div>
        <div className="card card-pad">
          <div style={{ fontSize: 24, fontWeight: 500 }}>Inter · 苹方</div>
          <div className="muted" style={{ fontSize: 12 }}>正文 / UI / 中文</div>
        </div>
        <div className="card card-pad">
          <div className="mono" style={{ fontSize: 24, fontWeight: 500 }}>JetBrains Mono</div>
          <div className="muted" style={{ fontSize: 12 }}>指标 / ID / 技术字段</div>
        </div>
      </div>

      <div className="section-label">组件</div>
      <div className="grid g-2 mb-3">
        <div className="card card-pad" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <button className="btn btn-primary">主操作</button>
          <button className="btn btn-ghost">次操作</button>
          <button className="btn btn-soft">柔和</button>
          <button className="btn btn-primary" disabled>禁用</button>
          <span className="badge b-ok"><span className="d" />成功</span>
          <span className="badge b-warn"><span className="d" />部分</span>
          <span className="badge b-bad"><span className="d" />失败</span>
          <span className="badge b-teal"><span className="d" />免费</span>
          <span className="chip on">筛选·开</span><span className="chip">筛选·关</span>
        </div>
        <div className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <div className="between" style={{ fontSize: 12, marginBottom: 5 }}><span className="muted">进度示例</span><span className="mono">92%</span></div>
            <div className="prog"><i style={{ width: '92%' }} /></div>
          </div>
          <div>
            <div className="between" style={{ fontSize: 12, marginBottom: 5 }}><span className="muted">评分示例</span><span className="mono">84.1</span></div>
            <div className="sbar"><i style={{ width: '84%' }} /></div>
          </div>
          <div className="input">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="m21 21-4-4" /></svg>
            <input placeholder="输入框聚焦态" />
          </div>
        </div>
      </div>

      <div className="section-label">状态体系(每个页面必备)</div>
      <div className="grid g-4">
        <div className="card">
          <div className="empty">
            <div className="ic"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18" /></svg></div>
            <div style={{ fontSize: 13 }}>Empty 空</div>
            <div className="muted" style={{ fontSize: 11 }}>引导到下一步</div>
          </div>
        </div>
        <div className="card">
          <div className="empty">
            <div className="ic">
              <span className="loader-orb" style={{ width: 26, height: 26 }}>
                <span className="ring r1" /><span className="ring r2" /><span className="ring r3" /><span className="core" />
              </span>
            </div>
            <div style={{ fontSize: 13 }}>Loading 加载</div>
            <div className="muted" style={{ fontSize: 11 }}>品牌轨道环 · 顶部进度条</div>
          </div>
        </div>
        <div className="card">
          <div className="empty">
            <div className="ic"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16h.01" /></svg></div>
            <div style={{ fontSize: 13 }}>Error 错误</div>
            <div className="muted" style={{ fontSize: 11 }}>可重试</div>
          </div>
        </div>
        <div className="card">
          <div className="empty">
            <div className="ic"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 8v5M12 16h.01" /></svg></div>
            <div style={{ fontSize: 13 }}>Partial 部分</div>
            <div className="muted" style={{ fontSize: 11 }}>成功/失败并存</div>
          </div>
        </div>
      </div>

      <div className="section-label">Loading 加载系统</div>
      <div className="card card-pad mb-3">
        <div className="between" style={{ marginBottom: 14 }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>品牌轨道环 + 顶部进度条</div>
            <div className="muted" style={{ fontSize: 12, marginTop: 3 }}>切换菜单 / 拉取数据时,以顶部细进度条 + 居中轨道环传达"进行中",替代旧版左上角小转圈。</div>
          </div>
          <span className="badge b-teal"><span className="d" />v0.2</span>
        </div>

        <div className="loader-demo">
          <div className="top-progress is-active" style={{ position: 'relative', opacity: 1 }}>
            <span className="top-progress__bar" />
          </div>
          <div className="page-loader" style={{ minHeight: 0, padding: '30px 0' }}>
            <div className="loader-orb"><span className="ring r1" /><span className="ring r2" /><span className="ring r3" /><span className="core" /></div>
            <div className="loader-meta">
              <div className="loader-kicker">SYS · LOADING</div>
              <div className="loader-label">正在加载数据<span className="loader-dots"><i /><i /><i /></span></div>
            </div>
          </div>
        </div>

        <div className="muted" style={{ fontSize: 11, margin: '14px 0 6px' }}>行内轨道环 · 按钮 / 状态条内的小型加载</div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--text-2)', border: '1px solid var(--border)', borderRadius: 999, padding: '6px 12px' }}><Loader size={15} /> 正在运行性能测试…</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--text-2)', border: '1px solid var(--border)', borderRadius: 999, padding: '6px 12px' }}><Loader size={15} /> 能力评测中…</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--text-2)', border: '1px solid var(--border)', borderRadius: 999, padding: '6px 12px' }}><Loader size={15} /> 正在加载智能分析…</span>
        </div>

        <div className="grid g-2" style={{ marginTop: 6 }}>
          <div>
            <div className="muted" style={{ fontSize: 11, marginBottom: 6 }}>设计令牌</div>
            <ul className="tok-list">
              <li><code>--brand</code> / <code>--brand-2</code> · 轨道环与进度条渐变</li>
              <li><code>spin</code> 缓动 <code>cubic-bezier(.4,0,.2,1)</code></li>
              <li>顶部条 3px · 居中环 58px · 圆点 4px</li>
            </ul>
          </div>
          <div>
            <div className="muted" style={{ fontSize: 11, marginBottom: 6 }}>用法</div>
            <ul className="tok-list">
              <li><code>&lt;TopProgress active={'{loading}'} /&gt;</code></li>
              <li><code>&lt;PageLoader label="正在加载数据" /&gt;</code></li>
              <li><code>&lt;Loader /&gt;</code> · 按钮 / 状态条内小型加载</li>
              <li>导航切换自动触发 0.5s 顶部进度反馈</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}

