import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { OPACITY_MAX, OPACITY_MIN, OPACITY_STEP, THEME_IDS, THEME_LABELS } from '@shared/defaults'
import { prettyHotkey } from '@shared/format'
import type { Settings, UpdateAction, UpdateState } from '@shared/types'
import { updateNeedsAttention, updateStatusText } from '@shared/update'
import { CloseIcon } from './icons'

interface Props {
  settings: Settings
  activeHotkey: string | null
  update: UpdateState
  onPatch: (patch: Partial<Settings>) => void
  onUpdateAction: (action: UpdateAction) => void
  /**
   * 拖动滑块时把中间值交给 App 去改 --panel-alpha。
   * 不能在这里直接操作 .shell 的 inline style ——
   * 那个变量是 App 用 style={{...}} 挂上去的，手动 setProperty 会把它覆盖掉，
   * 之后 React 因为值没变也不会重新写回来，面板就永久卡在松手时的透明度上。
   */
  onOpacityPreview: (value: number | null) => void
  onClose: () => void
  onExport: () => void
  onImport: () => void
}

function Row({ name, desc, children }: { name: string; desc?: string; children: ReactNode }) {
  return (
    <div className="row">
      <div className="row__label">
        <div className="row__name">{name}</div>
        {desc ? <div className="row__desc">{desc}</div> : null}
      </div>
      {children}
    </div>
  )
}

function Switch({ on, onChange }: { on: boolean; onChange: (value: boolean) => void }) {
  return (
    <button
      type="button"
      className={`switch ${on ? 'is-on' : ''}`}
      onClick={() => onChange(!on)}
      aria-pressed={on}
    />
  )
}

/** 版本卡片：一行版本号 + 一行状态，右边跟着当前该点的那个按钮 */
function UpdateCard({
  update,
  onAction
}: {
  update: UpdateState
  onAction: (action: UpdateAction) => void
}) {
  const alert = updateNeedsAttention(update.status)
  const busy = update.status === 'checking' || update.status === 'downloading'
  const percent = Math.max(2, Math.min(100, Math.round(update.percent)))

  let button: ReactNode
  if (busy) {
    button = (
      <button type="button" className="btn btn--ghost" disabled>
        {update.status === 'downloading' ? '下载中…' : '检查中…'}
      </button>
    )
  } else if (update.status === 'downloaded') {
    button = (
      <button type="button" className="btn btn--primary" onClick={() => onAction('install')}>
        重启安装
      </button>
    )
  } else if (update.status === 'available' && update.canDownload) {
    button = (
      <button type="button" className="btn btn--primary" onClick={() => onAction('download')}>
        下载更新
      </button>
    )
  } else if (update.status === 'unsupported') {
    button = (
      <button type="button" className="btn btn--ghost" onClick={() => onAction('page')}>
        发布页
      </button>
    )
  } else {
    button = (
      <button type="button" className="btn btn--ghost" onClick={() => onAction('check')}>
        检查更新
      </button>
    )
  }

  return (
    <div className={`update-card ${alert ? 'is-alert' : ''}`}>
      <div className="update-card__info">
        <div className="update-card__version">v{update.current || '—'}</div>
        <div
          className={`update-card__status ${alert ? 'is-alert' : ''}`}
          data-tip={update.message || update.notes || undefined}
        >
          {updateStatusText(update)}
        </div>
        {update.status === 'downloading' ? (
          <div className="update-card__bar">
            <i style={{ width: `${percent}%` }} />
          </div>
        ) : null}
      </div>
      {button}
    </div>
  )
}

function normalizeKey(key: string): string | null {
  if (/^[a-zA-Z]$/.test(key)) return key.toUpperCase()
  if (/^[0-9]$/.test(key)) return key

  const map: Record<string, string> = {
    ' ': 'Space',
    ArrowUp: 'Up',
    ArrowDown: 'Down',
    ArrowLeft: 'Left',
    ArrowRight: 'Right',
    Enter: 'Return',
    Backspace: 'Backspace',
    Tab: 'Tab',
    Delete: 'Delete',
    Home: 'Home',
    End: 'End',
    PageUp: 'PageUp',
    PageDown: 'PageDown',
    '-': 'Minus',
    '=': 'Equal',
    '.': '.',
    ',': ','
  }
  if (map[key]) return map[key]
  if (/^F\d{1,2}$/.test(key)) return key
  return null
}

