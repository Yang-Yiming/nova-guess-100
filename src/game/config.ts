/**
 * clips.json 的加载与校验。
 *
 * 文件放在 `public/assets/clips.json`（跟视频同一个目录），运行时 fetch，
 * 所以改 json / 换视频之后**不用重新 build**，刷新页面即可。
 */

import { DEFAULT_STYLES, type StyleDef } from './styles.ts'

export type { StyleDef }

export interface ClipDef {
  /** 相对 `public/assets/` 的文件名，可带子目录，例如 "hiphop/01.mp4" */
  file: string
  /** 对应的舞种 id */
  style: string
  /** 可选：揭晓时展示的来源标注，例如 "2024 迎新晚会 · 阿豆" */
  title?: string
}

export interface Settings {
  /** 片段最短秒数 */
  minSegment: number
  /** 片段最长秒数 */
  maxSegment: number
  /** 掐掉视频首尾各几秒（避开开场白 / 结尾谢幕），不够长就不掐 */
  trimEdge: number
  /** 每题几个选项 */
  choiceCount: number
  /** 一局几题 */
  questionsPerRound: number
}

export interface QuizConfig {
  settings: Settings
  styles: StyleDef[]
  clips: ClipDef[]
}

export interface Diagnostic {
  message: string
}

export interface LoadedConfig {
  config: QuizConfig
  diagnostics: Diagnostic[]
}

export const DEFAULT_SETTINGS: Settings = {
  minSegment: 15,
  maxSegment: 20,
  trimEdge: 2,
  choiceCount: 4,
  questionsPerRound: 8,
}

/** 致命配置错误：整页显示错误面板，而不是白屏。 */
export class ConfigError extends Error {}

/** 延迟到调用时再读 document：parseConfig 是纯函数，可以被 bun 直接测。 */
function assetsDir(): URL {
  return new URL('assets/', document.baseURI)
}

/** `assets/` 下的文件名 → 可播放 URL（保留子目录，逐段编码）。 */
export function assetUrl(file: string): string {
  const encoded = file
    .split('/')
    .filter((segment) => segment.length > 0)
    .map((segment) => encodeURIComponent(segment))
    .join('/')
  return new URL(encoded, assetsDir()).href
}

// ---- raw JSON 的边界：字段一律 unknown，读过才敢信 ----

interface RawSettings {
  minSegment?: unknown
  maxSegment?: unknown
  trimEdge?: unknown
  choiceCount?: unknown
  questionsPerRound?: unknown
}

interface RawStyle {
  id?: unknown
  name?: unknown
  note?: unknown
}

interface RawClip {
  file?: unknown
  style?: unknown
  title?: unknown
}

interface RawConfig {
  settings?: unknown
  styles?: unknown
  clips?: unknown
}

function asString(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new ConfigError(`${path} 需要是非空字符串，收到 ${JSON.stringify(value)}`)
  return value
}

function asOptionalString(value: unknown, path: string): string | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'string') throw new ConfigError(`${path} 需要是字符串，收到 ${JSON.stringify(value)}`)
  return value
}

function asArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw new ConfigError(`${path} 需要是数组`)
  return value
}

function asNumber(value: unknown, path: string, fallback: number, min: number): number {
  if (value === undefined) return fallback
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min) {
    throw new ConfigError(`${path} 需要是不小于 ${min} 的数字，收到 ${JSON.stringify(value)}`)
  }
  return value
}

function asObject<T>(value: unknown, path: string): T {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ConfigError(`${path} 需要是一个对象，收到 ${JSON.stringify(value)}`)
  }
  return value as T
}

