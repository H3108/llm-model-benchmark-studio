

export function CapabilityTags({ capabilities, large = false }: { capabilities?: Record<string, unknown> | null; large?: boolean }) {
  const tags = capabilities ? Object.entries(capabilities).filter(([, v]) => v != null).slice(0, large ? 10 : 3).map(([key, value]) => `${key}: ${String(value)}`) : []
  return (
    <div className="capabilities">
      {tags.length ? tags.map(tag => <span className="capability" key={tag}>{tag}</span>) : <span className="muted">—</span>}
    </div>
  )
}

