import type { ClipDef, Settings, StyleDef } from './config.ts'

export interface Segment {
  start: number
  end: number
}

export interface Question {
  /** 换题时用来重挂 <video>，保证不残留上一题的播放位置 */
  key: string
  clip: ClipDef
  answer: StyleDef
  choices: StyleDef[]
}

export function shuffle<T>(items: readonly T[]): T[] {
  const copy = items.slice()
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

/**
 * 从一个视频里抽 15-20s 片段：先避开首尾 trimEdge 秒（开场白 / 谢幕），
 * 视频本身不够长就整段播。
 */
export function pickSegment(duration: number, settings: Settings): Segment {
  if (!Number.isFinite(duration) || duration <= 0) return { start: 0, end: 0 }

  const { minSegment, maxSegment, trimEdge } = settings
  const length = Math.min(duration, Math.max(minSegment, Math.random() * (maxSegment - minSegment) + minSegment))
  if (length >= duration) return { start: 0, end: duration }

  const slack = duration - length
  const earliest = Math.min(trimEdge, slack)
  const latest = Math.max(earliest, slack - trimEdge)
  const start = earliest + Math.random() * (latest - earliest)
  return { start, end: start + length }
}

/**
 * 抽签袋：一轮内不重复出同一个视频，抽完自动洗牌重来，
 * 并且不让洗牌接缝处连续两次出现同一个视频。
 */
export function createClipDeck(clips: readonly ClipDef[]): () => ClipDef {
  if (clips.length === 0) throw new Error('createClipDeck：clips 不能为空')
  let bag: ClipDef[] = []
  let previous: ClipDef | null = null

  return () => {
    if (bag.length === 0) {
      bag = shuffle(clips)
      const last = bag.length - 1
      if (bag.length > 1 && bag[last] === previous) {
        const j = Math.floor(Math.random() * last)
        ;[bag[last], bag[j]] = [bag[j], bag[last]]
      }
    }
    const clip = bag.pop() as ClipDef
    previous = clip
    return clip
  }
}

export function buildQuestion(clip: ClipDef, styles: readonly StyleDef[], choiceCount: number, nonce: string): Question {
  const answer = styles.find((style) => style.id === clip.style)
  if (!answer) throw new Error(`视频 ${clip.file} 的舞种 ${clip.style} 不存在`)

  const distractors = shuffle(styles.filter((style) => style.id !== answer.id)).slice(0, Math.max(0, choiceCount - 1))
  return { key: `${clip.file}#${nonce}`, clip, answer, choices: shuffle([answer, ...distractors]) }
}