export function SettingsPanel({
  settings,
  activeHotkey,
  update,
  onPatch,
  onUpdateAction,
  onOpacityPreview,
  onClose,
  onExport,
  onImport
}: Props) {
  const [recording, setRecording] = useState(false)
  const [draftOpacity, setDraftOpacity] = useState(settings.opacity)
  // 上一次「已经发出去」的值。不能拿 settings.opacity 当基准 ——
  // 连着两次提交（按住方向键、或拖一下马上又拖一下）时它还是旧的，
  // 第二次会被判成「没变化」直接丢掉，滑块看着动了实际没落盘。
  const committed = useRef(settings.opacity)

  // 落盘后的值绕一圈回来再同步一次，防止别人（托盘/另一处设置）改了值这里还停在旧位置
  useEffect(() => {
    committed.current = settings.opacity
    setDraftOpacity(settings.opacity)
  }, [settings.opacity])

  // 离开设置面板时把预览收掉，否则 App 会一直用一个过期的手动值
  useEffect(() => () => onOpacityPreview(null), [onOpacityPreview])

  // 录制快捷键：必须带修饰键，单独一个字母会把整个键盘吃掉
  useEffect(() => {
    if (!recording) return undefined

    const handler = (event: KeyboardEvent): void => {
      event.preventDefault()
      event.stopPropagation()

      if (event.key === 'Escape') {
        setRecording(false)
        return
      }

      const mods: string[] = []
      if (event.ctrlKey) mods.push('Control')
      if (event.altKey) mods.push('Alt')
      if (event.shiftKey) mods.push('Shift')
      if (event.metaKey) mods.push('Super')

      if (['Control', 'Alt', 'Shift', 'Meta', 'CapsLock'].includes(event.key)) return
      if (mods.length === 0) return

      const normalized = normalizeKey(event.key)
      if (!normalized) return

      onPatch({ hotkey: [...mods, normalized].join('+') })
      setRecording(false)
    }

    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [recording, onPatch])

  const commitOpacity = (value: number): void => {
    const next = Math.round(value * 100) / 100
    if (Math.abs(next - committed.current) < 0.005) {
      onOpacityPreview(null)
      return
    }
    committed.current = next
    // 预览先留着，等新的 settings 推回来，App 里那段对比逻辑再把它清掉，
    // 否则中间会出现一帧回弹到旧透明度
    onPatch({ opacity: next })
  }

  return (
    <section className="settings">
      <header className="settings__head">
        <span className="settings__title">设置</span>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="关闭设置"
          data-tip="关闭设置">
          <CloseIcon />
        </button>
      </header>

      <div className="settings__body">
        <div className="settings__group">
          <div className="settings__group-label">外观</div>

          <div className="themes">
            {THEME_IDS.map((id) => (
              <button
                key={id}
                type="button"
                data-t={id}
                className={`theme-chip ${settings.theme === id ? 'is-on' : ''}`}
                onClick={() => onPatch({ theme: id })}
                aria-pressed={settings.theme === id}
                data-tip={THEME_LABELS[id]}
              >
                <i aria-hidden="true" />
                {THEME_LABELS[id]}
              </button>
            ))}
          </div>

          <Row name="卡片密度" desc="紧凑模式一屏能多看几个">
            <div className="segment">
              <button
                type="button"
                className={settings.density === 'compact' ? 'is-active' : ''}
                onClick={() => onPatch({ density: 'compact' })}
              >
                紧凑
              </button>
              <button
                type="button"
                className={settings.density === 'comfortable' ? 'is-active' : ''}
                onClick={() => onPatch({ density: 'comfortable' })}
              >
                舒适
              </button>
            </div>
          </Row>

          <Row name="面板不透明度" desc="太高会挡桌面，太低看不清字">
            <span className="row__value">{Math.round(draftOpacity * 100)}%</span>
            <div className="slider">
              <input
                type="range"
                min={OPACITY_MIN}
                max={OPACITY_MAX}
                step={OPACITY_STEP}
                value={draftOpacity}
                aria-label="面板不透明度"
                onChange={(event) => {
                  const next = Number(event.target.value)
                  setDraftOpacity(next)
                  onOpacityPreview(next)
                }}
                // 松手才写盘：拖动过程中每一帧都发 IPC 会把主进程的写盘防抖冲垮
                onPointerUp={(event) => commitOpacity(Number(event.currentTarget.value))}
                onKeyUp={(event) => commitOpacity(Number(event.currentTarget.value))}
                onBlur={(event) => commitOpacity(Number(event.currentTarget.value))}
              />
            </div>
          </Row>
        </div>

        <div className="settings__group">
          <div className="settings__group-label">行为</div>
          <Row name="窗口始终置顶" desc="开关也在这里，不用每次开菜单">
            <Switch on={settings.alwaysOnTop} onChange={(value) => onPatch({ alwaysOnTop: value })} />
          </Row>
          <Row name="点到外面自动收起" desc="像抽屉一样，用完自动推回去">
            <Switch on={settings.hideOnBlur} onChange={(value) => onPatch({ hideOnBlur: value })} />
          </Row>
          <Row name="开机自动启动" desc="登录后直接躺在托盘里">
            <Switch
              on={settings.launchAtLogin}
              onChange={(value) => onPatch({ launchAtLogin: value })}
            />
          </Row>
          <Row
            name="呼出快捷键"
            desc={activeHotkey ? '点一下可重新录制' : '当前组合被占用或无效'}
          >
            <button
              type="button"
              className={`hotkey ${recording ? 'is-recording' : ''}`}
              onClick={() => setRecording((value) => !value)}
            >
              {recording ? '请按下组合键…' : activeHotkey ? prettyHotkey(activeHotkey) : '未生效'}
            </button>
          </Row>
        </div>

        <div className="settings__group">
          <div className="settings__group-label">更新</div>

          <UpdateCard update={update} onAction={onUpdateAction} />

          <Row name="自动检查新版本" desc="启动 6 秒后查一次，之后每 6 小时一次">
            <Switch
              on={settings.autoCheckUpdate}
              onChange={(value) => onPatch({ autoCheckUpdate: value })}
            />
          </Row>
          <Row name="自动下载" desc="关掉后由你点「下载更新」，慢网络建议关">
            <Switch
              on={settings.autoDownloadUpdate}
              onChange={(value) => onPatch({ autoDownloadUpdate: value })}
            />
          </Row>
        </div>

        <div className="settings__group">
          <div className="settings__group-label">数据</div>
          <Row name="导出备份" desc="存成一个 JSON，换机器时可以搬过去">
            <button type="button" className="btn btn--ghost" onClick={onExport}>
              导出
            </button>
          </Row>
          <Row name="从备份恢复" desc="会用备份整体覆盖当前盒子">
            <button type="button" className="btn btn--ghost" onClick={onImport}>
              恢复
            </button>
          </Row>
        </div>

        <div className="settings__foot">
          数据只存在这台电脑上，不上传任何服务器
          <br />
          更新包只从 GitHub Release 拉取
        </div>
      </div>
    </section>
  )
}
