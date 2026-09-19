import type { ClipDef, Diagnostic, QuizConfig } from '../game/config.ts'
import { Supernova } from '../ui/supernova'

export interface StartScreenProps {
  config: QuizConfig
  diagnostics: readonly Diagnostic[]
  available: readonly ClipDef[]
  missing: readonly ClipDef[]
  onStart: () => void
}

const ENTRY_SHAPE = '{ "file": "hiphop-01.mp4", "style": "hiphop", "title": "谁跳的" }'

export function StartScreen({ config, diagnostics, available, missing, onStart }: StartScreenProps) {
  const { settings, styles } = config
  const ready = available.length > 0

  return (
    <div className="screen screen--start">
      <Supernova width={360} variant="light" />

      <h1 className="title">猜舞种</h1>
      <p className="subtitle">随机 {settings.minSegment}-{settings.maxSegment} 秒片段，猜舞种</p>

      <div className="stats">
        <span className="stat">
          <strong>{available.length}</strong> 段视频
        </span>
        <span className="stat">
          <strong>{styles.length}</strong> 个舞种
        </span>
        <span className="stat">
          <strong>{settings.questionsPerRound}</strong> 题一局
        </span>
      </div>

      {!ready && (
        <section className="notice notice--error">
          <p>
            还没有视频：把 mp4 放进 <code>public/assets/</code>，在 <code>clips.json</code> 的 <code>clips</code>{' '}
            里登记。
          </p>
          <pre className="code">{ENTRY_SHAPE}</pre>
        </section>
      )}

      {ready && missing.length > 0 && (
        <section className="notice notice--warn">
          <p>{missing.length} 个视频找不到，已跳过：</p>
          <ul className="list">
            {missing.map((clip) => (
              <li key={clip.file}>
                <code>{clip.file}</code>
              </li>
            ))}
          </ul>
        </section>
      )}

      {diagnostics.length > 0 && (
        <section className="notice notice--warn">
          <ul className="list">
            {diagnostics.map((item) => (
              <li key={item.message}>{item.message}</li>
            ))}
          </ul>
        </section>
      )}

      <button className="btn btn--primary btn--big" type="button" disabled={!ready} onClick={onStart}>
        {ready ? '开始挑战' : '先放视频进来'}
      </button>
    </div>
  )
}
