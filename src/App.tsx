import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { QuizScreen } from './components/QuizScreen.tsx'
import { SettingsScreen } from './components/SettingsScreen.tsx'
import { StartScreen } from './components/StartScreen.tsx'
import { SummaryScreen } from './components/SummaryScreen.tsx'
import {
  assetUrl,
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
import { purgeLegacyVideoCache } from './game/idb.ts'
import { findKnownServer, loadRemote, type RemoteSource } from './game/remote.ts'
import { httpClips, localClips, type PlayableClip } from './game/source.ts'
import { DEFAULT_STYLES, displayName } from './game/styles.ts'
import { loadPersisted, savePersisted, type PersistedState } from './game/store.ts'
import { stylesWithClips } from './game/quiz.ts'
import { useQuiz } from './game/useQuiz.ts'

interface BuiltinData {
  clips: PlayableClip[]
  /** clips.json 里的舞种；不写就是内置的那 7 个 */
  styles: StyleDef[]
  diagnostics: Diagnostic[]
}

interface RemoteState {
  /** 连上之后才有；url 直接指向对方服务器，不需要回收 */
  source: RemoteSource | null
  status: 'idle' | 'loading' | 'ready' | 'error'
  error: string | null
}

const NO_REMOTE: RemoteState = { source: null, status: 'idle', error: null }

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
  const [remote, setRemote] = useState<RemoteState>(NO_REMOTE)
  const [videos, setVideos] = useState<LocalVideo[]>([])
  const [folderName, setFolderName] = useState<string | null>(null)
  const [pendingName, setPendingName] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [screen, setScreen] = useState<'start' | 'quiz' | 'settings'>('start')
  const [muted, setMuted] = useState(false)
  const [busy, setBusy] = useState(true)
  /** 没指定过任何来源时，启动问一次 */
  const [askSource, setAskSource] = useState(false)
  const [draftUrl, setDraftUrl] = useState('')
  /** 白名单里探到的服务器；探到就把输入框换掉，但不自己连 */
  const [foundServer, setFoundServer] = useState<string | null>(null)

  const remoteAbort = useRef<AbortController | null>(null)

  useEffect(() => savePersisted(persisted), [persisted])

  // 之前版本把整份视频下到 IndexedDB 里，现在改成直接 GET —— 开一次库触发升级，把那些文件清掉
  useEffect(() => {
    void purgeLegacyVideoCache()
  }, [])

  /** 连服务器：读回 clips.json，视频地址直接用对方的 URL。 */
  const applyRemote = useCallback((raw: string) => {
    remoteAbort.current?.abort()
    const controller = new AbortController()
    remoteAbort.current = controller
    setRemote({ source: null, status: 'loading', error: null })
    setPersisted((previous) => ({ ...previous, source: 'remote', remoteUrl: raw.trim(), sourceConfirmed: true }))
    void (async () => {
      try {
        const source = await loadRemote(raw, controller.signal)
        if (controller.signal.aborted) return
        setRemote({ source, status: 'ready', error: null })
        setPersisted((previous) => ({ ...previous, source: 'remote', remoteUrl: source.base, sourceConfirmed: true }))
        setNotice(source.diagnostics.length > 0 ? source.diagnostics[0].message : null)
      } catch (cause) {
        if (controller.signal.aborted) return
        const message = cause instanceof Error ? cause.message : String(cause)
        setRemote({ source: null, status: 'error', error: message })
        setNotice(message)
      }
    })()
  }, [])

  /** 停掉服务器模式，改回自带素材。 */
  const useBuiltinAssets = useCallback(() => {
    remoteAbort.current?.abort()
    remoteAbort.current = null
    setRemote(NO_REMOTE)
    setPersisted((previous) => ({ ...previous, source: 'builtin', sourceConfirmed: true }))
  }, [])

  // 启动：读自带素材（public/assets/clips.json），再尝试恢复上次的文件夹 / 服务器
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const stored = loadPersisted()
      /** 本页 assets/ 里真能用的视频数；0 说明页面不是素材服务器发出来的 */
      let localClips = 0
      // 便携版是双击 file:// 打开的，fetch 会被 CORS 挡掉，所以压根不去读
      if (!__PORTABLE__) {
        try {
          const { config, diagnostics } = await loadConfig()
          const { available, missing } = await checkAvailability(config.clips)
          localClips = available.length
          if (!cancelled) {
            setBuiltin({ clips: httpClips(available, assetUrl), styles: config.styles, diagnostics })
            // 用服务器素材时本机 assets 是空的，这声提醒只会添乱
            if (missing.length > 0 && stored.source !== 'remote') setNotice(`自带素材里 ${missing.length} 个文件不存在，已跳过`)
          }
        } catch (cause) {
          // 读不到不算致命：用文件夹模式就行
          if (!cancelled && stored.source !== 'remote') {
            setNotice(`没读到自带素材：${cause instanceof Error ? cause.message : String(cause)}`)
          }
        }
      }

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
          // 下面会弹来源框，那儿已经说了这事，网页版就别再叠一条提醒；便携版没那个框，得留着。
          if (__PORTABLE__) setNotice('浏览器不允许自动找回上次选的文件，请重新选一次文件夹')
        }
      }
      if (cancelled) return
      // 便携版没有可用的视频就直接进设置，少点一步
      if (__PORTABLE__ && !restoredVideos) setScreen('settings')
      setBusy(false)

      // 来源优先级（逐条短路）：
      // 1. 指定了文件夹就用文件夹，绝不自动走网络
      // 2. 明确选过服务器、且记得地址：接着连
      // 3. 明确选过「用本页素材」：就用它
      // 4. 其余（没选过，或文件夹已经没了）：问一次，默认走服务器 GET
      if (stored.source === 'folder' && restoredVideos) return
      if (stored.source === 'remote' && stored.remoteUrl !== '') {
        applyRemote(stored.remoteUrl)
        return
      }
      if (stored.source === 'builtin' && stored.sourceConfirmed) return
      // 便携版是 file:// 双击打开的，fetch 到 http 会被拦，问了也没用
      if (__PORTABLE__) return
      // 页面多半就是素材服务器发出来的，把当前地址填进去当默认值
      setDraftUrl(stored.remoteUrl || location.origin)
      setAskSource(true)
      // 本页没有自带素材时才去找：页面本身就是服务器发的，同源那个已经够好了
      if (localClips === 0) {
        void findKnownServer().then((found) => {
          if (cancelled || !found) return
          // 只把输入框换成找到的地址，不自己连 —— 连不连由用户点
          setFoundServer(found)
          setDraftUrl(found)
        })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [applyRemote])

  /** 拿到一批新视频：记住文件夹、给没配过的文件猜个舞种。 */
  const applyVideos = useCallback((name: string, found: LocalVideo[]) => {
    remoteAbort.current?.abort()
    remoteAbort.current = null
    setRemote(NO_REMOTE)
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
      return { ...previous, source: 'folder', sourceConfirmed: true, assignments }
    })
  }, [])

  const settings = useMemo(() => resolveSettings(persisted.settings), [persisted.settings])
  const usingFolder = persisted.source === 'folder' && videos.length > 0
  const usingRemote = persisted.source === 'remote'
  // 素材来源的优先级：服务器 > 本地文件夹 > 自带 assets。舞种清单跟着来源走。
  const allStyles = usingRemote && remote.source ? remote.source.styles : usingFolder ? DEFAULT_STYLES : builtin.styles
  // 舞种名在这里统一解析好，下游组件直接用 style.name 就是该显示的写法
  const styles = useMemo(
    () =>
      allStyles
        .filter((style) => !persisted.disabledStyles.includes(style.id))
        .map((style) => ({ ...style, name: displayName(style, persisted.showChinese) })),
    [allStyles, persisted.disabledStyles, persisted.showChinese],
  )

  const config: QuizConfig = useMemo(() => ({ settings, styles: [...styles], clips: [] }), [settings, styles])

  const clips = useMemo<PlayableClip[]>(() => {
    if (usingRemote) return remote.source?.clips ?? []
    if (!usingFolder) return builtin.clips
    const valid = new Set(styles.map((style) => style.id))
    const assignments: Record<string, string> = {}
    for (const [path, styleId] of Object.entries(persisted.assignments)) {
      if (valid.has(styleId)) assignments[path] = styleId
    }
    return localClips(videos, assignments).clips
  }, [usingRemote, remote, usingFolder, builtin, videos, persisted.assignments, styles])

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
  const sourceLabel = usingRemote
    ? `服务器 ${persisted.remoteUrl || remote.source?.base || ''}`
    : usingFolder
      ? `文件夹「${folderName ?? '已选'}」`
      : __PORTABLE__
        ? '还没选文件夹'
        : '自带素材 public/assets'
  const unassigned = usingRemote ? 0 : videos.length - clips.length

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

  /** 启动询问框里选「用服务器素材」：本页同源就直接用，否则连填的地址。 */
  const useServerSource = () => {
    setFoundServer(null)
    if (builtin.clips.length > 0) {
      setAskSource(false)
      setPersisted((previous) => ({ ...previous, source: 'builtin', sourceConfirmed: true }))
      return
    }
    const url = draftUrl.trim()
    if (url === '') {
      setNotice('先填一下素材服务器的地址')
      return
    }
    setAskSource(false)
    applyRemote(url)
  }

  /** 启动询问框里选「选本机文件夹」：立刻弹选择器，别让用户再点一次。 */
  const useFolderSource = () => {
    void (async () => {
      try {
        const picked = await pickFolder()
        if (!picked) return
        setAskSource(false)
        setFoundServer(null)
        applyVideos(picked.name, picked.videos)
      } catch (cause) {
        setNotice(cause instanceof Error ? cause.message : String(cause))
      }
    })()
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
            showChinese={persisted.showChinese}
            onToggleShowChinese={() =>
              setPersisted((previous) => ({ ...previous, showChinese: !previous.showChinese }))
            }
            canPickFolder={canPickFolder()}
            remote={remote}
            remoteUrl={persisted.remoteUrl}
            onConnectRemote={applyRemote}
            onCancelRemote={useBuiltinAssets}
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
              useBuiltinAssets()
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
              remote.status === 'error' && remote.error
                ? remote.error
                : usingRemote
                  ? (remote.source?.diagnostics[0]?.message ?? null)
                  : usingFolder && unassigned > 0
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

      {askSource && (
        <div className="prompt">
          <p>视频从哪来？</p>
          <div className="prompt__body">
            <p className="prompt__hint">
              {foundServer
                ? '在同一个网络里找到了这台 —— 视频直接从那台机器取，不用下载。'
                : builtin.clips.length > 0
                  ? `这个页面就是素材服务器发出来的（${location.host}），直接用服务器上的素材就行，不用下载。`
                  : '这个页面不是素材服务器发出来的。填一下它的地址 —— 也就是跑 bun run serve 的那台机器，启动时会打印出来。'}
            </p>
            {foundServer && (
              <p className="prompt__found">
                <span className="prompt__found-label">找到</span>
                {foundServer}
              </p>
            )}
            {builtin.clips.length === 0 && (
              <input
                className="remote__input"
                type="text"
                placeholder="192.168.1.5:8888"
                value={draftUrl}
                spellCheck={false}
                autoComplete="off"
                autoFocus
                onChange={(event) => setDraftUrl(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') useServerSource()
                }}
              />
            )}
            <div className="actions">
              <button className="btn btn--primary" type="button" onClick={useServerSource}>
                {builtin.clips.length > 0 ? '用服务器素材' : '连接'}
              </button>
              {canPickFolder() && (
                <button className="btn" type="button" onClick={useFolderSource}>
                  选本机文件夹
                </button>
              )}
            </div>
            <p className="prompt__hint prompt__hint--small">之后都能在设置里改。</p>
          </div>
        </div>
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
                setPersisted((previous) => ({ ...previous, source: 'builtin', sourceConfirmed: true }))
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
