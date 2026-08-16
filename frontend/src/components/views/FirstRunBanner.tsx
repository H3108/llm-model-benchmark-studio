import { FlaskConical, Zap } from 'lucide-react'
import { Model, Benchmark } from '../../lib/api'
import { Button } from '../ui'

export function FirstRunBanner({ onStart }: { onStart: () => void }) {
  return (
    <section className="first-run-banner">
      <div className="first-run-icon">
        <FlaskConical size={22} />
      </div>
      <div>
        <h2>欢迎使用 LLM 模型评测工作台</h2>
        <p>当前还没有测试数据。建议先同步模型、配置 Admin Token、选择模型并执行第一次测试，再查看排行榜。</p>
        <div className="first-run-steps">
          <span>1. 同步模型</span>
          <span>2. 选择模型</span>
          <span>3. 执行第一次测试</span>
          <span>4.  查看排行榜</span>
        </div>
      </div>
      <Button onClick={onStart}>
        <Zap size={15} />  开始测试
      </Button>
    </section>
  )
}

