

export function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <small>{label}</small>
      <strong className="detail-value">{value}</strong>
    </div>
  )
}

