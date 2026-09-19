/**
 * 现场开服务器：把某个目录用 HTTP 暴露出去，并额外把素材目录挂在 `/assets/` 下。
 *
 *   bun run serve                                    # 只发素材（默认 public/assets），端口 8888
 *   bun run serve -- --dir dist                      # 连打包好的网页一起发（iPad 只要记一个地址）
 *   bun run serve -- --dir dist --assets ~/Desktop/素材
 *   bun run serve -- --dir ~/视频 --port 9000
 *
 * `--assets`：视频不放仓库里（比如放桌面）时用它。`--dir` 里没有视频，就把素材目录
 * 挂到 `/assets/` 下 —— 正好是页面要的路径，于是一个地址同时有网页和视频。
 *
 * 为什么不能直接用 `python -m http.server`：
 * 1. 它**不支持 Range** —— 抽到第 37 秒时浏览器只能从字节 0 重新下，每题都重来一遍。
 * 2. 它不发 `Access-Control-Allow-Origin`，页面的「文件在不在」检查会被拦掉。
 * 播放本身（`<video src>` 直连）不需要跨域，但 Range 是硬需求，所以用这个脚本。
 *
 * 多线程在这里帮不上忙：发静态文件是 I/O 密集，Bun 本身就异步，瓶颈是磁盘和网线，
 * 不是 CPU。真正影响体感的是上面那条 Range —— 有它就不用反复从头下。
 */

import { networkInterfaces } from 'node:os'
import { statSync } from 'node:fs'
import { basename, extname, join, normalize, resolve } from 'node:path'

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.mkv': 'video/x-matroska',
  '.ogv': 'video/ogg',
  '.ogg': 'audio/ogg',
}

function argument(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`)
  const value = index >= 0 ? process.argv[index + 1] : undefined
  return value && !value.startsWith('--') ? value : fallback
}

const root = resolve(argument('dir', 'public/assets'))
/** 素材目录；和 root 相同时不用额外挂载。 */
const assetsRoot = resolve(argument('assets', root))
const port = Number(argument('port', '8888'))
if (!Number.isInteger(port) || port <= 0 || port > 65535) {
  console.error(`端口不对：${argument('port', '8888')}`)
  process.exit(1)
}
if (!isDirectory(root)) {
  console.error(`没有这个目录：${root}`)
  process.exit(1)
}
if (assetsRoot !== root && !isDirectory(assetsRoot)) {
  console.error(`没有这个素材目录：${assetsRoot}`)
  process.exit(1)
}

/** URL 路径 → base 内的真实路径。`../` 一律夹回 base，所以不用再单独防目录穿越。 */
function resolveInside(base: string, pathname: string): string {
  const relative = normalize(decodeURIComponent(pathname)).replace(/^[/\\]+/, '')
  return join(base, relative.startsWith('..') ? '' : relative)
}

function isFileAt(path: string): boolean {
  try {
    return statSync(path).isFile()
  } catch {
    return false
  }
}

/** 目录（含根目录）找它下面的 index.html。 */
function toFile(path: string): string | null {
  if (isFileAt(path)) return path
  const index = join(path, 'index.html')
  return isFileAt(index) ? index : null
}

/** 挂载点：`--dir` 在根，`--assets` 在 `/assets/`（两者相同就只挂一个）。 */
const mounts: Array<{ base: string; prefix: string }> =
  assetsRoot === root ? [{ base: root, prefix: '' }] : [{ base: root, prefix: '' }, { base: assetsRoot, prefix: 'assets/' }]

/** 按挂载顺序找文件；只返回确实存在的文件，找不到就是 null。 */
function locate(pathname: string): string | null {
  const path = pathname.replace(/^\/+/, '')
  for (const { base, prefix } of mounts) {
    if (prefix !== '' && !path.startsWith(prefix)) continue
    const rest = prefix === '' ? path : path.slice(prefix.length)
    const file = toFile(resolveInside(base, rest))
    if (file) return file
  }
  return null
}

/** 局域网地址，负责人照着填进设置页 / 在 iPad 上打开。 */
function lanAddresses(): string[] {
  const found: string[] = []
  for (const list of Object.values(networkInterfaces())) {
    for (const info of list ?? []) {
      if (info.family === 'IPv4' && !info.internal) found.push(info.address)
    }
  }
  return found
}

const server = Bun.serve({
  port,
  hostname: '0.0.0.0',
  async fetch(request) {
    const headers = { 'Access-Control-Allow-Origin': '*' }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('只支持 GET / HEAD', { status: 405, headers })
    }

    const pathname = new URL(request.url).pathname
    const file = locate(pathname)
    const body = file ? Bun.file(file) : null
    if (!file || !body || !(await body.exists())) return new Response('没有这个文件', { status: 404, headers })

    // Range 由 Bun 自己处理：BunFile 作为 body 时会回 206 + Content-Range
    return new Response(body, {
      headers: {
        ...headers,
        'Content-Type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream',
        // 客户端拿它判断文件有没有换过（Bun.file 默认不发这个头）
        'Last-Modified': new Date(body.lastModified).toUTCString(),
      },
    })
  },
})

const hasApp = isFileAt(join(root, 'index.html'))

console.log(`网页：    ${hasApp ? root : '（只发素材）'}`)
console.log(`素材：    ${assetsRoot}`)
console.log(`本机：    http://127.0.0.1:${server.port}/`)
for (const address of lanAddresses()) console.log(`同网段：  http://${address}:${server.port}/`)
console.log('')
if (hasApp) {
  console.log(`iPad 直接用浏览器打开上面那条「同网段」地址就能玩（${basename(root)}），不用填任何东西。`)
} else {
  console.log('把「同网段」那条填进游戏的设置页（端口不能省）。')
  console.log('想连网页一起发的话：先 bun run build，再 bun run serve -- --dir dist')
}
console.log('Ctrl-C 退出。')
