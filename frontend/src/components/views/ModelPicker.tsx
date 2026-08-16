import { useEffect, useState } from 'react'
import { Search } from 'lucide-react'
import { Model } from '../../lib/api'
import { Badge } from '../ui'
import { PROVIDER_LABELS } from '../../lib/providers'

export function ModelPicker({
  models,
  value,
  onChange,
}: {
  models: Model[]
  value: string
  onChange: (modelId: string) => void
}) {
  const selectedModel = models.find(model => model.model_id === value)
  const selectedLabel = selectedModel?.model_name || selectedModel?.model_id || ''
  const [query, setQuery] = useState(selectedLabel)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    setQuery(selectedLabel)
  }, [selectedLabel])

  const searchQuery = query.trim().toLowerCase() === selectedLabel.trim().toLowerCase()
    ? ''
    : query.trim().toLowerCase()
  const options = models
    .filter(model => {
      if (!searchQuery) return true
      return `${model.model_name || ''} ${model.model_id} ${model.organization || ''} ${model.provider}`
        .toLowerCase()
        .includes(searchQuery)
    })
    .slice(0, 8)

  return (
    <div
      className="model-picker"
      onBlur={event => {
        const next = event.relatedTarget as Node | null
        if (next && event.currentTarget.contains(next)) return
        window.setTimeout(() => setOpen(false), 120)
      }}
    >
      <Search size={15} className="model-picker-icon" />
      <input
        className="input model-picker-input"
        value={query}
        disabled={!models.length}
        placeholder={models.length ? '搜索模型名称或 ID' : '暂无已测试模型'}
        onFocus={event => { if (models.length) { setOpen(true); event.currentTarget.select() } }}
        onChange={event => { setQuery(event.target.value); setOpen(true) }}
        aria-label="选择模型"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls="intelligence-model-options"
        autoComplete="off"
      />
      {open && (
        <div className="model-picker-menu" id="intelligence-model-options" role="listbox">
          {options.length ? options.map(model => {
            const label = model.model_name || model.model_id
            return (
              <button
                key={model.model_id}
                type="button"
                className={`model-picker-option ${model.model_id === value ? 'is-selected' : ''}`}
                onMouseDown={event => event.preventDefault()}
                onClick={() => { onChange(model.model_id); setQuery(label); setOpen(false) }}
                role="option"
                aria-selected={model.model_id === value}
              >
                <span className="model-picker-option-title">
                  <strong>{label}</strong>
                  {model.model_id === value && <Badge tone="success">当前</Badge>}
                </span>
                <small>{model.model_id} · {PROVIDER_LABELS[model.provider] ?? model.provider}</small>
              </button>
            )
          }) : (
            <div className="model-picker-empty">没有找到匹配的模型</div>
          )}
          {options.length === 8 && <div className="model-picker-more">继续输入可缩小范围</div>}
        </div>
      )}
    </div>
  )
}

