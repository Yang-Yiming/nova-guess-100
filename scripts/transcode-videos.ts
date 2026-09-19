/**
 * 把视频统一转成 H.264 + AAC 的 mp4（不切片，保持完整时长，只做转码）。
 *
 * 为什么需要：很多手机/相机默认录 HEVC(H.265)。Safari 能放，但 Windows 的
 * Firefox 和老一点的 Chrome 放不了，现场会有人看到黑屏。转成 H.264 就通吃了。
 * 另外原片常常把 moov 放在文件末尾，转码时加 `+faststart` 把它挪到前面，拖动进度条才跟得上。
 *
 *   bun run transcode                          # 转 ./raw 里的视频到 ./public/assets
 *   bun run transcode -- --in 我的素材 --out 输出
 *   bun run transcode -- --crf 18 --max-height 1440 --fps keep
 *
 * 参数：
 *   --in <dir>          源目录，默认 ./raw
 *   --out <dir>         输出目录，默认 ./public/assets
 *   --crf <n>           画质（越小越好），默认 20；18 接近视觉无损，22 更小
 *   --max-height <n>    限制高度，默认 1080；传 0 表示保持原分辨率
 *   --fps <n|keep>      帧率，默认 keep（保持原帧率）
 *   --preset <name>     编码预设，默认 slow（更慢但同画质更小）
 *   --keep              已存在的输出文件跳过（默认覆盖）
 *
 * 转完记得在 clips.json 或设置页里给新文件指定舞种。
 */
import { mkdirSync, readdirSync, statSync } from 'node:fs'
import { basename, extname, join, resolve } from 'node:path'

const VIDEO_EXT = new Set(['.mp4', '.mov', '.m4v', '.mkv', '.avi', '.webm', '.wmv', '.flv', '.mpg', '.mpeg', '.ts', '.3gp'])

function arg(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`)
  const value = index >= 0 ? process.argv[index + 1] : undefined
  return value && !value.startsWith('--') ? value : fallback
}

const inDir = resolve(arg('in', 'raw'))
const outDir = resolve(arg('out', 'public/assets'))
const crf = arg('crf', '20')
const maxHeight = Number(arg('max-height', '1080'))
const fps = arg('fps', 'keep')
const preset = arg('preset', 'slow')
const skipExisting = process.argv.includes('--keep')

if (!statSync(inDir, { throwIfNoEntry: false })?.isDirectory()) {
  console.error(`源目录不存在：${inDir}`)
  console.error('把要转的视频放进这个目录，或者用 --in 指定别的位置。')
  process.exit(1)
}

const files = readdirSync(inDir).filter((name) => VIDEO_EXT.has(extname(name).toLowerCase()))
if (files.length === 0) {
  console.error(`${inDir} 里没有找到视频文件`)
  process.exit(1)
}

mkdirSync(outDir, { recursive: true })
console.log(`源：${inDir}\n输出：${outDir}\n共 ${files.length} 个文件\n`)

const filters = [`scale=-2:'min(${maxHeight === 0 ? 'ih' : maxHeight},ih)'`]
if (fps !== 'keep') filters.push(`fps=${fps}`)

let failed = 0
for (const [index, name] of files.entries()) {
  const target = join(outDir, `${basename(name, extname(name))}.mp4`)
  const label = `[${index + 1}/${files.length}] ${name}`

  if (skipExisting && statSync(target, { throwIfNoEntry: false })) {
    console.log(`${label} → 已存在，跳过`)
    continue
  }

  const before = statSync(join(inDir, name)).size
  const proc = Bun.spawn(
    [
      'ffmpeg', '-hide_banner', '-loglevel', 'error', '-y',
      '-i', join(inDir, name),
      '-vf', filters.join(','),
      // 关键帧每 2 秒一个，网页里随机 seek 到任意位置才快（该视频主要就是被 seek 着看）
      '-c:v', 'libx264', '-profile:v', 'high', '-pix_fmt', 'yuv420p',
      '-crf', crf, '-preset', preset, '-g', '48', '-keyint_min', '24',
      '-c:a', 'aac', '-b:a', '128k',
      // 把 moov 挪到文件开头，边下边播 / 拖动不用等
      '-movflags', '+faststart',
      target,
    ],
    { stdout: 'inherit', stderr: 'inherit' },
  )

  const code = await proc.exited
  if (code !== 0) {
    failed += 1
    console.error(`${label} → 失败（ffmpeg 退出码 ${code}）`)
    continue
  }

  const after = statSync(target).size
  console.log(`${label} → ${(after / 1024 / 1024).toFixed(1)} MB（原 ${(before / 1024 / 1024).toFixed(1)} MB）`)
}

console.log(`\n完成。失败 ${failed} 个。`)
if (failed === 0) {
  console.log('下一步：在设置页给这些文件指定舞种（文件名带 jazz / house 之类的会自动认出来）。')
}
if (failed > 0) process.exit(1)
