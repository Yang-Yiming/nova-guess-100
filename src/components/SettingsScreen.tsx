import { useMemo, useState } from 'react'
import { DEFAULT_SETTINGS, type Settings, type StyleDef } from '../game/config.ts'
import type { LocalVideo } from '../game/local.ts'
import { displayName } from '../game/styles.ts'

export interface SettingsScreenProps {
  settings: Settings
  /** 全部舞种（含被关掉的），选项列表用它 */
  allStyles: readonly StyleDef[]
  disabledStyles: readonly string[]
  videos: readonly LocalVideo[]
  assignments: Readonly<Record<string, string>>
  /** 当前素材来源的显示名 */
  sourceLabel: string
  /** 真正能出成题的舞种数（= 配了视频的舞种数），选项数不能超过它 */
  maxChoices: number
  /** 舞种名是否附带中文 */
  showChinese: boolean
  onToggleShowChinese: () => void
  /** 浏览器是否支持直接选文件夹 */
  canPickFolder: boolean
  onPickFolder: () => void
  onChooseFiles: (files: File[]) => void
  onAssign: (path: string, styleId: string) => void
  onAutoAssign: () => void
  onClearFolder: () => void
  onToggleStyle: (styleId: string) => void
  onSettingsChange: (patch: Partial<Settings>) => void
  onResetAll: () => void
  onBack: () => void
}

export function SettingsScreen(props: SettingsScreenProps) {
  const {
    settings,
    allStyles,
    disabledStyles,
    videos,
    assignments,
    sourceLabel,
    maxChoices,
    showChinese,
    onToggleShowChinese,
    canPickFolder,
    onPickFolder,
    onChooseFiles,
    onAssign,
    onAutoAssign,
    onClearFolder,
    onToggleStyle,
    onSettingsChange,
    onResetAll,
    onBack,
  } = props

  const [dragging, setDragging] = useState(false)

  const assigned = useMemo(() => videos.filter((video) => assignments[video.path]).length, [videos, assignments])
  const activeStyles = allStyles.filter((style) => !disabledStyles.includes(style.id))
  const set = (key: keyof Settings, value: number) => onSettingsChange({ [key]: value })

  return (
    <div className="screen">
      <header className="bar">
        <button className="chip" type="button" onClick={onBack}>
          ← 返回
        </button>
        <h1 className="bar__title">设置</h1>
      </header>

      <section className="panel">
        <h2>1 · 选视频目录</h2>
        <p className="panel__hint">
          视频只在你自己的电脑上读，不会上传到任何地方。当前：<strong>{sourceLabel}</strong>
        </p>

        <div
          className={'drop' + (dragging ? ' drop--active' : '')}
          onDragOver={(event) => {
            event.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault()
            setDragging(false)
            onChooseFiles([...event.dataTransfer.files])
          }}
        >
          <p>把装视频的文件夹拖进来</p>
          <div className="drop__actions">
            {canPickFolder ? (
              <button className="btn btn--primary" type="button" onClick={onPickFolder}>
                选择文件夹
              </button>
            ) : (
              <label className="btn btn--primary">
                选择文件夹
                <input
                  type="file"
                  multiple
                  // @ts-expect-error 非标准属性，但 Chrome / Safari / Edge 都支持
                  webkitdirectory=""
                  directory=""
                  hidden
                  onChange={(event) => onChooseFiles([...(event.target.files ?? [])])}
                />
              </label>
            )}
            <label className="btn">
              选单个文件
              <input
                type="file"
                multiple
                accept="video/*"
                hidden
                onChange={(event) => onChooseFiles([...(event.target.files ?? [])])}
              />
            </label>
          </div>
          {videos.length > 0 && (
            <button className="chip" type="button" onClick={onClearFolder}>
              换一个目录
            </button>
          )}
        </div>
      </section>

      {videos.length > 0 && (
        <section className="panel">
          <h2>
            2 · 给视频指定舞种
            <span className="panel__count">
              {assigned} / {videos.length} 已配
            </span>
          </h2>
          <p className="panel__hint">按文件名自动认一下，认错的自己改；没配舞种的视频不会出现在游戏里。</p>
          <button className="chip" type="button" onClick={onAutoAssign}>
            按文件名自动识别
          </button>

          <ul className="videos">
            {videos.map((video) => (
              <li className="video" key={video.path}>
                <span className="video__name" title={video.path}>
                  {video.path}
                </span>
                <select
                  className={'video__pick' + (assignments[video.path] ? '' : ' video__pick--empty')}
                  value={assignments[video.path] ?? ''}
                  onChange={(event) => onAssign(video.path, event.target.value)}
                >
                  <option value="">不参与</option>
                  {allStyles.map((style) => (
                    <option value={style.id} key={style.id}>
                      {displayName(style, showChinese)}
                    </option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="panel">
        <h2>3 · 玩法</h2>
        <div className="fields">
          <label className="field">
            <span className="field__label">片段最短秒数</span>
            <input
              type="number"
              min={2}
              max={120}
              value={settings.minSegment}
              onChange={(event) => set('minSegment', Number(event.target.value))}
            />
          </label>
          <label className="field">
            <span className="field__label">片段最长秒数</span>
            <input
              type="number"
              min={2}
              max={120}
              value={settings.maxSegment}
              onChange={(event) => set('maxSegment', Number(event.target.value))}
            />
          </label>
          <label className="field">
            <span className="field__label">
              掐掉首尾<em>避开开场白 / 谢幕</em>
            </span>
            <input
              type="number"
              min={0}
              max={60}
              value={settings.trimEdge}
              onChange={(event) => set('trimEdge', Number(event.target.value))}
            />
          </label>
          <label className="field">
            <span className="field__label">
              每题选项数<em>最多 {maxChoices}</em>
            </span>
            <input
              type="number"
              min={2}
              max={maxChoices}
              value={Math.min(settings.choiceCount, maxChoices)}
              onChange={(event) => set('choiceCount', Number(event.target.value))}
            />
          </label>
          <label className="field">
            <span className="field__label">一局几题</span>
            <input
              type="number"
              min={1}
              max={50}
              value={settings.questionsPerRound}
              onChange={(event) => set('questionsPerRound', Number(event.target.value))}
            />
          </label>
        </div>
      </section>

      <section className="panel">
        <h2>4 · 舞种</h2>
        <p className="panel__hint">关掉的舞种不会出现在选项里。至少要留 2 个。</p>
        <label className="switch">
          <input type="checkbox" checked={showChinese} onChange={onToggleShowChinese} />
          <span>
            选项里显示中文名
            <em>中文名有时会暗示动作形式（比如「甩手舞」），关掉更难猜</em>
          </span>
        </label>
        <div className="toggles">
          {allStyles.map((style) => {
            const off = disabledStyles.includes(style.id)
            return (
              <button
                className={'toggle' + (off ? ' toggle--off' : '')}
                key={style.id}
                type="button"
                aria-pressed={!off}
                disabled={!off && activeStyles.length <= 2}
                onClick={() => onToggleStyle(style.id)}
              >
                {displayName(style, showChinese)}
              </button>
            )
          })}
        </div>
      </section>

      <section className="panel">
        <button className="btn" type="button" onClick={onResetAll}>
          恢复默认设置
        </button>
        <p className="panel__hint">默认：{DEFAULT_SETTINGS.minSegment}-{DEFAULT_SETTINGS.maxSegment} 秒片段，{DEFAULT_SETTINGS.choiceCount} 个选项，{DEFAULT_SETTINGS.questionsPerRound} 题一局。</p>
      </section>
    </div>
  )
}
