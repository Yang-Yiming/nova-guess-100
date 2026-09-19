/**
 * 本地视频文件夹：让负责人直接选自己电脑上的文件夹，视频不经过任何服务器。
 *
 * 两条路：
 * - Chromium 系：`showDirectoryPicker()`，句柄存进 IndexedDB，下次打开免重选（只需重新授权）。
 * - 其它浏览器（以及 file:// 直接双击打开的情况）：`<input type="file" webkitdirectory>`，
 *   拿不到持久句柄，每次打开要重选一次。
 */

import { STYLE_ALIASES, type StyleDef } from './styles.ts'

const VIDEO_RE = /\.(mp4|m4v|mov|webm|mkv|ogv|ogg)$/i

/** 只描述我们真正用到的那几个方法，避免和 lib.dom 里的同名类型打架。 */
interface DirHandle {
  kind: 'directory'
  name: string
  values(): AsyncIterableIterator<DirHandle | FileHandle>
  getFileHandle(name: string): Promise<FileHandle>
  queryPermission?(descriptor: { mode: 'read' }): Promise<PermissionState>
  requestPermission?(descriptor: { mode: 'read' }): Promise<PermissionState>
}

interface FileHandle {
  kind: 'file'
  name: string
  getFile(): Promise<File>
}

export interface LocalVideo {
  /** 相对所选文件夹的路径，作为唯一 key */
  path: string
  name: string
  file: File
}

export interface PickedFolder {
  name: string
  videos: LocalVideo[]
  /** 文件夹里如果有 clips.json，就把内容带出来（可能为 null） */
  config: unknown | null
}

export type FolderRestore =
  | { status: 'ok'; name: string; videos: LocalVideo[] }
  | { status: 'needs-permission'; name: string }
  | { status: 'none' }

function fsWindow(): { showDirectoryPicker?: (options?: unknown) => Promise<unknown> } {
  return window as unknown as { showDirectoryPicker?: (options?: unknown) => Promise<unknown> }
}

export function canPickFolder(): boolean {
  return typeof fsWindow().showDirectoryPicker === 'function'
}

export function isFileProtocol(): boolean {
  return location.protocol === 'file:'
}

async function ensurePermission(handle: DirHandle, request: boolean): Promise<boolean> {
  if (!handle.queryPermission) return true
  try {
    if ((await handle.queryPermission({ mode: 'read' })) === 'granted') return true
    if (!request || !handle.requestPermission) return false
    return (await handle.requestPermission({ mode: 'read' })) === 'granted'
  } catch {
    // file:// 是 opaque origin，权限 API 可能直接抛异常
    return false
  }
}

async function walk(dir: DirHandle, prefix: string, out: LocalVideo[]): Promise<void> {
  for await (const entry of dir.values()) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.kind === 'file') {
      if (VIDEO_RE.test(entry.name)) out.push({ path, name: entry.name, file: await entry.getFile() })
    } else {
      await walk(entry, path, out)
    }
  }
}

async function readVideos(dir: DirHandle): Promise<LocalVideo[]> {
  const videos: LocalVideo[] = []
  await walk(dir, '', videos)
  return videos.sort((a, b) => a.path.localeCompare(b.path))
}

async function readConfig(dir: DirHandle): Promise<unknown | null> {
  try {
    const file = await (await dir.getFileHandle('clips.json')).getFile()
    return JSON.parse(await file.text()) as unknown
  } catch {
    return null
  }
}

// ---- 文件夹句柄的持久化（IndexedDB） ----

const DB_NAME = 'nova100'
const STORE = 'handles'
const HANDLE_KEY = 'video-folder'

function openDb(): Promise<IDBDatabase> {
  const { promise, resolve, reject } = Promise.withResolvers<IDBDatabase>()
  const request = indexedDB.open(DB_NAME, 1)
  request.onupgradeneeded = () => request.result.createObjectStore(STORE)
  request.onsuccess = () => resolve(request.result)
  request.onerror = () => reject(request.error ?? new Error('indexedDB 打不开'))
  return promise
}

