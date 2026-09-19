import { useEffect, useState } from 'react'
import type { QuizConfig } from '../game/config.ts'
import type { Quiz } from '../game/useQuiz.ts'
import { ChoiceGrid } from './ChoiceGrid.tsx'
import { VideoStage } from './VideoStage.tsx'

export interface QuizScreenProps {
  quiz: Quiz
  config: QuizConfig
  muted: boolean
  onToggleMute: () => void
}

export function QuizScreen({ quiz, config, muted, onToggleMute }: QuizScreenProps) {
  const { state, total, answered } = quiz
  const { question } = state
  const [ended, setEnded] = useState(false)
  const [failed, setFailed] = useState(false)

  const revealed = state.pickedId !== null
  const isCorrect = revealed && state.pickedId === question.answer.id
  const lastQuestion = state.questionNo >= total

  // 换题：清掉上一题的状态
  useEffect(() => {
    setEnded(false)
    setFailed(false)
  }, [question.key])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === 'BUTTON' || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return
      if (event.key === 'Enter' && revealed) {
        event.preventDefault()
        quiz.next()
        return
      }
      const index = Number(event.key) - 1
      if (Number.isInteger(index) && index >= 0 && index < question.choices.length && !revealed) {
        event.preventDefault()
        quiz.answer(question.choices[index].id)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [quiz, question, revealed])

  return (
    <div className="screen screen--quiz">
      <header className="hud">
        <div className="hud__progress" aria-hidden="true">
          <span style={{ width: `${(answered / total) * 100}%` }} />
        </div>
        <div className="hud__row">
          <span className="hud__item">
            <strong>{state.questionNo}</strong> / {total} 题
          </span>
          <span className="hud__item">
            答对 <strong>{state.correctCount}</strong>
          </span>
          <span className="hud__item">
            连对 <strong>{state.streak}</strong>
          </span>
        </div>
      </header>

      <VideoStage
        key={question.key}
        clip={question.clip}
        settings={config.settings}
        loop={revealed}
        muted={muted}
        onEnded={() => setEnded(true)}
        onError={() => setFailed(true)}
        onToggleMute={onToggleMute}
      />

      {!revealed && (
        <p className="hint">
          {failed ? (
            <>
              视频加载失败
              <button className="chip" type="button" onClick={quiz.skip}>
                跳过
              </button>
            </>
          ) : ended ? (
            '片段播完，选吧'
          ) : (
            '猜猜是什么舞种'
          )}
        </p>
      )}

      <ChoiceGrid choices={question.choices} pickedId={state.pickedId} answerId={question.answer.id} onPick={quiz.answer} />

      {revealed && (
        <section className={'reveal' + (isCorrect ? ' reveal--hit' : ' reveal--miss')}>
          <p className="reveal__verdict">{isCorrect ? '答对了' : '答错了，正确答案：'}</p>
          <p className="reveal__style">{question.answer.name}</p>
          {question.answer.note && <p className="reveal__note">{question.answer.note}</p>}
          {question.clip.title && <p className="reveal__source">素材 · {question.clip.title}</p>}
          <button className="btn btn--primary" type="button" onClick={quiz.next}>
            {lastQuestion ? '看成绩' : '下一题'}
          </button>
        </section>
      )}
    </div>
  )
}
