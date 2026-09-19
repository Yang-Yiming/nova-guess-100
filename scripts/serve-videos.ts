/**
 * 现场开素材服务器：把装着视频 + clips.json 的目录用 HTTP 暴露出去。
 *
 *   bun run serve                      # 默认 public/assets，端口 8888
 *   bun run serve -- --dir dist         # 连打包好的网页一起发（iPad 只要记一个地址）
 *   bun run serve -- --dir ~/视频 --port 9000
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
import { basename, extname, join, normalize, resolve, sep } from 'node:path'

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
const port = Number(argument('port', '8888'))
if (!Number.isInteger(port) || port <= 0 || port > 65535) {
  console.error(`端口不对：${argument('port', '8888')}`)
  process.exit(1)
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
    const url = new URL(request.url)
    const relative = normalize(decodeURIComponent(url.pathname)).replace(/^[/\\]+/, '')
    const headers = { 'Access-Control-Allow-Origin': '*' }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('只支持 GET / HEAD', { status: 405, headers })
    }

    let file = join(root, relative)
    // 拦掉 ../ 逃出 root 的请求
    if (file !== root && !file.startsWith(root + sep)) return new Response('越界了', { status: 403 })

    // 目录（含根目录）给 index.html，好让 iPad 直接开一个地址
    if (isDirectory(file)) file = join(file, 'index.html')

    const body = Bun.file(file)
    if (!(await body.exists())) return new Response('没有这个文件', { status: 404, headers })

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

const hasApp = await Bun.file(join(root, 'index.html')).exists()

console.log(`目录：    ${root}`)
console.log(`本机：    http://127.0.0.1:${server.port}/`)
for (const address of lanAddresses()) console.log(`同网段：  http://${address}:${server.port}/`)
console.log('')
if (hasApp) {
  console.log(`这个目录里有 index.html（${basename(root)}），iPad 直接用浏览器打开上面那条「同网段」地址就能玩，不用填任何东西。`)
} else {
  console.log('把「同网段」那条填进游戏的设置页（端口不能省）。')
  console.log('想连网页一起发的话：先 bun run build，再 bun run serve -- --dir dist')
}
console.log('Ctrl-C 退出。')
