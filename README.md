# NOVA 百团 · 猜舞种

随机截一段 15–20 秒的舞蹈视频，让新人猜是什么舞种。
Bun + Vite + React + TS，无后端。素材来自三选一：自带 assets、本机文件夹、或局域网里另一台机器的 HTTP 服务。

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

### 启动时用哪个来源

按这个顺序，谁先命中用谁：

1. **已经指定过文件夹** → 用文件夹。**不会**自动改走网络。
2. 上次连过服务器、地址还记得 → 自动重连。（只读一次 `clips.json` + 一轮 HEAD 探测）
3. 上次明确选过「用本页素材」→ 用本页的 `assets/`。
4. 以上都没有（第一次打开，或者上次那个文件夹已经没了）→ **弹一次框问**，
   默认走服务器 GET；选一次就记住了，之后不再问。

第 4 步那个框里，如果本页就是素材服务器发出来的，它直接说「就用本页的素材」；
否则给一个地址输入框，默认填当前页面的地址，改成素材服务器那条就行。
在设置页里随时能改（换文件夹、连服务器、断开）。

## 第三种：从另一台机器取（局域网服务器）

视频太大不想拷来拷去时用这个：一台机器开服务，其它机器填地址就能取。
**视频是边播边取（HTTP Range）的**，不预下载、不往本机存整份文件。

### 在哪起

在**装着视频和 clips.json 的那个目录**里起。

```bash
# 只发素材：视频在 public/assets
bun run serve                              # 默认 public/assets，端口 8888
bun run serve -- --dir ~/视频 --port 9000

# 连网页一起发（推荐，iPad 只要记一个地址）
bun run build && bun run serve -- --dir dist
```

它会打印「同网段」地址，形如 `http://10.26.8.243:8888/`，在另一台机器的设置页里填这个
（端口不能省；只填 `10.26.8.243` 会当 80 端口）。

**只要是同一个局域网就行**，不需要公网、不需要域名、不需要 https。同网段也没问题。
不行的只有这几种：

- macOS 防火墙拦了（第一次会弹窗，选允许；开了「阻止所有传入连接」就一直转圈）。
- Wi-Fi 开了**客户端隔离 / AP 隔离**（访客网络常见），设备之间互相看不到。
- 走了不同的网段且路由不放行（比如一个连 5G 一个连 2.4G 的访客 SSID）。
- 电脑上开着 VPN / Clash 之类的全局代理，把局域网请求也代理走了。

排查就一句：在 iPad 的 Safari 里直接开那个地址，能看到目录列表或页面就通了。

`--dir dist` 那种起法会把网页和 `assets/` 一起发出去，所以 iPad 直接用 Safari 打开
`http://192.168.1.5:8888/` 就能玩，走「自带素材」模式，什么都不用配。

两种目录布局都认，`clips.json` 放哪，视频就相对哪解析：

| `--dir` 指向 | `clips.json` 位置 | 视频 URL |
| --- | --- | --- |
| `public/assets`（或任何只放素材的目录） | `<服务根>/clips.json` | `<服务根>/a.mp4` |
| `dist`（打包产物） | `<服务根>/assets/clips.json` | `<服务根>/assets/a.mp4` |

### 能不能靠多线程提速

不能，这个方向没用。发静态文件是 I/O 密集型，Bun 本来就在单线程里异步处理并发的
传输，瓶颈是磁盘读取和网线带宽，不是 CPU 核数。加线程不会让千兆网多出一条千兆。

真正影响体感的是另外三件事，按收益排序：

1. **服务器要支持 Range**。抽到第 37 秒时，浏览器要能从那个位置附近直接取；
   不支持就会每题都从字节 0 重来。`bun run serve` 支持（`Bun.serve` 自带），
   **`python -m http.server` 不支持** —— 它会退化成「拖到哪都得从头下」。
2. **视频要 faststart**（`moov` 原子前置）。否则浏览器得先把整份文件扫一遍才知道时长。
   `bun run transcode` 已经带 `-movflags +faststart`。
3. 视频本身小一点（降分辨率 / CRF），比什么服务器调优都管用。

### 缓存策略

交给浏览器，行为跟 YouTube 类似：媒体元素自己缓冲当前播放位置附近，HTTP 缓存按
`Last-Modified` 做条件请求。应用自己**不存**视频 —— IndexedDB 里只有「上次选的文件夹」的句柄。
（早先的版本会把整份视频下到 IndexedDB，那个 store 已经在升级时删掉了，空间会还回来。）

### 注意

- 对方要发 `Access-Control-Allow-Origin`，否则页面的「文件在不在」检查会被跨域拦掉
  （播放本身不受影响，`<video src>` 直连不看 CORS）。`bun run serve` 已经带上这个头。
- 如果网页是 `https://` 打开的，就不能连 `http://` 的视频服务器（浏览器当混合内容拦掉）。
  把网页也用 `http://` 打开。

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

内置舞种：`hiphop` `jazz` `breaking` `popping` `locking` `waacking` `house`。
每条可以带 `nameZh`（中文名），默认**不显示** —— 中文名有时会直接暗示动作形式
（「甩手舞」「锁舞」），新人还没看就能猜出来。设置里「选项里显示中文名」可以打开。

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
| `bun run serve` | 把某个目录用 HTTP 暴露出去（支持 Range），给别的机器取 |
| `bun run demo` | 生成占位视频；`--keep` 不动 clips.json，`--force` 强行覆盖 |
| `bun run lint` | oxlint |

## 结构

```
scripts/
  demo-clips.ts         # 占位视频生成器
  serve-videos.ts       # 局域网素材服务器（带 CORS）
  transcode-videos.ts   # 批量转码（H.264 + faststart，不切片）
src/game/
  styles.ts             # 内置 7 个舞种 + 文件名识别规则
  config.ts             # clips.json 读取与校验（纯函数，可单测）
  local.ts              # 选文件夹 / 遍历视频 / IndexedDB 存句柄
  remote.ts             # 连另一台机器的素材服务器（视频直接 GET，不预下载）
  idb.ts                # IndexedDB 打开与事务（只存文件夹句柄）
  store.ts              # localStorage 里的玩法参数与舞种配置
  source.ts             # 统一成可播放的 clip（HTTP URL 或 blob URL）
  quiz.ts               # 先抽舞种再抽视频、抽片段、组题（纯函数）
  useQuiz.ts            # 答题状态机
src/components/         # 首页 / 设置 / 答题 / 结算 / 播放器 / 选项
src/ui/supernova/       # 从 NOVA-ledger 搬来的 logo 组件（悬停随机播 NOVA 音频）
```

## 已知限制

- 「选文件夹」用 File System Access API，Chrome / Edge / Safari 支持；Firefox 会自动退化成选文件，
  刷新后需要重选（舞种配置会留着，重选同样的文件即可对上）。
- 浏览器不会给「用 input 选的文件」持久权限，所以刷新后要重选一次文件夹。用「选择文件夹」按钮就没有这个问题。
- 服务器模式靠 HTTP Range 边播边取，对方必须支持 Range（`bun run serve` 支持，`python -m http.server` 不支持）；
  且要求对方发 `Access-Control-Allow-Origin`，否则连「文件在不在」的检查都做不了（播放本身仍可用）。
- `https` 页面不能连 `http` 视频服务（混合内容），这种情况把网页也用 `http` 打开。
- HEVC(H.265) 视频在部分浏览器放不出来，用 `bun run transcode` 转成 H.264。
