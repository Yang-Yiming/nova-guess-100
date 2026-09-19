# NOVA 百团 · 猜舞种

随机截一段 15–20 秒的舞蹈视频，让新人猜是什么舞种。
Bun + Vite + React + TS，无后端，**视频不出本机**。

## 给负责人（发到群里那一份）

1. 下载并解压 `nova-猜舞种-便携版.zip`
2. **双击 `index.html`** —— 会直接用浏览器打开，不需要装任何东西
3. 点「选择文件夹」，选中你放舞蹈视频的文件夹
4. 检查一下每个视频的舞种（文件名带 `jazz` / `house` 这类词的会自动认出来）
5. 返回，点「开始挑战」

浏览器会记住你选的文件夹，下次打开不用重选（Chrome / Edge 会问一句是否允许继续使用）。
**注意**：换个浏览器、换台电脑，或者用无痕窗口，都要重选一次。

## 给开发者

```bash
bun install
bun run dev              # 开发
bun run demo             # 生成 8 段占位视频联调（需要 ffmpeg）
bun run build:portable   # 产出 dist-portable/，就是发给负责人的那份
```

`bun run build:portable` 会把整个应用（JS + CSS）打包进**一个** `index.html`，
并且用的是非 module 的 classic script —— 因为 `file://` 下浏览器会以 CORS 为由
拒绝执行 `<script type="module">`，双击打开就是白屏。

## 两种素材来源

| | 自带素材 | 本地文件夹 |
| --- | --- | --- |
| 怎么用 | 视频放 `public/assets/`，写 `clips.json` | 网页里选文件夹 |
| 视频进 git 吗 | 会（注意体积） | 不会 |
| 适合 | 部署到网上的固定版本 | 打包发群、现场没网 |

便携版固定走「本地文件夹」。要部署到网上的话，用 `bun run build`，视频仍然放 `public/assets/`。

**视频体积提醒**：Cloudflare Pages 单文件上限 25 MiB，GitHub Pages 是 100 MiB。
手机拍的 4K 视频轻松超过，所以要么用便携版（本地读，无上限），要么先把视频转小。
Git LFS 也救不了 —— Pages 发布的是 checkout 出来的指针文件，不是真视频。

`bun run transcode` 可以把视频统一转成 H.264（兼容性最好）并加 `faststart`：

```bash
bun run transcode -- --in raw --out public/assets --crf 20 --max-height 1080
```

## clips.json（自带素材模式）

`public/assets/clips.json` 只在「自带素材」模式下用到。`styles` 不写就用代码里内置的 7 个舞种（见 `src/game/styles.ts`）。

```jsonc
{
  "settings": { "minSegment": 15, "maxSegment": 20, "trimEdge": 2, "choiceCount": 4, "questionsPerRound": 8 },
  "clips": [
    { "file": "hiphop/01.mp4", "style": "hiphop", "title": "谁跳的，可省" }
  ]
}
```

内置舞种：`hiphop` `jazz` `breaking` `popping` `locking` `waacking` `house`

## 现场怎么玩

出题顺序是 **先等概率抽舞种 → 再在该舞种里抽视频 → 最后抽片段**。
所以每个舞种被问到的机会只跟「有几个舞种」有关，跟某个舞种拍了几支视频无关
—— 某个舞种交上来 10 支视频，也不会因此被反复问到。
没有配视频的舞种不会成为答案，也不会出现在选项里。

- 一局 8 题，视频和片段都是随机的，很难背答案。
- 键盘 **1–4** 选、**Enter** 下一题。
- 片段播完自动停；揭晓后循环播放那段，方便讲解。
- 视频带声音；浏览器挡自动播放时会出现「点击播放」。

## 命令

| 命令 | 作用 |
| --- | --- |
| `bun run dev` | 开发服务器，`--host` 已开 |
| `bun run build:portable` | 单文件便携版 → `dist-portable/` |
| `bun run build` | 常规静态站点 → `dist/` |
| `bun run transcode` | 批量转成 H.264 + faststart |
| `bun run demo` | 生成占位视频；`--keep` 不动 clips.json，`--force` 强行覆盖 |
| `bun run lint` | oxlint |

## 结构

```
scripts/
  demo-clips.ts         # 占位视频生成器
  transcode-videos.ts   # 批量转码（H.264 + faststart，不切片）
src/game/
  styles.ts             # 内置 7 个舞种 + 文件名识别规则
  config.ts             # clips.json 读取与校验（纯函数，可单测）
  local.ts              # 选文件夹 / 遍历视频 / IndexedDB 存句柄
  store.ts              # localStorage 里的玩法参数与舞种配置
  source.ts             # 统一成可播放的 clip（assets URL 或 blob URL）
  quiz.ts               # 先抽舞种再抽视频、抽片段、组题（纯函数）
  useQuiz.ts            # 答题状态机
src/components/         # 首页 / 设置 / 答题 / 结算 / 播放器 / 选项
src/ui/supernova/       # 从 NOVA-ledger 搬来的 logo 组件（悬停随机播 NOVA 音频）
```

## 已知限制

- 「选文件夹」用 File System Access API，Chrome / Edge / Safari 支持；Firefox 会自动退化成选文件，
  刷新后需要重选（舞种配置会留着，重选同样的文件即可对上）。
- 浏览器不会给「用 input 选的文件」持久权限，所以刷新后要重选一次文件夹。用「选择文件夹」按钮就没有这个问题。
- HEVC(H.265) 视频在部分浏览器放不出来，用 `bun run transcode` 转成 H.264。
