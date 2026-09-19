/**
 * 把「配置里的视频条目」和「本地文件」统一成一种可播放的东西。
 *
 * - 自带素材（`public/assets/`）和服务器素材：url 指向 HTTP 服务，边播边取。
 * - 本地文件夹：url 是 `URL.createObjectURL(file)`，视频一个字节都不上传。
 */

import type { ClipDef } from './config.ts'
import type { LocalVideo } from './local.ts'

export interface PlayableClip extends ClipDef {
  /** 直接喂给 `<video src>` 的地址 */
  url: string
}

export interface ClipSet {
  clips: PlayableClip[]
  /** 释放 object URL；HTTP 素材下是空操作 */
  dispose(): void
}

/** url 由调用方决定：本机 assets 目录，或另一台机器的服务器地址。 */
export function httpClips(clips: readonly ClipDef[], urlFor: (file: string) => string): PlayableClip[] {
  return clips.map((clip) => ({ ...clip, url: urlFor(clip.file) }))
}

/** 只把「配了舞种」的视频算进来；没配的在设置页里标出来。 */
export function localClips(videos: readonly LocalVideo[], assignments: Readonly<Record<string, string>>): ClipSet {
  const urls: string[] = []
  const clips: PlayableClip[] = []
  for (const video of videos) {
    const style = assignments[video.path]
    if (!style) continue
    const url = URL.createObjectURL(video.file)
    urls.push(url)
    clips.push({ file: video.path, style, url })
  }
  return {
    clips,
    dispose: () => {
      for (const url of urls) URL.revokeObjectURL(url)
    },
  }
}
