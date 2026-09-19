import { useCallback, useEffect, useMemo, useState } from 'react'
import { QuizScreen } from './components/QuizScreen.tsx'
import { SettingsScreen } from './components/SettingsScreen.tsx'
import { StartScreen } from './components/StartScreen.tsx'
import { SummaryScreen } from './components/SummaryScreen.tsx'
import {
  checkAvailability,
  DEFAULT_SETTINGS,
  loadConfig,
  type Diagnostic,
  type QuizConfig,
  type Settings,
  type StyleDef,
} from './game/config.ts'
import {
  canPickFolder,
  forgetFolder,
  guessStyle,
  pickFolder,
  reconnectFolder,
  restoreFolder,
  videosFromFiles,
  type LocalVideo,
} from './game/local.ts'
import { builtinClips, localClips, type PlayableClip } from './game/source.ts'
import { DEFAULT_STYLES } from './game/styles.ts'
import { loadPersisted, savePersisted, type PersistedState } from './game/store.ts'
import { stylesWithClips } from './game/quiz.ts'
import { useQuiz } from './game/useQuiz.ts'

interface BuiltinData {
  clips: PlayableClip[]
  /** clips.json 里的舞种；不写就是内置的那 7 个 */
  styles: StyleDef[]
  diagnostics: Diagnostic[]
}

/** 把用户在设置页填的数字夹回合理范围（输入框可以被手打绕过）。 */
function resolveSettings(raw: Partial<Settings>): Settings {
  const number = (value: unknown, fallback: number, min: number, max: number) =>
    typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : fallback
  const minSegment = number(raw.minSegment, DEFAULT_SETTINGS.minSegment, 2, 120)
  return {
    minSegment,
    maxSegment: Math.max(minSegment, number(raw.maxSegment, DEFAULT_SETTINGS.maxSegment, 2, 120)),
    trimEdge: number(raw.trimEdge, DEFAULT_SETTINGS.trimEdge, 0, 60),
    choiceCount: number(raw.choiceCount, DEFAULT_SETTINGS.choiceCount, 2, 8),
    questionsPerRound: number(raw.questionsPerRound, DEFAULT_SETTINGS.questionsPerRound, 1, 50),
  }
}

function View({
  clips,
  config,
  muted,
  onToggleMute,
  onExit,
}: {
  clips: readonly PlayableClip[]
  config: QuizConfig
  muted: boolean
  onToggleMute: () => void
  onExit: () => void
}) {
  const quiz = useQuiz(config, clips)
  if (quiz.state.phase === 'done') return <SummaryScreen quiz={quiz} styles={config.styles} onExit={onExit} />
  return <QuizScreen quiz={quiz} config={config} muted={muted} onToggleMute={onToggleMute} />
}

