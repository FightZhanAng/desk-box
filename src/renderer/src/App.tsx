import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, DragEvent, MouseEvent as ReactMouseEvent } from 'react'
import type { ActionResult, AppState, Settings, UpdateAction, UpdateState } from '@shared/types'
import { looksLikeUrl } from '@shared/url'
import { AddSheet } from './components/AddSheet'
import { ArrowDownIcon } from './components/icons'
import { Dock } from './components/Dock'
import { EmptyState } from './components/EmptyState'
import { GroupTabs } from './components/GroupTabs'
import { ItemGrid } from './components/ItemGrid'
import { SearchBar } from './components/SearchBar'
import { SelectionBar } from './components/SelectionBar'
import { SettingsPanel } from './components/SettingsPanel'
import { TextPeek } from './components/TextPeek'
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
  // 多选集合：单选就是长度为 1 的集合。anchor 是 Shift 连选的起点
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const anchorId = useRef<string | null>(null)
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

  // 选中集合里可能有已经被删掉、或者被搜索/切分组挡在视口外的条目，
  // 批量操作只该作用在「当前看得见的那些」—— 否则用户会删掉自己没看见的东西
  const selectedVisible = useMemo(() => {
    const visibleIds = new Set(visible.map((item) => item.id))
    return selectedIds.filter((id) => visibleIds.has(id))
  }, [selectedIds, visible])

  const clearSelection = useCallback(() => {
    setSelectedIds([])
    anchorId.current = null
  }, [])

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

  /**
   * Ctrl/Shift 点击多选。
   *
   * 普通单击不再选中：一来收纳盒不是文件管理器，「点一下就进入选择态」
   * 太容易误触发；二来单选的所有动作都挂在右键菜单上，右键本身就会把
   * 这张卡片选上，单击选中没有独立价值。双击才是打开/预览。
   */
  const selectItem = useCallback(
    (id: string, event: ReactMouseEvent) => {
      const additive = event.ctrlKey || event.metaKey
      const ranged = event.shiftKey

      if (!additive && !ranged) return

      if (ranged) {
        const from = anchorId.current ?? id
        const start = visible.findIndex((item) => item.id === from)
        const end = visible.findIndex((item) => item.id === id)
        if (start < 0 || end < 0) {
          setSelectedIds([id])
          anchorId.current = id
          return
        }
        const [lo, hi] = start <= end ? [start, end] : [end, start]
        const range = visible.slice(lo, hi + 1).map((item) => item.id)
        setSelectedIds((prev) => (additive ? [...new Set([...prev, ...range])] : range))
        return
      }

      if (additive) {
        setSelectedIds((prev) => {
          if (prev.includes(id)) {
            const next = prev.filter((entry) => entry !== id)
            // 反选掉锚点本身时，把锚点挪到剩下的最后一个，免得 Shift 连选从虚空开始
            if (anchorId.current === id) anchorId.current = next[next.length - 1] ?? null
            return next
          }
          anchorId.current = id
          return [...prev, id]
        })
        return
      }

      anchorId.current = id
      setSelectedIds([id])
    },
    [visible]
  )

  /** 右键：点在选中集合里就作用于整组，点在集合外则先选中这一张 */
  const showItemMenu = useCallback(
    (id: string) => {
      const batch = selectedVisible.includes(id) && selectedVisible.length > 1
      if (!batch) {
        setSelectedIds([id])
        anchorId.current = id
        window.deskbox.showItemMenu(id)
        return
      }
      window.deskbox.showBatchMenu(selectedVisible)
    },
    [selectedVisible]
  )

  /** 双击片段 → 只读预览弹窗；看完再决定要不要复制 */
  const [peekId, setPeekId] = useState<string | null>(null)
  const peekItem = useMemo(
    () => (peekId ? (allItems?.find((item) => item.id === peekId) ?? null) : null),
    [allItems, peekId]
  )
  const closePeek = useCallback(() => setPeekId(null), [])
  const copyPeek = useCallback(
    (text: string) => {
      navigator.clipboard
        .writeText(text)
        .then(() => {
          toastSeq.current += 1
          setToast({ text: '片段已复制到剪贴板', tone: 'ok', seq: toastSeq.current })
        })
        .catch(() => {
          toastSeq.current += 1
          setToast({ text: '复制没成功，请手动全选复制', tone: 'warn', seq: toastSeq.current })
        })
    },
    []
  )

  const openSelected = useCallback(() => {
    if (selectedVisible.length === 0) return
    void run(() => window.deskbox.openItems(selectedVisible))
  }, [run, selectedVisible])

  const removeSelected = useCallback(() => {
    if (selectedVisible.length === 0) return
    const ids = selectedVisible
    void run(async () => {
      const result = await window.deskbox.removeItems(ids)
      // 主进程那边会弹确认框；取消时条目还在，选中状态也该留着
      if (result.ok && !result.cancelled) clearSelection()
      return result
    })
  }, [clearSelection, run, selectedVisible])

  const pinSelected = useCallback(
    (pinned: boolean) => {
      if (selectedVisible.length === 0) return
      void run(() => window.deskbox.updateItems(selectedVisible, { pinned }))
    },
    [run, selectedVisible]
  )

  const moveSelected = useCallback(
    (target: string) => {
      if (selectedVisible.length === 0) return
      void run(() => window.deskbox.updateItems(selectedVisible, { groupId: target }))
    },
    [run, selectedVisible]
  )

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
        clearSelection()
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
        event.preventDefault()
        searchRef.current?.focus()
        searchRef.current?.select()
      }

      // 下面两个快捷键只在「没在输入」时生效：搜索框里 Ctrl+A 是全选文字，
      // Delete 是删字符，被抢走会让人以为输入框坏了
      const target = event.target as HTMLElement | null
      const typing =
        target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable === true
      if (typing) return

      // Ctrl+A 选中当前视图里的全部条目（单击不再选中，这是键盘进选择态的入口）
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a' && visible.length > 0) {
        event.preventDefault()
        setSelectedIds(visible.map((item) => item.id))
        return
      }

      if (event.key === 'Delete' && selectedVisible.length > 0) {
        event.preventDefault()
        removeSelected()
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [clearSelection, removeSelected, selectedVisible, settingsOpen, sheet, visible])

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
              clearSelection()
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
              if (event.target === event.currentTarget) clearSelection()
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
                selectedIds={new Set(selectedVisible)}
                onSelect={selectItem}
                onOpen={openItem}
                onPreview={setPeekId}
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

          {selectedVisible.length > 0 && (
            <SelectionBar
              count={selectedVisible.length}
              total={visible.length}
              groups={groups}
              groupId={activeGroup}
              pinned={selectedVisible.every(
                (id) => state.items.find((item) => item.id === id)?.pinned === true
              )}
              onOpen={openSelected}
              onPin={pinSelected}
              onMove={moveSelected}
              onRemove={removeSelected}
              onSelectAll={() => setSelectedIds(visible.map((item) => item.id))}
              onClear={clearSelection}
            />
          )}

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

      {peekItem && (
        <TextPeek content={peekItem.target} onCopy={copyPeek} onClose={closePeek} />
      )}

      {toast && (
        <div key={toast.seq} className={`toast ${toast.tone === 'warn' ? 'is-warn' : ''}`}>
          {toast.text}
        </div>
      )}
    </div>
  )
}
