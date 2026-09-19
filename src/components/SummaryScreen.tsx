import type { StyleDef } from '../game/config.ts'
import type { Quiz } from '../game/useQuiz.ts'
import { Supernova } from '../ui/supernova'

export interface SummaryScreenProps {
  quiz: Quiz
  styles: readonly StyleDef[]
  onExit: () => void
}

export function SummaryScreen({ quiz, styles, onExit }: SummaryScreenProps) {
  const { state, total } = quiz
  const answered = state.history.length
  const rate = answered === 0 ? 0 : Math.round((state.correctCount / answered) * 100)
  const missed = styles.filter((style) => state.history.some((record) => !record.isCorrect && record.correct.id === style.id))

  return (
    <div className="screen screen--summary">
      <Supernova width={220} variant="light" />

      <p className="summary__score">
        <strong>{state.correctCount}</strong>
        <span> / {total}</span>
      </p>
      <p className="summary__meta">
        准确率 {rate}% · 最长连对 {state.bestStreak}
      </p>

      {missed.length > 0 && (
        <section className="notice notice--warn">
          <p>再认认这几个：</p>
          <ul className="list">
            {missed.map((style) => (
              <li key={style.id}>
                <strong>{style.name}</strong>
                {style.note ? ` — ${style.note}` : ''}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="actions">
        <button className="btn btn--primary" type="button" onClick={quiz.restart}>
          再来一局
        </button>
        <button className="btn" type="button" onClick={onExit}>
          回首页
        </button>
      </div>
    </div>
  )
}