export default function App() {
  const [builtin, setBuiltin] = useState<BuiltinData>({ clips: [], styles: [...DEFAULT_STYLES], diagnostics: [] })
  const [persisted, setPersisted] = useState<PersistedState>(loadPersisted)
  const [videos, setVideos] = useState<LocalVideo[]>([])
  const [folderName, setFolderName] = useState<string | null>(null)
  const [pendingName, setPendingName] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [screen, setScreen] = useState<'start' | 'quiz' | 'settings'>('start')
  const [muted, setMuted] = useState(false)
  const [busy, setBusy] = useState(true)

  useEffect(() => savePersisted(persisted), [persisted])

  // 启动：读自带素材（public/assets/clips.json），再尝试恢复上次选的文件夹
  useEffect(() => {
    let cancelled = false
    void (async () => {
      // 便携版是双击 file:// 打开的，fetch 会被 CORS 挡掉，所以压根不去读
      if (!__PORTABLE__) {
        try {
          const { config, diagnostics } = await loadConfig()
          const { available, missing } = await checkAvailability(config.clips)
          if (!cancelled) {
            setBuiltin({ clips: builtinClips(available).clips, styles: config.styles, diagnostics })
            if (missing.length > 0) setNotice(`自带素材里 ${missing.length} 个文件不存在，已跳过`)
          }
        } catch (cause) {
          // 读不到不算致命：用文件夹模式就行
          if (!cancelled) setNotice(`没读到自带素材：${cause instanceof Error ? cause.message : String(cause)}`)
        }
      }

      const stored = loadPersisted()
      let restoredVideos = false
      if (stored.source === 'folder') {
        const restored = await restoreFolder()
        if (cancelled) return
        if (restored.status === 'ok') {
          setVideos(restored.videos)
          setFolderName(restored.name)
          restoredVideos = true
        } else if (restored.status === 'needs-permission') {
          setPendingName(restored.name)
          restoredVideos = true
        } else if (Object.keys(stored.assignments).length > 0) {
          // 上次是用「选文件」进来的：浏览器不给句柄，刷新后文件就丢了。
          // 舞种配置还留着，重新选一次同样的文件就能对上。
          setNotice('浏览器不允许自动找回上次选的文件，请重新选一次文件夹')
        }
      }
      if (cancelled) return
      // 便携版没有可用的视频就直接进设置，少点一步
      if (__PORTABLE__ && !restoredVideos) setScreen('settings')
      setBusy(false)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  /** 拿到一批新视频：记住文件夹、给没配过的文件猜个舞种。 */
  const applyVideos = useCallback((name: string, found: LocalVideo[]) => {
    setVideos(found)
    setFolderName(name)
    setPendingName(null)
    setPersisted((previous) => {
      const assignments = { ...previous.assignments }
      for (const video of found) {
        if (!assignments[video.path]) {
          const guessed = guessStyle(video.path, DEFAULT_STYLES)
          if (guessed) assignments[video.path] = guessed
        }
      }
      return { ...previous, source: 'folder', assignments }
    })
  }, [])

  const settings = useMemo(() => resolveSettings(persisted.settings), [persisted.settings])
  const usingFolder = persisted.source === 'folder' && videos.length > 0
  // 自带素材模式用 clips.json 的舞种（可能是自定义的），文件夹模式用内置那 7 个
  const allStyles = usingFolder ? DEFAULT_STYLES : builtin.styles
  const styles = useMemo(() => allStyles.filter((style) => !persisted.disabledStyles.includes(style.id)), [allStyles, persisted.disabledStyles])

  const config: QuizConfig = useMemo(() => ({ settings, styles: [...styles], clips: [] }), [settings, styles])

  const clips = useMemo<PlayableClip[]>(() => {
    if (!usingFolder) return builtin.clips
    const valid = new Set(styles.map((style) => style.id))
    const assignments: Record<string, string> = {}
    for (const [path, styleId] of Object.entries(persisted.assignments)) {
      if (valid.has(styleId)) assignments[path] = styleId
    }
    return localClips(videos, assignments).clips
  }, [usingFolder, builtin, videos, persisted.assignments, styles])

  // object URL 用完要还回去
  useEffect(() => {
    if (!usingFolder) return
    const urls = clips.map((clip) => clip.url)
    return () => {
      for (const url of urls) URL.revokeObjectURL(url)
    }
  }, [usingFolder, clips])

  // 只有配了视频的舞种才可能成为答案：它同时决定选项数上限和首页显示
  const styleCount = useMemo(() => stylesWithClips(clips, styles).length, [clips, styles])
  const maxChoices = Math.max(2, styleCount)
  const sourceLabel = usingFolder
    ? `文件夹「${folderName ?? '已选'}」`
    : __PORTABLE__
      ? '还没选文件夹'
      : '自带素材 public/assets'
  const unassigned = videos.length - clips.length

  const handleAssign = (path: string, styleId: string) =>
    setPersisted((previous) => {
      const assignments = { ...previous.assignments }
      if (styleId) assignments[path] = styleId
      else delete assignments[path]
      return { ...previous, assignments }
    })

  const handleChooseFiles = (files: File[]) => {
    const result = videosFromFiles(files)
    if (!result) {
      setNotice('没找到视频文件（支持 mp4 / m4v / mov / webm / mkv）')
      return
    }
    applyVideos(result.name, result.videos)
  }

  return (
    <div className="app">
      <div className="wrap">
        {busy ? (
          <p className="loading">加载中…</p>
        ) : screen === 'settings' ? (
          <SettingsScreen
            settings={settings}
            allStyles={allStyles}
            disabledStyles={persisted.disabledStyles}
            videos={videos}
            assignments={persisted.assignments}
            sourceLabel={sourceLabel}
            maxChoices={maxChoices}
            canPickFolder={canPickFolder()}
            onPickFolder={() => {
              void (async () => {
                try {
                  const picked = await pickFolder()
                  if (picked) applyVideos(picked.name, picked.videos)
                } catch (cause) {
                  setNotice(cause instanceof Error ? cause.message : String(cause))
                }
              })()
            }}
            onChooseFiles={handleChooseFiles}
            onAssign={handleAssign}
            onAutoAssign={() =>
              setPersisted((previous) => {
                const assignments = { ...previous.assignments }
                for (const video of videos) {
                  const guessed = guessStyle(video.path, DEFAULT_STYLES)
                  if (guessed) assignments[video.path] = guessed
                }
                return { ...previous, assignments }
              })
            }
            onClearFolder={() => {
              setVideos([])
              setFolderName(null)
              setPersisted((previous) => ({ ...previous, source: 'builtin' }))
              void forgetFolder()
            }}
            onToggleStyle={(styleId) =>
              setPersisted((previous) => ({
                ...previous,
                disabledStyles: previous.disabledStyles.includes(styleId)
                  ? previous.disabledStyles.filter((id) => id !== styleId)
                  : [...previous.disabledStyles, styleId],
              }))
            }
            onSettingsChange={(patch) => setPersisted((previous) => ({ ...previous, settings: { ...previous.settings, ...patch } }))}
            onResetAll={() =>
              setPersisted((previous) => ({ ...previous, settings: {}, disabledStyles: [] }))
            }
            onBack={() => setScreen('start')}
          />
        ) : screen === 'quiz' && styleCount >= 2 ? (
          <View
            clips={clips}
            config={config}
            muted={muted}
            onToggleMute={() => setMuted((value) => !value)}
            onExit={() => setScreen('start')}
          />
        ) : (
          <StartScreen
            config={config}
            clipCount={clips.length}
            styleCount={styleCount}
            sourceLabel={sourceLabel}
            extraNotice={
              usingFolder && unassigned > 0
                ? `还有 ${unassigned} 个视频没指定舞种，不会出现在游戏里`
                : builtin.diagnostics.length > 0
                  ? builtin.diagnostics[0].message
                  : null
            }
            onStart={() => setScreen('quiz')}
            onSettings={() => setScreen('settings')}
          />
        )}
      </div>

      {notice && (
        <button className="toast" type="button" onClick={() => setNotice(null)}>
          {notice}
        </button>
      )}

      {pendingName && (
        <div className="prompt">
          <p>继续用上次的文件夹「{pendingName}」？浏览器要你再授权一次。</p>
          <div className="actions">
            <button
              className="btn btn--primary"
              type="button"
              onClick={() => {
                void reconnectFolder()
                  .then((picked) => {
                    if (picked) applyVideos(picked.name, picked.videos)
                  })
                  .catch((cause: unknown) => setNotice(cause instanceof Error ? cause.message : String(cause)))
              }}
            >
              继续
            </button>
            <button
              className="btn"
              type="button"
              onClick={() => {
                setPendingName(null)
                setPersisted((previous) => ({ ...previous, source: 'builtin' }))
                void forgetFolder()
              }}
            >
              不用了
            </button>
          </div>
        </div>
      )}

      <footer className="footer">NOVA 街舞社 · 百团招新</footer>
    </div>
  )
}
