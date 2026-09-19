import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { assetUrl, type ClipDef, type Settings } from '../game/config.ts'
import { pickSegment, type Segment } from '../game/quiz.ts'

export interface VideoStageProps {
  /** 换题时父组件要用 key={question.key} 重挂本组件，才能重新抽片段 */
  clip: ClipDef
  settings: Settings
  /** true 时片段循环播放（揭晓答案后让大家再看一遍） */
  loop: boolean
  muted: boolean
  /** 片段播完（loop 为 false 时只回调一次） */
  onEnded?: () => void
  onError?: (clip: ClipDef) => void
  onToggleMute?: () => void
}

type Status = 'loading' | 'ready' | 'error'

export function VideoStage({ clip, settings, loop, muted, onEnded, onError, onToggleMute }: VideoStageProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const ringRef = useRef<HTMLDivElement | null>(null)
  const remainingRef = useRef<HTMLSpanElement | null>(null)
  const rafRef = useRef(0)
  const segmentRef = useRef<Segment | null>(null)
  const endedRef = useRef(false)

  // 回调统一放 ref：父组件重渲染不会重建监听、也不会重挂视频
  const latest = useRef({ loop, onEnded, onError })
  latest.current = { loop, onEnded, onError }

  const [status, setStatus] = useState<Status>('loading')
  const [buffering, setBuffering] = useState(true)
  const [blocked, setBlocked] = useState(false)
  /** 竖屏手机拍的视频就让舞台跟着变竖，别硬塞进 16:9 */
  const [ratio, setRatio] = useState(16 / 9)

  const paint = useCallback(() => {
    const video = videoRef.current
    const segment = segmentRef.current
    if (!video || !segment) return
    const span = Math.max(0.001, segment.end - segment.start)
    const progress = Math.min(1, Math.max(0, (video.currentTime - segment.start) / span))
    ringRef.current?.style.setProperty('--progress', progress.toFixed(4))
    if (remainingRef.current) remainingRef.current.textContent = String(Math.max(0, Math.ceil(segment.end - video.currentTime)))
  }, [])

  const tick = useCallback(() => {
    const video = videoRef.current
    const segment = segmentRef.current
    if (video && segment && !video.paused) {
      paint()
      if (video.currentTime >= segment.end - 0.02) {
        if (latest.current.loop) {
          video.currentTime = segment.start
          paint()
        } else {
          video.pause()
          if (!endedRef.current) {
            endedRef.current = true
            latest.current.onEnded?.()
          }
        }
      }
    }
    rafRef.current = requestAnimationFrame(tick)
  }, [paint])

  // 同一组件实例被复用到另一个视频时（正常情况下父组件会用 key 重挂），也要重新抽片段
  useEffect(() => {
    segmentRef.current = null
    endedRef.current = false
    setStatus('loading')
    setBuffering(true)
    setBlocked(false)
    setRatio(16 / 9)
    ringRef.current?.style.setProperty('--progress', '0')
    return () => cancelAnimationFrame(rafRef.current)
  }, [clip.file])

  const play = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    endedRef.current = false
    void video.play().then(
      () => setBlocked(false),
      () => setBlocked(true),
    )
  }, [])

  const handleLoadedMetadata = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    if (video.videoWidth > 0 && video.videoHeight > 0) {
      setRatio(Math.min(2.4, Math.max(0.5, video.videoWidth / video.videoHeight)))
    }
    const segment = pickSegment(video.duration, settings)
    segmentRef.current = segment
    if (segment.start > 0) video.currentTime = segment.start
    paint()
    play()
  }, [settings, paint, play])

  const replay = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    endedRef.current = false
    video.currentTime = segmentRef.current?.start ?? 0
    paint()
    play()
  }, [paint, play])

  const handleError = useCallback(() => {
    setStatus('error')
    latest.current.onError?.(clip)
  }, [clip])

  return (
    <div className="stage" style={{ '--stage-ratio': ratio } as CSSProperties}>
      <video
        ref={videoRef}
        className={'stage__video' + (status === 'ready' ? '' : ' stage__video--hidden')}
        src={assetUrl(clip.file)}
        playsInline
        disablePictureInPicture
        preload="auto"
        muted={muted}
        onLoadedMetadata={handleLoadedMetadata}
        onCanPlay={() => {
          setStatus('ready')
          setBuffering(false)
        }}
        onPlaying={() => setBuffering(false)}
        onPlay={() => {
          cancelAnimationFrame(rafRef.current)
          rafRef.current = requestAnimationFrame(tick)
        }}
        onWaiting={() => setBuffering(true)}
        onPause={() => {
          cancelAnimationFrame(rafRef.current)
          paint()
        }}
        onError={handleError}
      />

      {status === 'error' ? (
        <div className="stage__overlay">
          <p className="stage__error">读不到 {clip.file}</p>
        </div>
      ) : (
        <>
          <div className="stage__ring" ref={ringRef} aria-hidden="true">
            <span className="stage__remaining">
              <span ref={remainingRef}>{Math.round(settings.maxSegment)}</span>s
            </span>
          </div>

          {blocked ? (
            <button className="stage__overlay stage__overlay--action" type="button" onClick={play}>
              <svg viewBox="0 0 24 24" width="40" height="40" aria-hidden="true">
                <path fill="currentColor" d="M8 5.5v13l11-6.5z" />
              </svg>
              <span>点击播放</span>
            </button>
          ) : buffering ? (
            <div className="stage__overlay stage__overlay--quiet">
              <span className="stage__dot" />
              缓冲中
            </div>
          ) : null}
        </>
      )}

      <div className="stage__bar">
        <button className="chip" type="button" onClick={replay}>
          重播
        </button>
        <button className="chip" type="button" onClick={onToggleMute} aria-pressed={muted}>
          {muted ? '开声音' : '静音'}
        </button>
      </div>
    </div>
  )
}
