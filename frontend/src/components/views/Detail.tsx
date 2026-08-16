import { Zap, X } from 'lucide-react'
import { Model } from '../../lib/api'
import { Button, Badge } from '../ui'
import { PROVIDER_LABELS, providerColor } from '../../lib/providers'
import { CapabilityTags } from './CapabilityTags'
import { DetailItem } from './DetailItem'

export function Detail({ model, close, runBenchmark }: { model: Model; close: () => void; runBenchmark: (ids: string[]) => void }) {
  return (
    <div className="detail-overlay" onClick={close}>
      <aside className="detail-panel" onClick={e => e.stopPropagation()}>
        <div className="detail-header">
          <span className="eyebrow">模型详情</span>
          <button className="icon-btn" onClick={close} aria-label="关闭详情"><X size={16} /></button>
        </div>
        <div className="detail-hero">
          <div className="detail-hero-avatar" style={{ background: providerColor(model.provider) }}>
            {(PROVIDER_LABELS[model.provider] ?? model.provider).slice(0, 2).toUpperCase()}
          </div>
          <div className="detail-hero-body">
            <h2>{model.model_name || model.model_id}</h2>
            <p className="mono">{model.model_id}</p>
          </div>
        </div>
        <div className="detail-grid">
          <DetailItem label="服务商" value={PROVIDER_LABELS[model.provider] ?? model.provider} />
          <DetailItem label="组织" value={model.organization || '—'} />
          <DetailItem label="上下文长度" value={model.context_length?.toLocaleString() || '—'} />
          <DetailItem label="价格类型" value={model.is_free ? '免费' : '付费'} />
        </div>
        <div className="detail-section">
          <h3>能力标签</h3>
          <CapabilityTags capabilities={model.capabilities} large />
        </div>
        <div className="detail-section">
          <h3>模型库信息</h3>
          <div className="kv-list">
            <div className="kv"><span>最后更新</span><span className="mono">{new Date(model.updated_at).toLocaleString()}</span></div>
            <div className="kv"><span>目录状态</span><Badge tone={model.catalog_status === 'inactive' ? 'danger' : 'success'}>{model.catalog_status === 'inactive' ? '已停用' : '可用'}</Badge></div>
            {model.model_type && <div className="kv"><span>模型类型</span><span>{model.model_type}</span></div>}
            {model.source && <div className="kv"><span>来源</span><span className="mono">{model.source}</span></div>}
          </div>
        </div>
        <div className="detail-actions">
          <Button onClick={() => { runBenchmark([model.model_id]); close() }}>
            <Zap size={15} /> 运行性能测试
          </Button>
        </div>
      </aside>
    </div>
  )
}

