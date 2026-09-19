/**
 * 把「配置里的视频条目」和「本地文件」统一成一种可播放的东西。
 *
 * - 自带素材（`public/assets/`）：url 指向 assets 目录，走 HTTP。
 * - 本地文件夹：url 是 `URL.createObjectURL(file)`，视频一个字节都不上传。
 */

import { assetUrl, type ClipDef } from './config.ts'
import type { LocalVideo } from './local.ts'

export interface PlayableClip extends ClipDef {
  /** 直接喂给 `<video src>` 的地址 */
  url: string
}

export interface ClipSet {
  clips: PlayableClip[]
  /** 释放 object URL；自带素材模式下是空操作 */
  dispose(): void
}

export function builtinClips(clips: readonly ClipDef[]): ClipSet {
  return { clips: clips.map((clip) => ({ ...clip, url: assetUrl(clip.file) })), dispose: () => {} }
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
