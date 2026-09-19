import type { Settings, StyleDef } from './config.ts'
import type { PlayableClip } from './source.ts'

export interface Segment {
  start: number
  end: number
}

export interface Question {
  /** 换题时用来重挂 <video>，保证不残留上一题的播放位置 */
  key: string
  clip: PlayableClip
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
 * 抽签袋：一轮内不重复，抽完自动洗牌重来，接缝处也不连着出同一个。
 * 舞种、视频各用一个袋子，于是「每个舞种等概率」和「同一舞种内每个视频等概率」同时成立。
 */
function createBag<T>(items: readonly T[]): () => T {
  const pool = items.slice()
  let bag: T[] = []
  let previous: T | null = null

  return () => {
    if (bag.length === 0) {
      bag = shuffle(pool)
      const last = bag.length - 1
      if (bag.length > 1 && bag[last] === previous) {
        const j = Math.floor(Math.random() * last)
        ;[bag[last], bag[j]] = [bag[j], bag[last]]
      }
    }
    const item = bag.pop() as T
    previous = item
    return item
  }
}

/** 有视频的舞种才算数：没有视频的舞种不可能成为答案，也不该出现在选项里。 */
export function stylesWithClips(clips: readonly PlayableClip[], styles: readonly StyleDef[]): StyleDef[] {
  const ids = new Set(clips.map((clip) => clip.style))
  return styles.filter((style) => ids.has(style.id))
}

/** 按舞种分组，保持传入的舞种顺序，方便每个舞种一个袋子。 */
function groupByStyle(clips: readonly PlayableClip[]): Map<string, PlayableClip[]> {
  const groups = new Map<string, PlayableClip[]>()
  for (const clip of clips) {
    const group = groups.get(clip.style)
    if (group) group.push(clip)
    else groups.set(clip.style, [clip])
  }
  return groups
}

/**
 * 出题顺序：**先等概率抽舞种 → 再在该舞种里抽视频 → 最后在视频里抽片段**。
 *
 * 这样每个舞种被问到的机会只跟「有几个舞种」有关，跟「某个舞种拍了几支视频」无关
 * —— 否则视频多的人会被反复问到。
 */
export function createClipPicker(clips: readonly PlayableClip[], styles: readonly StyleDef[]): () => PlayableClip {
  const groups = groupByStyle(clips)
  const eligible = stylesWithClips(clips, styles)
  if (eligible.length === 0) throw new Error('createClipPicker：没有配好舞种的视频')

  const styleBag = createBag(eligible)
  const clipBags = new Map(eligible.map((style) => [style.id, createBag(groups.get(style.id) as PlayableClip[])]))

  return () => {
    const style = styleBag()
    return (clipBags.get(style.id) as () => PlayableClip)()
  }
}

export function buildQuestion(clip: PlayableClip, styles: readonly StyleDef[], choiceCount: number, nonce: string): Question {
  const answer = styles.find((style) => style.id === clip.style)
  if (!answer) throw new Error(`视频 ${clip.file} 的舞种 ${clip.style} 不存在`)

  // 干扰项同样从「有视频的舞种」里抽，保证每个选项都真的可能是答案
  const distractors = shuffle(styles.filter((style) => style.id !== answer.id)).slice(0, Math.max(0, choiceCount - 1))
  return { key: `${clip.file}#${nonce}`, clip, answer, choices: shuffle([answer, ...distractors]) }
}
