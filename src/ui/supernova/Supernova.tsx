import { useCallback, useEffect, useRef } from 'react'
import logoUrl from './assets/nova-logo-black.png'
import clipConfig from './clips.json'
import './supernova.css'

interface ClipEntry {
  file: string
  /** Stop playback the moment the pointer leaves the logo. Default true. */
  stopOnLeave?: boolean
}

interface ResolvedClip extends ClipEntry {
  url: string
}

/** Every mp3 dropped into ./clips/ is bundled automatically (as URL only). */
const clipUrls = import.meta.glob<string>('./clips/*.mp3', {
  eager: true,
  query: '?url',
  import: 'default',
})

const clips: ResolvedClip[] = (clipConfig.clips as ClipEntry[])
  .map((entry) => ({ ...entry, url: clipUrls[`./clips/${entry.file}`] }))
  .filter((clip) => {
    if (!clip.url) console.warn(`[Supernova] configured clip not found: ${clip.file}`)
    return Boolean(clip.url)
  })

export interface SupernovaProps {
  /** Logo width; height follows the native 1280:633 aspect ratio. */
  width?: number | string
  /** 'dark' renders the black ink logo (light backgrounds); 'light' inverts it (dark backgrounds). */
  variant?: 'dark' | 'light'
  className?: string
}

export function Supernova({ width = 320, variant = 'dark', className }: SupernovaProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const stopOnLeaveRef = useRef(true)
  const lastFileRef = useRef<string | null>(null)
  const cacheRef = useRef(new Map<string, HTMLAudioElement>())

  useEffect(() => () => audioRef.current?.pause(), [])

  const stop = useCallback(() => {
    audioRef.current?.pause()
    audioRef.current = null
  }, [])

  const playRandom = useCallback(() => {
    if (clips.length === 0) return
    // Avoid picking the same clip twice in a row (when there is a choice)
    let clip = clips[Math.floor(Math.random() * clips.length)]
    if (clips.length > 1) {
      while (clip.file === lastFileRef.current) {
        clip = clips[Math.floor(Math.random() * clips.length)]
      }
    }
    lastFileRef.current = clip.file
    stopOnLeaveRef.current = clip.stopOnLeave !== false

    stop()
    let audio = cacheRef.current.get(clip.url)
    if (!audio) {
      audio = new Audio(clip.url)
      audio.volume = 0.7
      cacheRef.current.set(clip.url, audio)
    }
    audio.currentTime = 0
    audioRef.current = audio
    void audio.play().catch(() => {
      /* browser autoplay policy — stay silent */
    })
  }, [stop])

  const onLeave = useCallback(() => {
    if (stopOnLeaveRef.current) stop()
  }, [stop])

  return (
    <div
      className={
        'supernova' + (variant === 'light' ? ' supernova--light' : '') + (className ? ` ${className}` : '')
      }
      style={{ width }}
      onMouseEnter={playRandom}
      onMouseLeave={onLeave}
    >
      <img className="supernova__logo" src={logoUrl} alt="NOVA" draggable={false} />
    </div>
  )
}
