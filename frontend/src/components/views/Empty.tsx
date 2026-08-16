import { Server } from 'lucide-react'

export function Empty({ text }: { text: string }) {
  return (
    <div className="empty">
      <Server size={20} />
      <span>{text}</span>
    </div>
  )
}