async function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb()
  try {
    const { promise, resolve, reject } = Promise.withResolvers<T>()
    const request = run(db.transaction(STORE, mode).objectStore(STORE))
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('indexedDB 操作失败'))
    return await promise
  } finally {
    db.close()
  }
}

async function saveHandle(handle: DirHandle): Promise<void> {
  try {
    await withStore('readwrite', (store) => store.put(handle, HANDLE_KEY))
  } catch {
    /* 存不下就算了，下次重选 */
  }
}

async function loadHandle(): Promise<DirHandle | null> {
  try {
    return ((await withStore('readonly', (store) => store.get(HANDLE_KEY) as IDBRequest<DirHandle | undefined>)) ?? null)
  } catch {
    return null
  }
}

export async function forgetFolder(): Promise<void> {
  try {
    await withStore('readwrite', (store) => store.delete(HANDLE_KEY))
  } catch {
    /* 忽略 */
  }
}

// ---- 对外 ----

/** 弹出文件夹选择器。用户取消时返回 null。 */
export async function pickFolder(): Promise<PickedFolder | null> {
  const picker = fsWindow().showDirectoryPicker
  if (!picker) throw new Error('这个浏览器不支持直接选文件夹，请改用「选择视频文件」')
  const handle = (await picker({ id: 'nova100-videos', mode: 'read' })) as unknown as DirHandle
  if (!(await ensurePermission(handle, true))) throw new Error('没有拿到文件夹的读取权限')
  await saveHandle(handle)
  return { name: handle.name, videos: await readVideos(handle), config: await readConfig(handle) }
}

/** 启动时尝试恢复上次的文件夹；没授权就只报个名字，等用户点一下再要权限。 */
export async function restoreFolder(): Promise<FolderRestore> {
  const handle = await loadHandle()
  if (!handle) return { status: 'none' }
  if (await ensurePermission(handle, false)) {
    return { status: 'ok', name: handle.name, videos: await readVideos(handle) }
  }
  return { status: 'needs-permission', name: handle.name }
}

/** 用户点「继续使用上次的文件夹」时调用（必须在用户手势里）。 */
export async function reconnectFolder(): Promise<PickedFolder | null> {
  const handle = await loadHandle()
  if (!handle) return null
  if (!(await ensurePermission(handle, true))) throw new Error('没有拿到文件夹的读取权限')
  return { name: handle.name, videos: await readVideos(handle), config: await readConfig(handle) }
}

/** `<input type="file" webkitdirectory>` 或拖拽：只拿得到 File，拿不到持久句柄。 */
export function videosFromFiles(files: readonly File[]): { name: string; videos: LocalVideo[] } | null {
  const videos: LocalVideo[] = []
  for (const file of files) {
    const relative = (file as File & { webkitRelativePath?: string }).webkitRelativePath
    const path = relative && relative.length > 0 ? relative : file.name
    if (VIDEO_RE.test(file.name)) videos.push({ path, name: file.name, file })
  }
  if (videos.length === 0) return null
  videos.sort((a, b) => a.path.localeCompare(b.path))

  // 目录选择：路径形如 "我的视频/jazz1.mp4"，取第一段当文件夹名。
  // 单文件选择：webkitRelativePath 是空串，路径就是文件名，没有文件夹可报。
  const roots = new Set(videos.map((video) => (video.path.includes('/') ? video.path.split('/')[0] : '')))
  const root = roots.size === 1 ? [...roots][0] : ''
  return { name: root.length > 0 ? root : `${videos.length} 个文件`, videos }
}

/** 按文件名猜舞种，猜不出返回 undefined。 */
export function guessStyle(path: string, styles: readonly StyleDef[]): string | undefined {
  const haystack = path.toLowerCase()
  for (const style of styles) {
    const aliases = STYLE_ALIASES[style.id]
    if (aliases?.some((alias) => haystack.includes(alias))) return style.id
  }
  return undefined
}
