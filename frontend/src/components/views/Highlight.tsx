import { ReactNode } from 'react'
import { Score } from '../../lib/api'
import { Card } from '../ui'

export function Highlight({ title, icon, score, tone = 'gold', scoreField = 'overall', valueFormatter }: { title: string; icon: ReactNode; score?: Score | null; tone?: 'gold' | 'blue' | 'green'; scoreField?: 'overall' | 'operational' | 'capability'; valueFormatter?: (s: Score) => string }) {
  const scoreValue = scoreField === 'operational' ? score?.operational_score : scoreField === 'capability' ? score?.capability_score : score?.overall_score
  return (
    <Card className={`highlight highlight-${tone}`}>
      <div className={`highlight-icon highlight-icon-${tone}`}>{icon}</div>
      <div>
        <small>{title}</small>
        <strong>{score ? score.model_id.split('/').pop() : '—'}</strong>
        <span>
          {score ? (valueFormatter ? valueFormatter(score) : `${scoreValue?.toFixed(1)} 分 · ${score.tests}  次测试`) : '暂无数据'}
        </span>
      </div>
    </Card>
  )
}

