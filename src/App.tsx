import { useEffect, useState } from 'react'
import { QuizScreen } from './components/QuizScreen.tsx'
import { StartScreen } from './components/StartScreen.tsx'
import { SummaryScreen } from './components/SummaryScreen.tsx'
import { checkAvailability, ConfigError, loadConfig, type ClipDef, type Diagnostic, type QuizConfig } from './game/config.ts'
import { useQuiz } from './game/useQuiz.ts'

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; config: QuizConfig; diagnostics: Diagnostic[]; available: ClipDef[]; missing: ClipDef[] }

function Game({
  config,
  clips,
  muted,
  onToggleMute,
  onExit,
}: {
  config: QuizConfig
  clips: ClipDef[]
  muted: boolean
  onToggleMute: () => void
  onExit: () => void
}) {
  const quiz = useQuiz(config, clips)

  if (quiz.state.phase === 'done') {
    return <SummaryScreen quiz={quiz} styles={config.styles} onExit={onExit} />
  }
  return <QuizScreen quiz={quiz} config={config} muted={muted} onToggleMute={onToggleMute} />
}

export default function App() {
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [started, setStarted] = useState(false)
  const [muted, setMuted] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const { config, diagnostics } = await loadConfig()
        const { available, missing } = await checkAvailability(config.clips)
        if (!cancelled) setState({ status: 'ready', config, diagnostics, available, missing })
      } catch (cause) {
        if (cancelled) return
        setState({ status: 'error', message: cause instanceof ConfigError ? cause.message : String(cause) })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="app">
      <div className="wrap">
        {state.status === 'loading' && <p className="loading">加载中…</p>}

        {state.status === 'error' && (
          <div className="screen">
            <section className="notice notice--error">
              <p>{state.message}</p>
              <p>配置在 public/assets/clips.json，视频放同目录。</p>
            </section>
          </div>
        )}

        {state.status === 'ready' &&
          (started ? (
            <Game
              config={state.config}
              clips={state.available}
              muted={muted}
              onToggleMute={() => setMuted((value) => !value)}
              onExit={() => setStarted(false)}
            />
          ) : (
            <StartScreen
              config={state.config}
              diagnostics={state.diagnostics}
              available={state.available}
              missing={state.missing}
              onStart={() => setStarted(true)}
            />
          ))}
      </div>

      <footer className="footer">NOVA 街舞社 · 百团招新</footer>
    </div>
  )
}
