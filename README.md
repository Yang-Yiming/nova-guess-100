# NOVA 百团 · 猜舞种

随机截一段 15–20 秒的舞蹈视频，让新人猜是什么舞种。Bun + Vite + React + TS，纯静态无后端。

```bash
bun install
bun run demo        # 没素材时先生成 8 段占位视频（需要 ffmpeg）
bun run dev
```

## 放视频

1. 视频丢进 `public/assets/`（可带子目录）。
2. 在 `public/assets/clips.json` 的 `clips` 里登记：

```jsonc
{
  "settings": {
    "minSegment": 15,        // 片段最短秒数
    "maxSegment": 20,        // 片段最长秒数
    "trimEdge": 2,           // 掐掉首尾各几秒（开场白/谢幕），不够长就不掐
    "choiceCount": 4,        // 每题几个选项
    "questionsPerRound": 8   // 一局几题
  },
  "styles": [
    { "id": "hiphop", "name": "Hip-hop 嘻哈", "note": "揭晓时的一句话科普，可省" }
  ],
  "clips": [
    { "file": "hiphop/01.mp4", "style": "hiphop", "title": "谁跳的，可省" }
  ]
}
```

`clip.style` 必须是 `styles` 里的 id 之一。自带的 `styles` 已配好 7 个：

`hiphop` `jazz` `breaking` `popping` `locking` `waacking` `house`

改完 json **不用重新 build**，刷新页面即可。配错会在页面上直接指出是哪一条，不会白屏。

## 现场

- 一局 8 题，视频和片段都是随机的，很难背答案。
- 键盘 **1–4** 选、**Enter** 下一题。
- 片段播完自动停；揭晓后循环播放那段，方便讲解。
- 视频带声音；手机被挡自动播放时会出现「点击播放」。

## 命令

```bash
bun run dev      # --host 已开，手机连同一 Wi-Fi 可试
bun run build    # 产出 dist/，整个丢到任意静态服务器（base: './'）
bun run preview
bun run lint
bun run demo     # 生成占位视频；--keep 不动 clips.json，--force 强行覆盖
```

部署前记得视频放进 `public/assets/`，它会跟着进 `dist/assets/`。

## 结构

```
public/assets/          # 视频 + clips.json（视频 gitignore，json 提交）
scripts/demo-clips.ts   # 占位视频生成器
src/game/               # 配置读取校验 · 抽片段组题 · 答题状态机
src/components/         # 首页 / 答题页 / 结算页 / 播放器 / 选项
src/ui/supernova/       # 从 NOVA-ledger 搬来的 logo 组件（悬停随机播 NOVA 音频）
```