/** 纯函数：把任意 JSON 变成可信配置，或者抛出 ConfigError。 */
export function parseConfig(raw: unknown): LoadedConfig {
  const diagnostics: Diagnostic[] = []
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new ConfigError('clips.json 顶层需要是一个对象')
  const root = raw as RawConfig

  const s: RawSettings = root.settings === undefined ? {} : asObject<RawSettings>(root.settings, 'settings')
  const minSegment = asNumber(s.minSegment, 'settings.minSegment', DEFAULT_SETTINGS.minSegment, 2)
  const settings: Settings = {
    minSegment,
    maxSegment: Math.max(minSegment, asNumber(s.maxSegment, 'settings.maxSegment', DEFAULT_SETTINGS.maxSegment, 2)),
    trimEdge: asNumber(s.trimEdge, 'settings.trimEdge', DEFAULT_SETTINGS.trimEdge, 0),
    choiceCount: Math.round(asNumber(s.choiceCount, 'settings.choiceCount', DEFAULT_SETTINGS.choiceCount, 2)),
    questionsPerRound: Math.round(
      asNumber(s.questionsPerRound, 'settings.questionsPerRound', DEFAULT_SETTINGS.questionsPerRound, 1),
    ),
  }

  const styles: StyleDef[] = []
  const stylesById = new Map<string, StyleDef>()
  // 不写 styles 就用代码里内置的 7 个舞种；写了就以 json 为准
  for (const [index, entry] of (root.styles === undefined ? DEFAULT_STYLES : asArray(root.styles, 'styles')).entries()) {
    const style = asObject<RawStyle>(entry, `styles[${index}]`)
    const id = asString(style.id, `styles[${index}].id`)
    if (stylesById.has(id)) throw new ConfigError(`styles 里 id 重复：${id}`)
    const parsed: StyleDef = {
      id,
      name: asString(style.name, `styles[${index}].name`),
      note: asOptionalString(style.note, `styles[${index}].note`),
    }
    styles.push(parsed)
    stylesById.set(id, parsed)
  }

  const clips: ClipDef[] = []
  const seenFiles = new Set<string>()
  for (const [index, entry] of (root.clips === undefined ? [] : asArray(root.clips, 'clips')).entries()) {
    const clip = asObject<RawClip>(entry, `clips[${index}]`)
    const file = asString(clip.file, `clips[${index}].file`)
    const style = asString(clip.style, `clips[${index}].style`)
    if (seenFiles.has(file)) {
      diagnostics.push({ message: `clips 里 file 重复，已忽略后一条：${file}` })
      continue
    }
    if (!stylesById.has(style)) {
      diagnostics.push({ message: `clips[${index}]（${file}）的 style "${style}" 不在 styles 里，已跳过` })
      continue
    }
    seenFiles.add(file)
    clips.push({ file, style, title: asOptionalString(clip.title, `clips[${index}].title`) })
  }

  if (styles.length < 2) throw new ConfigError('styles 至少要有 2 个舞种，否则出不了选择题')
  // clips 为空不算错误：首页会提示"还没有可用的视频"，这样刚建好配置文件时也能打开页面

  if (settings.choiceCount > styles.length) {
    diagnostics.push({
      message: `choiceCount=${settings.choiceCount} 超过舞种数量 ${styles.length}，每题只能出 ${styles.length} 个选项`,
    })
    settings.choiceCount = styles.length
  }

  return { config: { settings, styles, clips }, diagnostics }
}

export async function loadConfig(): Promise<LoadedConfig> {
  const url = new URL('clips.json', assetsDir())
  let response: Response
  try {
    response = await fetch(url, { cache: 'no-store' })
  } catch (cause) {
    throw new ConfigError(`读不到 ${url.href}（${String(cause)}）`)
  }
  if (!response.ok) throw new ConfigError(`读不到 ${url.href}：HTTP ${response.status}`)

  const text = await response.text()
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (cause) {
    throw new ConfigError(`${url.href} 不是合法 JSON：${String(cause)}`)
  }
  return parseConfig(raw)
}

export interface AvailabilityReport {
  /** 确实存在的视频文件 */
  available: ClipDef[]
  /** 确定不存在的视频文件（404 / 0 字节 / 被当成 SPA 首页返回了 HTML） */
  missing: ClipDef[]
}

/**
 * 逐个 HEAD 探测视频是否存在。探测本身失败（离线、不支持 HEAD）时保守放行，
 * 只有在**确定**不存在时才标记缺失。
 */
export async function checkAvailability(clips: readonly ClipDef[]): Promise<AvailabilityReport> {
  const results = await Promise.all(
    clips.map(async (clip) => {
      try {
        const response = await fetch(assetUrl(clip.file), { method: 'HEAD', cache: 'no-store' })
        const type = response.headers.get('content-type') ?? ''
        const length = Number(response.headers.get('content-length') ?? '1')
        return { clip, missing: response.status === 404 || length === 0 || type.startsWith('text/html') }
      } catch {
        return { clip, missing: false }
      }
    }),
  )
  return {
    available: results.filter((r) => !r.missing).map((r) => r.clip),
    missing: results.filter((r) => r.missing).map((r) => r.clip),
  }
}
