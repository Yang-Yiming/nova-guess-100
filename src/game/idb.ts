/**
 * IndexedDB：只用来放「用户上次选的视频文件夹」的句柄。
 *
 * 连接常驻不关：一个页面生命周期里反复开关连接没有意义，而且 upgrade 时新旧连接
 * 撞在一起反而会卡住。
 */

const DB_NAME = 'nova100'
/** 存 FileSystemDirectoryHandle，key 固定 */
export const HANDLES = 'handles'

/** v1 建库；v2 加过整份视频缓存；v3 视频改成直接 GET，那个 store 删掉。 */
const VERSION = 3

let connection: Promise<IDBDatabase> | null = null

export function openDb(): Promise<IDBDatabase> {
  if (!connection) {
    connection = new Promise<IDBDatabase>((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('这个浏览器 / 上下文不支持 IndexedDB'))
        return
      }
      const request = indexedDB.open(DB_NAME, VERSION)
      request.onupgradeneeded = () => {
        const db = request.result
        if (!db.objectStoreNames.contains(HANDLES)) db.createObjectStore(HANDLES)
        // v2 把整份视频存这儿（可能几百 MB）。现在视频是直接 GET 的，
        // 删掉这个 store 顺便把用户机器上的空间还回去。
        if (db.objectStoreNames.contains('videos')) db.deleteObjectStore('videos')
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error ?? new Error('indexedDB 打不开'))
      request.onblocked = () => reject(new Error('indexedDB 被别的标签页占着，升不了级'))
    })
    // 失败别把错误缓存住：下次调用再试一遍
    connection.catch(() => {
      connection = null
    })
  }
  return connection
}

/**
 * 主动开一次库，触发上面那次升级，把之前下过的视频缓存清掉。
 *
 * 升级只在「打开库」时发生，而不用文件夹模式的人根本不会打开它 —— 那些几百 MB 会一直躺着。
 * 所以启动时无条件开一次。
 */
export async function purgeLegacyVideoCache(): Promise<void> {
  try {
    await openDb()
  } catch {
    /* 隐私模式 / 浏览器不给用：那就没有缓存要清 */
  }
}

export async function withStore<T>(
  store: string,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb()
  // 不用 Promise.withResolvers：那是 ES2024，iPadOS 17.4 之前都没有
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  const request = run(db.transaction(store, mode).objectStore(store))
  request.onsuccess = () => resolve(request.result)
  request.onerror = () => reject(request.error ?? new Error('indexedDB 操作失败'))
  return promise
}
