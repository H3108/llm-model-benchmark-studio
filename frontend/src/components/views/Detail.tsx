import { Zap } from 'lucide-react'
import { Model } from '../../lib/api'
import { Button, Badge } from '../ui'
import { PROVIDER_LABELS } from '../../lib/providers'
import { CapabilityTags } from './CapabilityTags'
import { DetailItem } from './DetailItem'

export function Detail({ model, close, runBenchmark }: { model: Model; close: () => void; runBenchmark: (ids: string[]) => void }) {
  return (
    <div className="detail-overlay" onClick={close}>
      <aside className="detail-panel" onClick={e => e.stopPropagation()}>
        <div className="detail-top">
          <span className="eyebrow">模型详情</span>
          <button className="close" onClick={close} aria-label="关闭详情">×</button>
        </div>
        <div className="detail-title">
          <div className="large-model-dot" />
          <div>
            <h2>{model.model_name || model.model_id}</h2>
            <p>{model.model_id}</p>
          </div>
        </div>
        <div className="detail-grid">
          <DetailItem label="Provider" value={PROVIDER_LABELS[model.provider] ?? model.provider} />
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
          <div className="meta-line">
            <span>最后更新</span>
            <span className="mono">{new Date(model.updated_at).toLocaleString()}</span>
          </div>
          <div className="meta-line">
            <span>目录状态</span>
            <Badge tone="success">{model.catalog_status === 'inactive' ? '已停用' : '可用'}</Badge>
          </div>
        </div>
        <Button onClick={() => { runBenchmark([model.model_id]); close() }}>
          <Zap size={15} /> 运行性能测试
        </Button>
      </aside>
    </div>
  )
}

