/**
 * 从另一台机器取视频：填个地址（`192.168.1.5:8888` 这种），视频**直接从对方的 HTTP 服务上现场取**。
 *
 * 为什么不预下载整份文件：几百 MB 要先等几分钟；而局域网带宽远大于单个视频的码率
 * （1080p H.264 也就几 Mbit/s，千兆网随便喂），现场取的起播延迟本来就可以忽略。
 *
 * 缓存交给浏览器就行，不再往 IndexedDB 里塞整份视频：
 * - 同一次播放：媒体元素自己的缓冲区管，暂停 / 揭晓后循环重播都命中。
 * - 跨次打开：HTTP 缓存管（靠 `ETag` / `Last-Modified`），`serve-videos.ts` 已经发了。
 *
 * 真正要紧的是**对方要支持 Range**：抽到第 37 秒时浏览器要能直接从那一段附近开始取，
 * 否则只能从 0 下载整份文件。`bun run serve` 支持（`Bun.serve` 自带），
 * `python -m http.server` 不支持 —— 它会退化成「拖到哪都得从头下」。
 *
 * 注意 `<video src>` 直连**不需要对方开跨域**；只有下面那个「文件在不在」的 HEAD 检查
 * 需要。没开跨域就跳过检查，照常播放。
 */

import { checkAvailability, ConfigError, parseConfig, type Diagnostic, type LoadedConfig, type StyleDef } from './config.ts'
import { httpClips, type PlayableClip } from './source.ts'

export interface RemoteSource {
  /** 归一化后的地址，带结尾斜杠 */
  base: string
  /** url 直接指向对方服务器 */
  clips: PlayableClip[]
  styles: StyleDef[]
  diagnostics: Diagnostic[]
}

/** 用户输入 → base URL。`192.168.1.5:8888`、`http://x/videos` 都认。 */
export function normalizeBaseUrl(input: string, pageProtocol: string = location.protocol): string {
  const trimmed = input.trim()
  if (trimmed === '') throw new ConfigError('服务器地址是空的')
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `${pageProtocol === 'https:' ? 'https' : 'http'}://${trimmed}`

  let url: URL
  try {
    url = new URL(withScheme)
  } catch {
    throw new ConfigError(`地址看不懂：${trimmed}`)
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new ConfigError('服务器地址只支持 http / https')
  // https 页面去取 http 视频，浏览器会把整个请求当混合内容拦掉，先给句人话
  if (pageProtocol === 'https:' && url.protocol === 'http:') {
    throw new ConfigError(`网页是 https 打开的，浏览器不允许再去 ${url.origin} 取视频（混合内容）。把网页也用 http 打开，或者给视频服务配上 https。`)
  }
  url.search = ''
  url.hash = ''
  if (!url.pathname.endsWith('/')) url.pathname += '/'
  return url.href
}

/** base（保证以 / 结尾）+ 相对文件名 → 绝对 URL，逐段编码，保留子目录。 */
function joinUrl(base: string, file: string): string {
  const path = file
    .split('/')
    .filter((segment) => segment.length > 0)
    .map((segment) => encodeURIComponent(segment))
    .join('/')
  return base + path
}

/**
 * 找服务器时试的候选地址。写的是**机器名**不是 IP —— 这正是它比写 IP 强的地方：
 * `.local` 由 iPad 那边的 mDNS 解析成当前 IP，换网络、DHCP 续租变了地址都不用改。
 *
 * 只放自己人的机器，不是给陌生人用的默认值。查自己的名字：
 *   scutil --get LocalHostName      # 加上 :8888 就是这里要填的
 */
export const KNOWN_SERVERS: readonly string[] = ['yangyimingdeMacBook-Air.local:8888']

/**
 * 探测超时。`.local` 第一次要等一轮 mDNS 查询（几十到几百毫秒），给宽松点；
 * 连不上的话也会等满这么久 —— 反正是后台跑，不挡任何东西。
 */
const PROBE_TIMEOUT = 1500

/** 这个地址背后是不是一个能用的素材服务器。只读 `clips.json`，不碰视频。 */
export async function probeRemote(input: string): Promise<string | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT)
  try {
    const base = normalizeBaseUrl(input)
    await fetchConfig(base, controller.signal)
    return base
  } catch {
    // 连不上、不是咱们的服务器、被混合内容拦掉：都算「没找到」，不打扰用户
    return null
  } finally {
    clearTimeout(timer)
  }
}

/** 并发探一遍白名单，返回第一个命中的。 */
export async function findKnownServer(): Promise<string | null> {
  if (KNOWN_SERVERS.length === 0) return null
  const results = await Promise.all(KNOWN_SERVERS.map((candidate) => probeRemote(candidate)))
  return results.find((base) => base !== null) ?? null
}

async function fetchConfig(base: string, signal: AbortSignal): Promise<{ loaded: LoadedConfig; assetBase: string }> {
  // 两种服务布局都认：
  //   bun run serve --dir <视频目录>  → /clips.json
  //   bun run serve --dir dist        → /assets/clips.json（打包产物就是这个结构）
  const candidates = [joinUrl(base, 'clips.json'), joinUrl(base, 'assets/clips.json')]
  const failures: string[] = []
  for (const url of candidates) {
    let response: Response
    try {
      response = await fetch(url, { signal, cache: 'no-store' })
    } catch (cause) {
      if (signal.aborted) throw cause
      throw new ConfigError(`连不上 ${url}。确认这个地址在浏览器里能打开，并且对方服务允许跨域（Access-Control-Allow-Origin）。`)
    }
    if (!response.ok) {
      failures.push(`${url}：HTTP ${response.status}`)
      continue
    }
    let raw: unknown
    try {
      raw = JSON.parse(await response.text())
    } catch (cause) {
      throw new ConfigError(`${url} 不是合法 JSON：${String(cause)}`)
    }
    // clips.json 所在目录就是素材根目录，clip.file 相对它解析
    return { loaded: parseConfig(raw), assetBase: url.slice(0, url.lastIndexOf('/') + 1) }
  }
  throw new ConfigError(`没找到 clips.json。试过\n${failures.join('\n')}`)
}

export async function loadRemote(input: string, signal: AbortSignal): Promise<RemoteSource> {
  const base = normalizeBaseUrl(input)
  const { loaded, assetBase } = await fetchConfig(base, signal)
  const { config, diagnostics } = loaded
  if (config.clips.length === 0) throw new ConfigError(`${assetBase}clips.json 里没有配视频`)

  const urlFor = (file: string) => joinUrl(assetBase, file)
  // 探一遍文件在不在，好早点说「谁忘了拷」。探不到不算错，只是少了这层提醒。
  const { available, missing, probed } = await checkAvailability(config.clips, urlFor)
  signal.throwIfAborted()

  if (missing.length > 0) {
    diagnostics.push({ message: `服务器上没有 ${missing.length} 个视频（${missing.map((clip) => clip.file).join('、')}），已跳过` })
  }
  if (!probed) {
    diagnostics.push({ message: '对方没开跨域，没法检查文件是否齐全（不影响播放，视频是直接取的）' })
  }

  return { base, clips: httpClips(available, urlFor), styles: config.styles, diagnostics }
}
