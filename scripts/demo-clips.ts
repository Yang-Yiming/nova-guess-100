/**
 * 生成本地联调用的占位视频（没有真实素材时验证整条链路：抽片段 → 答题 → 揭晓 → 结算）。
 *
 *   bun run demo              # 生成 public/assets/demo-*.mp4，并写好 demo 用的 clips.json
 *   bun run demo -- --keep    # 只生成视频，不动 clips.json
 *   bun run demo -- --force   # clips.json 里已有真实配置时也强行覆盖成 demo 配置
 *
 * 需要系统里有 ffmpeg。真实素材就绪后删掉 demo-*.mp4 并恢复自己的 clips.json 即可。
 */
const ASSETS = 'public/assets'
const CONFIG = `${ASSETS}/clips.json`

/** [文件名, 宽, 高, 时长秒, 音高] —— 有横有竖有长有短，顺便覆盖边界情况 */
const CLIPS: Array<[string, number, number, number, number]> = [
  ['demo-hiphop-01', 640, 360, 25, 440],
  ['demo-hiphop-02', 360, 640, 40, 460],
  ['demo-jazz-01', 640, 360, 32, 480],
  ['demo-breaking-01', 640, 360, 28, 500],
  ['demo-popping-01', 360, 640, 45, 520],
  ['demo-locking-01', 640, 360, 22, 540],
  ['demo-waacking-01', 640, 360, 30, 560],
  ['demo-house-01', 640, 360, 26, 580],
]

const DEMO_CONFIG = {
  settings: { minSegment: 15, maxSegment: 20, trimEdge: 2, choiceCount: 4, questionsPerRound: 4 },
  styles: [
    { id: 'hiphop', name: 'Hip-hop 嘻哈', note: '律动（bounce）是根，重拍踩得死死的。' },
    { id: 'jazz', name: 'Jazz 爵士', note: '线条长、延伸多、爆发力强，讲究表情和态度。' },
    { id: 'breaking', name: 'Breaking 霹雳舞', note: 'Toprock / Footwork / Freeze / Powermove 四大块。' },
    { id: 'popping', name: 'Popping 震感舞', note: '肌肉瞬间收紧放松，做出一顿一顿的质感。' },
    { id: 'locking', name: 'Locking 锁舞', note: '动作做到一半突然锁住定格，最开心的舞种之一。' },
    { id: 'waacking', name: 'Waacking 甩手舞', note: '手臂快速甩、Pose 要狠，表达态度和情绪。' },
    { id: 'house', name: 'House 浩室', note: '脚步碎、快、流畅，上身放松，像一直在往前跑。' },
  ],
  clips: [
    { file: 'demo-hiphop-01.mp4', style: 'hiphop' },
    { file: 'demo-hiphop-02.mp4', style: 'hiphop' },
    { file: 'demo-jazz-01.mp4', style: 'jazz' },
    { file: 'demo-breaking-01.mp4', style: 'breaking' },
    { file: 'demo-popping-01.mp4', style: 'popping' },
    { file: 'demo-locking-01.mp4', style: 'locking' },
    { file: 'demo-waacking-01.mp4', style: 'waacking' },
    { file: 'demo-house-01.mp4', style: 'house' },
  ],
}

const keepConfig = process.argv.includes('--keep')
const force = process.argv.includes('--force')

if (!keepConfig && !force) {
  // 别把已经配好的真实 clips.json 覆盖掉
  const existing = Bun.file(CONFIG)
  if (await existing.exists()) {
    const parsed: unknown = await existing.json().catch(() => null)
    const clips = (parsed as { clips?: unknown } | null)?.clips
    if (Array.isArray(clips) && clips.length > 0) {
      console.error(`${CONFIG} 里已经有 ${clips.length} 条视频配置了。`)
      console.error('不想被覆盖就加 --keep（只生成视频）；确定要换成 demo 配置就加 --force。')
      process.exit(1)
    }
  }
}

for (const [name, width, height, duration, frequency] of CLIPS) {
  const target = `${ASSETS}/${name}.mp4`
  const ffmpeg = Bun.spawn(
    [
      'ffmpeg', '-loglevel', 'error', '-y',
      '-f', 'lavfi', '-i', `testsrc2=size=${width}x${height}:duration=${duration}:rate=24`,
      '-f', 'lavfi', '-i', `sine=frequency=${frequency}:duration=${duration}`,
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'veryfast',
      '-c:a', 'aac', '-shortest', '-movflags', '+faststart',
      target,
    ],
    { stdout: 'inherit', stderr: 'inherit' },
  )
  const code = await ffmpeg.exited
  if (code !== 0) throw new Error(`ffmpeg 失败（退出码 ${code}），生成 ${target} 时出错`)
  console.log(`生成 ${target}  ${width}x${height} ${duration}s`)
}

if (keepConfig) {
  console.log('\n--keep：没有改 clips.json，记得自己把 demo-*.mp4 登记进去')
} else {
  await Bun.write(CONFIG, `${JSON.stringify(DEMO_CONFIG, null, 2)}\n`)
  console.log(`\n已写入 ${CONFIG}（demo 配置，4 题一局）`)
  console.log('真实素材就绪后：删掉 demo-*.mp4，把自己的视频放进 public/assets/ 并更新 clips.json')
}
