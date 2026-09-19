/**
 * 舞种定义 + 内置的 7 个舞种。
 *
 * 这里的 `DEFAULT_STYLES` 是**代码里的兜底**：`clips.json` 不写 `styles` 时就用它。
 * 本地文件夹模式下没有 clips.json 也能直接出题，靠的就是这份。
 */

export interface StyleDef {
  /** 唯一 id，clip.style 引用它 */
  id: string
  /** 英文显示名，例如 "Hip-hop" */
  name: string
  /**
   * 中文名，例如 "嘻哈"。默认不显示 —— 中文名有时会直接暗示动作形式
   * （比如「甩手舞」），新人还没看就能猜出来。设置里可以打开。
   */
  nameZh?: string
  /** 揭晓答案时给新人看的一句话科普 */
  note?: string
}

/** 题目/选项上显示的舞种名。开着中文就拼在英文后面。 */
export function displayName(style: StyleDef, showChinese: boolean): string {
  return showChinese && style.nameZh ? `${style.name} ${style.nameZh}` : style.name
}

export const DEFAULT_STYLES: readonly StyleDef[] = [
  {
    id: 'hiphop',
    name: 'Hip-hop',
    nameZh: '嘻哈',
    note: '从纽约布朗克斯的街头派对长出来的一整套文化，重拍踩得死死的，律动（bounce）是根。',
  },
  {
    id: 'jazz',
    name: 'Jazz',
    nameZh: '爵士',
    note: '线条长、延伸多、爆发力强，底子是爵士乐和百老汇舞台，特别讲究表情和态度。',
  },
  {
    id: 'breaking',
    name: 'Breaking',
    nameZh: '霹雳舞',
    note: '分 Toprock、Footwork、Freeze、Powermove 四块，跳的人叫 B-Boy / B-Girl。2024 巴黎奥运会它是正式项目。',
  },
  {
    id: 'popping',
    name: 'Popping',
    nameZh: '震感舞',
    note: '靠肌肉瞬间收紧再放松做出一顿一顿的质感，常配 Funk 音乐；「机器人」只是它的一种玩法。',
  },
  {
    id: 'locking',
    name: 'Locking',
    nameZh: '锁舞',
    note: '动作做到一半突然「锁」住定格，配着指、拍手、转手腕，是看着最开心的舞种之一。',
  },
  {
    id: 'waacking',
    name: 'Waacking',
    nameZh: '甩手舞',
    note: '70 年代洛杉矶 Disco 地下长出来的，手臂快速甩、Pose 要狠，本来就是表达态度和情绪的舞。',
  },
  {
    id: 'house',
    name: 'House',
    nameZh: '浩室',
    note: '跟着 4/4 拍的 House 音乐走，脚步碎、快、流畅，上身放松，跳起来像一直在往前跑。',
  },
]

/** 文件名里出现这些词就猜成对应舞种（小写匹配，见 local.ts）。 */
export const STYLE_ALIASES: Record<string, readonly string[]> = {
  hiphop: ['hiphop', 'hip-hop', 'hip_hop', '嘻哈', '黑怕', 'hippop'],
  jazz: ['jazz', '爵士', 'jazzfunk', 'jazz-funk'],
  breaking: ['breaking', 'breakin', 'b-boy', 'bboy', 'bgirl', '霹雳', '地板'],
  popping: ['popping', 'pop', '震感', '机械', 'poppin'],
  locking: ['locking', 'lock', '锁舞', 'lockin'],
  waacking: ['waacking', 'whacking', '甩手', 'waack'],
  house: ['house', '浩室', 'flowing'],
}
