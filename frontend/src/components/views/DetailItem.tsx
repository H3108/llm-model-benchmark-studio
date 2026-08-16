

export function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="detail-kv">
      <span className="detail-kv-label">{label}</span>
      <span className="detail-kv-value">{value}</span>
    </div>
  )
}

