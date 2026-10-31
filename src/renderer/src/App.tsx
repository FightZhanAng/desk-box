import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, DragEvent } from 'react'
import type { ActionResult, AppState, Settings, UpdateAction, UpdateState } from '@shared/types'
import { looksLikeUrl } from '@shared/url'
import { AddSheet } from './components/AddSheet'
import { ArrowDownIcon } from './components/icons'
import { Dock } from './components/Dock'
import { EmptyState } from './components/EmptyState'
import { GroupTabs } from './components/GroupTabs'
import { ItemGrid } from './components/ItemGrid'
import { SearchBar } from './components/SearchBar'
import { SettingsPanel } from './components/SettingsPanel'
import { TitleBar } from './components/TitleBar'

type SheetMode = 'none' | 'link' | 'text'

interface ToastState {
  text: string
  tone: 'ok' | 'warn'
  seq: number
}

export default function App() {
  const [state, setState] = useState<AppState | null>(null)
  const [groupId, setGroupId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [sheet, setSheet] = useState<SheetMode>('none')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [toast, setToast] = useState<ToastState | null>(null)
  const [dragging, setDragging] = useState(false)
  // 拖滑块时的临时透明度。落盘是异步的，中间这几毫秒如果直接读 settings
  // 面板会先弹回旧值再跳过去，看起来像没拖动成功
  const [alphaPreview, setAlphaPreview] = useState<number | null>(null)
  const [update, setUpdate] = useState<UpdateState | null>(null)

  const internalDrag = useRef(false)
  const dragDepth = useRef(0)
  const searchRef = useRef<HTMLInputElement | null>(null)
  const toastSeq = useRef(0)

  /* ---------------------------------------------------------------- 状态同步 */

  useEffect(() => {
    let alive = true

    void window.deskbox.getState().then((next) => {
      if (alive) setState(next)
    })

    // 托盘菜单、全局快捷键等主进程操作改完数据会推过来
    const off = window.deskbox.onStateChanged((next) => setState(next))
    return () => {
      alive = false
      off()
    }
  }, [])

  const notify = useCallback((result: ActionResult) => {
    setState(result.state)
    if (result.message) {
      toastSeq.current += 1
      setToast({ text: result.message, tone: result.ok ? 'ok' : 'warn', seq: toastSeq.current })
    }
  }, [])

  const run = useCallback(
    async (task: () => Promise<ActionResult>) => {
      try {
        notify(await task())
      } catch {
        toastSeq.current += 1
        setToast({ text: '操作没成功，再试一次', tone: 'warn', seq: toastSeq.current })
      }
    },
    [notify]
  )

  useEffect(() => {
    if (!toast) return undefined
    const timer = setTimeout(() => setToast(null), 2400)
    return () => clearTimeout(timer)
  }, [toast])

  // 新的透明度落盘并推回来之后，把预览值撤掉，交还给 settings
  useEffect(() => {
    if (alphaPreview === null || !state) return
    if (Math.abs(state.settings.opacity - alphaPreview) < 0.005) setAlphaPreview(null)
  }, [alphaPreview, state])

  /* ---------------------------------------------------------------- 更新状态 */

  useEffect(() => {
    void window.deskbox.getUpdate().then(setUpdate).catch(() => undefined)
    // 检查/下载过程中主进程会一路推状态过来
    return window.deskbox.onUpdateChanged(setUpdate)
  }, [])

  /* ---------------------------------------------------------------- 派生数据 */

  const allItems = state?.items
  const groups = state?.groups ?? []

  const activeGroup = groupId && groups.some((group) => group.id === groupId) ? groupId : null

  const visible = useMemo(() => {
    if (!allItems) return []
    const keyword = query.trim().toLowerCase()

    return allItems.filter((item) => {
      if (activeGroup && item.groupId !== activeGroup) return false
      if (!keyword) return true
      return (
        item.title.toLowerCase().includes(keyword) ||
        item.target.toLowerCase().includes(keyword) ||
        item.note.toLowerCase().includes(keyword)
      )
    })
  }, [allItems, activeGroup, query])

  const counts = useMemo(() => {
    const map = new Map<string, number>()
    allItems?.forEach((item) => {
      map.set(item.groupId, (map.get(item.groupId) ?? 0) + 1)
    })
    return map
  }, [allItems])

  /* ---------------------------------------------------------------- 动作 */

  const patchSettings = useCallback(
    (patch: Partial<Settings>) => {
      void run(() => window.deskbox.patchSettings(patch))
    },
    [run]
  )

  const openItem = useCallback(
    (id: string) => {
      void run(() => window.deskbox.openItem(id))
    },
    [run]
  )

  const showItemMenu = useCallback((id: string) => {
    setSelectedId(id)
    window.deskbox.showItemMenu(id)
  }, [])

  const hideWindow = useCallback(() => {
    void window.deskbox.hideWindow()
  }, [])

  const runUpdateAction = useCallback(
    async (action: UpdateAction) => {
      try {
        if (action === 'install') {
          await window.deskbox.installUpdate()
          return
        }
        if (action === 'page') {
          await window.deskbox.openUpdatePage()
          return
        }
        const next =
          action === 'check'
            ? await window.deskbox.checkUpdate()
            : await window.deskbox.downloadUpdate()
        setUpdate(next)
      } catch {
        toastSeq.current += 1
        setToast({ text: '更新操作没成功，稍后再试', tone: 'warn', seq: toastSeq.current })
      }
    },
    []
  )

  /* ---------------------------------------------------------------- 拖放 */

  const handleDragEnter = (event: DragEvent): void => {
    if (internalDrag.current) return
    event.preventDefault()
    dragDepth.current += 1
    if (dragDepth.current === 1) setDragging(true)
  }

  const handleDragOver = (event: DragEvent): void => {
    if (internalDrag.current) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
  }

  const handleDragLeave = (): void => {
    if (internalDrag.current) return
    dragDepth.current = Math.max(0, dragDepth.current - 1)
    if (dragDepth.current === 0) setDragging(false)
  }

  const handleDrop = (event: DragEvent): void => {
    event.preventDefault()
    dragDepth.current = 0
    setDragging(false)

    if (internalDrag.current) {
      internalDrag.current = false
      return
    }

    const target = activeGroup ?? undefined

    // 1) 真实文件：走 getPathForFile，Electron 32 之后 File.path 已经没了
    const files = Array.from(event.dataTransfer.files)
    if (files.length > 0) {
      const paths = files
        .map((file) => window.deskbox.getPathForFile(file))
        .filter((path): path is string => typeof path === 'string' && path.length > 0)
      if (paths.length > 0) {
        void run(() => window.deskbox.addPaths(paths, target))
        return
      }
    }

    // 2) 浏览器拖来的链接
    const uri = event.dataTransfer
      .getData('text/uri-list')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.length > 0 && !line.startsWith('#'))

    if (uri) {
      void run(() => window.deskbox.addItem({ kind: 'link', target: uri, groupId: target }))
      return
    }

    // 3) 纯文本：像网址就当链接，否则存成片段
    const plain = event.dataTransfer.getData('text/plain').trim()
    if (!plain) return
    void run(() =>
      window.deskbox.addItem({
        kind: looksLikeUrl(plain) ? 'link' : 'text',
        target: plain,
        groupId: target
      })
    )
  }

  /* ---------------------------------------------------------------- 快捷键 */

  useEffect(() => {
    const handler = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        if (settingsOpen) {
          setSettingsOpen(false)
          return
        }
        if (sheet !== 'none') {
          setSheet('none')
          return
        }
        setSelectedId(null)
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
        event.preventDefault()
        searchRef.current?.focus()
        searchRef.current?.select()
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [settingsOpen, sheet])

  /* ---------------------------------------------------------------- 渲染 */

  if (!state) {
    return <div className="shell" />
  }

  const dropTargetName = activeGroup
    ? (groups.find((group) => group.id === activeGroup)?.name ?? '盒子')
    : (groups[0]?.name ?? '盒子')

  const panelAlpha = alphaPreview ?? state.settings.opacity

  return (
    <div
      className="shell"
      data-theme={state.settings.theme}
      style={{ '--panel-alpha': String(panelAlpha) } as CSSProperties}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/*
        设置是「换一页」，不是盖一层浮层。
        原因很实在：浮层是整屏不透明的，用户拖不透明度滑块时下面全被盖住，
        看上去就像「拖了没反应」—— 那正是上一版被反馈的毛病。
        换成替换式之后，设置页自己也躺在那层半透明纸上，透明度改动当场可见。
      */}
      {settingsOpen ? (
        <SettingsPanel
          settings={state.settings}
          activeHotkey={state.activeHotkey}
          update={
            update ?? {
              status: 'idle',
              current: state.version,
              latest: '',
              percent: 0,
              message: '',
              checkedAt: 0,
              notes: '',
              canDownload: false
            }
          }
          onPatch={patchSettings}
          onUpdateAction={(action) => void runUpdateAction(action)}
          onOpacityPreview={setAlphaPreview}
          onClose={() => setSettingsOpen(false)}
          onExport={() => void run(() => window.deskbox.exportData())}
          onImport={() => void run(() => window.deskbox.importData())}
        />
      ) : (
        <>
          <TitleBar
            pinned={state.settings.alwaysOnTop}
            total={state.items.length}
            hotkey={state.activeHotkey}
            onTogglePin={() => void run(() => window.deskbox.togglePin())}
            onOpenSettings={() => setSettingsOpen(true)}
            onHide={hideWindow}
          />

          <GroupTabs
            groups={groups}
            counts={counts}
            total={state.items.length}
            active={activeGroup}
            onSelect={(id) => {
              setGroupId(id)
              setSelectedId(null)
            }}
            onAdd={(name) => void run(() => window.deskbox.addGroup(name))}
            onRename={(id, name) => void run(() => window.deskbox.renameGroup(id, name))}
            onRemove={(id) => {
              if (activeGroup === id) setGroupId(null)
              void run(() => window.deskbox.removeGroup(id))
            }}
          />

          <SearchBar value={query} onChange={setQuery} inputRef={searchRef} />

          <div
            className="board"
            onClick={(event) => {
              if (event.target === event.currentTarget) setSelectedId(null)
            }}
          >
            {visible.length === 0 ? (
              <EmptyState
                searching={query.trim().length > 0}
                onPickFiles={() => void run(() => window.deskbox.pickFiles())}
                onPickFolder={() => void run(() => window.deskbox.pickFolder())}
                onAddLink={() => setSheet('link')}
                onAddText={() => setSheet('text')}
              />
            ) : (
              <ItemGrid
                items={visible}
                compact={state.settings.density === 'compact'}
                selectedId={selectedId}
                onSelect={setSelectedId}
                onOpen={openItem}
                onMenu={showItemMenu}
                onDragBegin={() => {
                  internalDrag.current = true
                }}
                onDragEnd={() => {
                  internalDrag.current = false
                }}
              />
            )}
          </div>

          <Dock
            total={state.items.length}
            visible={visible.length}
            onPickFiles={() => void run(() => window.deskbox.pickFiles())}
            onPickFolder={() => void run(() => window.deskbox.pickFolder())}
            onAddLink={() => setSheet('link')}
            onAddText={() => setSheet('text')}
          />
        </>
      )}

      {dragging && (
        <div className="dropzone">
          <div className="dropzone__inner">
            <ArrowDownIcon />
            <span className="dropzone__label">松手收进「{dropTargetName}」</span>
          </div>
        </div>
      )}

      {sheet !== 'none' && (
        <AddSheet
          mode={sheet}
          onClose={() => setSheet('none')}
          onSubmit={(value) => {
            const kind = sheet === 'link' ? 'link' : 'text'
            const target = activeGroup ?? undefined
            setSheet('none')
            void run(() => window.deskbox.addItem({ kind, target: value, groupId: target }))
          }}
        />
      )}

      {toast && (
        <div key={toast.seq} className={`toast ${toast.tone === 'warn' ? 'is-warn' : ''}`}>
          {toast.text}
        </div>
      )}
    </div>
  )
}
