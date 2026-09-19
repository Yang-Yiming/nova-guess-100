import type { QuizConfig } from '../game/config.ts'
import { Supernova } from '../ui/supernova'

export interface StartScreenProps {
  config: QuizConfig
  /** 这局能用的视频段数 */
  clipCount: number
  /** 视频来源显示名 */
  sourceLabel: string
  /** 额外提醒，例如"还有 2 个视频没指定舞种" */
  extraNotice?: string | null
  onStart: () => void
  onSettings: () => void
}

export function StartScreen({ config, clipCount, sourceLabel, extraNotice, onStart, onSettings }: StartScreenProps) {
  const { settings, styles } = config
  const ready = clipCount > 0

  return (
    <div className="screen screen--start">
      <Supernova width={360} variant="light" />

      <h1 className="title">猜舞种</h1>
      <p className="subtitle">
        随机 {settings.minSegment}-{settings.maxSegment} 秒片段，猜舞种
      </p>

      <div className="stats">
        <span className="stat">
          <strong>{clipCount}</strong> 段视频
        </span>
        <span className="stat">
          <strong>{styles.length}</strong> 个舞种
        </span>
        <span className="stat">
          <strong>{settings.questionsPerRound}</strong> 题一局
        </span>
      </div>

      <p className="source">素材：{sourceLabel}</p>

      {!ready && (
        <section className="notice notice--error">
          <p>还没有配好的视频。进设置选一个视频文件夹，给视频指定舞种就能开始。</p>
        </section>
      )}

      {ready && extraNotice && (
        <section className="notice notice--warn">
          <p>{extraNotice}</p>
        </section>
      )}

      <div className="actions">
        <button className="btn btn--primary btn--big" type="button" disabled={!ready} onClick={onStart}>
          {ready ? '开始挑战' : '先去设置'}
        </button>
        <button className="btn" type="button" onClick={onSettings}>
          设置
        </button>
      </div>
    </div>
  )
}
