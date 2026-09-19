/**
 * 浏览器里存一份「上次怎么配的」：玩法参数、哪些视频配了哪个舞种、启用了哪些舞种。
 * 文件夹句柄本身由 local.ts 存进 IndexedDB，这里只存轻量配置。
 */

import type { Settings } from './config.ts'

export interface PersistedState {
  version: 1
  /** 上次用的视频来源 */
  source: 'builtin' | 'folder'
  /** 用户改过的玩法参数（缺的项用默认值） */
  settings: Partial<Settings>
  /** 被关掉的舞种 id */
  disabledStyles: string[]
  /** 视频路径 → 舞种 id */
  assignments: Record<string, string>
  /** 舞种名是否附带中文 */
  showChinese: boolean
}

const KEY = 'nova100:v1'

export function defaultPersisted(): PersistedState {
  return { version: 1, source: 'builtin', settings: {}, disabledStyles: [], assignments: {}, showChinese: false }
}

export function loadPersisted(): PersistedState {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return defaultPersisted()
    const parsed = JSON.parse(raw) as Partial<PersistedState>
    return {
      version: 1,
      source: parsed.source === 'folder' ? 'folder' : 'builtin',
      settings: typeof parsed.settings === 'object' && parsed.settings !== null ? parsed.settings : {},
      disabledStyles: Array.isArray(parsed.disabledStyles) ? parsed.disabledStyles.filter((id) => typeof id === 'string') : [],
      showChinese: parsed.showChinese === true,
      assignments:
        typeof parsed.assignments === 'object' && parsed.assignments !== null
          ? Object.fromEntries(Object.entries(parsed.assignments).filter(([, value]) => typeof value === 'string'))
          : {},
    }
  } catch {
    return defaultPersisted()
  }
}

export function savePersisted(state: PersistedState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    /* 隐私模式 / 配额满：不影响当场使用 */
  }
}
