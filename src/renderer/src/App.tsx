import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, DragEvent, MouseEvent as ReactMouseEvent } from 'react'
import type { ActionResult, AppState, ItemSort, Settings, UpdateAction, UpdateState } from '@shared/types'
import { FREQUENT_ID, FREQUENT_LIMIT } from '@shared/defaults'
import { looksLikeUrl } from '@shared/url'
import { isInitialsQuery, initialsOf } from './lib/initials'
import { isInternalDrag } from './lib/dnd'
import { sortItems } from './lib/sortItems'
import { AddSheet } from './components/AddSheet'
import { ArrowDownIcon } from './components/icons'
import { Dock } from './components/Dock'
import { EmptyState } from './components/EmptyState'
import { GroupTabs } from './components/GroupTabs'
import { ItemGrid } from './components/ItemGrid'
import { ItemMenu } from './components/ItemMenu'
import type { ItemMenuAction } from './components/ItemMenu'
import { SearchBar } from './components/SearchBar'
import { SelectionBar } from './components/SelectionBar'
import { SettingsPanel } from './components/SettingsPanel'
import { SortMenu } from './components/SortMenu'
import { TextPeek } from './components/TextPeek'
import { TitleBar } from './components/TitleBar'
import { TooltipLayer } from './components/Tooltip'

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
  // 整理模式：卡片拖拽只改顺序，不再把文件拖到资源管理器
  const [arranging, setArranging] = useState(false)

  const internalDrag = useRef(false)
  /** 分组胶囊正在换位；由 GroupTabs 通过回调置位 */
  const groupDrag = useRef(false)
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

  // 「常用」是虚拟分组，activeGroup 用 FREQUENT_ID 表示它被选中
  const activeGroup =
    groupId === FREQUENT_ID
      ? FREQUENT_ID
      : groupId && groups.some((group) => group.id === groupId)
        ? groupId
        : null

  /** 跨所有分组聚合的「打开最多」前 N 项 */
  const frequent = useMemo(() => {
    if (!allItems) return []
    return [...allItems]
      .filter((item) => item.openCount > 0)
      .sort((a, b) => {
        if (a.openCount !== b.openCount) return b.openCount - a.openCount
        return b.lastOpenedAt - a.lastOpenedAt
      })
      .slice(0, FREQUENT_LIMIT)
  }, [allItems])

  const visible = useMemo(() => {
    if (!allItems) return []
    const keyword = query.trim().toLowerCase()
    const initialsMode = isInitialsQuery(keyword)

    const matches = (item: (typeof allItems)[number]): boolean => {
      if (!keyword) return true
      if (
        item.title.toLowerCase().includes(keyword) ||
        item.target.toLowerCase().includes(keyword) ||
        item.note.toLowerCase().includes(keyword)
      ) {
        return true
      }
      // 首字母匹配只作用于名称：把路径也拿去做拼音转换，噪音会盖过结果
      return initialsMode && initialsOf(item.title).includes(keyword)
    }

    // 「常用」的语义就是「按点击量排」，顺序来自 frequent，不能拿 allItems 的
    // 顺序去过滤 —— 那样过滤出来是「最近添加」的次序，看着完全不像常用
    if (activeGroup === FREQUENT_ID) return frequent.filter(matches)

    const matched = allItems.filter((item) => {
      if (activeGroup && item.groupId !== activeGroup) return false
      return matches(item)
    })
    return sortItems(matched, state?.settings.sortBy ?? 'recent')
  }, [allItems, activeGroup, query, frequent, state?.settings.sortBy])

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

  /** 切换排序方式。选「手动整理」以外的项时顺手退出整理模式，两种状态别打架 */
  const changeSort = useCallback(
    (sortBy: ItemSort) => {
      if (sortBy !== 'custom') setArranging(false)
      patchSettings({ sortBy })
    },
    [patchSettings]
  )

  const toggleArrange = useCallback(() => {
    // 「常用」是按点击量现算出来的，顺序没有落盘的位置，进去也拖不动
    if (activeGroup === FREQUENT_ID) {
      toastSeq.current += 1
      setToast({ text: '「常用」按点击量自动排序，不用手动整理', tone: 'warn', seq: toastSeq.current })
      return
    }
    setArranging((prev) => {
      const next = !prev
      // 进入整理模式就切到手动顺序 —— 否则用户拖完，界面还按「最近添加」重排，
      // 拖了半天看不出任何变化
      if (next) patchSettings({ sortBy: 'custom' })
      return next
    })
  }, [activeGroup, patchSettings])

  const reorderVisible = useCallback(
    (ids: string[]) => {
      void run(() => window.deskbox.reorderItems(ids))
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

  /**
   * 右键：只作用于被点的这一张，并顺手清空选中集合。
   *
   * 之前的行为是「点在选中集合里就整组生效」，看起来贴心，实际很别扭：
   * 用户选中了五张，右键其中一张只想改这一张，菜单却冒出「移除这 5 项」，
   * 手一抖就删了一片。多选的批量操作已经有一条独立的 SelectionBar，
   * 右键就让它老老实实做单条操作 —— 同时把选中态收掉，菜单一关就回到干净状态。
   *
   * 菜单本身由渲染层画（ItemMenu），不再走主进程原生菜单：原生菜单是系统
   * 画的白底硬线，跟这套玻璃面板对不上。位置用光标坐标，菜单自己负责贴边翻转。
   */
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null)
  const showItemMenu = useCallback(
    (id: string, x: number, y: number) => {
      clearSelection()
      setMenu({ id, x, y })
    },
    [clearSelection]
  )
  const closeItemMenu = useCallback(() => setMenu(null), [])
  const menuItem = useMemo(
    () => (menu ? (allItems?.find((item) => item.id === menu.id) ?? null) : null),
    [allItems, menu]
  )
  const handleItemMenuAction = useCallback(
    (action: ItemMenuAction) => {
      if (!menu) return
      const id = menu.id
      switch (action.type) {
        case 'open':
          void run(() => window.deskbox.openItem(id))
          break
        case 'reveal':
          void run(() => window.deskbox.revealItem(id))
          break
        case 'copy':
          void run(() => window.deskbox.copyItem(id))
          break
        case 'pin':
          void run(() => window.deskbox.updateItem(id, { pinned: action.pinned }))
          break
        case 'move':
          void run(() => window.deskbox.updateItem(id, { groupId: action.groupId }))
          break
        case 'remove':
          void run(() => window.deskbox.removeItem(id))
          break
      }
    },
    [menu, run]
  )

  // 设置是「换一页」，菜单是挂在卡片上的临时浮层 —— 页面换了就别留着
  useEffect(() => {
    if (settingsOpen) setMenu(null)
  }, [settingsOpen])

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

  /**
   * 界面内部的拖拽（卡片排序、分组换位）不能被当成「从外面拖东西进来」。
   *
   * 这两种拖拽都往 dataTransfer 里塞了 id 当占位，事件又会一路冒泡到 shell；
   * 不拦一道的话，拖完一个分组胶囊就会凭空多出一条 target 是分组 id 的
   * 文本片段 —— 用户看到的是「我拖了下分组，盒子里多了个 g4」。
   *
   * 判据用自定义 MIME 类型而不是「拖拽中的标志位」：目标元素的 onDrop 会
   * 先执行、把标志清掉，等事件冒泡到 shell 时标志已经是 false 了，
   * 靠它拦不住。types 在整条拖拽链路里始终有效，不受回调顺序影响。
   */
  const isInternalDragType = (event: DragEvent): boolean =>
    isInternalDrag(Array.from(event.dataTransfer.types))

  const suppressDrop = (event: DragEvent): boolean =>
    arranging || internalDrag.current || groupDrag.current || isInternalDragType(event)

  const handleDragEnter = (event: DragEvent): void => {
    if (suppressDrop(event)) return
    event.preventDefault()
    dragDepth.current += 1
    if (dragDepth.current === 1) setDragging(true)
  }

  const handleDragOver = (event: DragEvent): void => {
    if (suppressDrop(event)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
  }

  const handleDragLeave = (event: DragEvent): void => {
    if (suppressDrop(event)) return
    dragDepth.current = Math.max(0, dragDepth.current - 1)
    if (dragDepth.current === 0) setDragging(false)
  }

  const handleDrop = (event: DragEvent): void => {
    event.preventDefault()
    dragDepth.current = 0
    setDragging(false)

    if (arranging || isInternalDragType(event)) return

    if (internalDrag.current) {
      internalDrag.current = false
      return
    }

    if (groupDrag.current) {
      groupDrag.current = false
      return
    }

    // 「常用」是虚拟分组，往里拖东西会落空 —— 一律落到第一个真实分组
    const target = activeGroup && activeGroup !== FREQUENT_ID ? activeGroup : undefined
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

          {/* 五段纵向节奏：标题栏 → 搜索/排序 → 分组胶囊 → 卡片网格 → Dock */}
          <SearchBar
            value={query}
            onChange={setQuery}
            inputRef={searchRef}
            trailing={
              <SortMenu
                sortBy={state.settings.sortBy}
                arranging={arranging}
                onChange={changeSort}
                onToggleArrange={toggleArrange}
              />
            }
          />

          <GroupTabs
            groups={groups}
            counts={counts}
            total={state.items.length}
            active={activeGroup}
            frequentCount={frequent.length}
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
            onReorder={(ids) => void run(() => window.deskbox.reorderGroups(ids))}
            onDragStateChange={(active) => {
              groupDrag.current = active
            }}
          />

          {arranging && (
            <div className="arrange-hint">
              <span className="arrange-hint__text">拖拽卡片调整顺序 · 固定项恒在最前</span>
              <button
                type="button"
                className="arrange-hint__done"
                onClick={() => {
                  setArranging(false)
                  patchSettings({ sortBy: 'custom' })
                }}
              >
                完成
              </button>
            </div>
          )}

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
                onClearSearch={() => {
                  setQuery('')
                  searchRef.current?.focus()
                }}
              />
            ) : (
              <ItemGrid
                items={visible}
                compact={state.settings.density === 'compact'}
                selectedIds={new Set(selectedVisible)}
                arranging={arranging}
                onReorder={reorderVisible}
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
            const target = activeGroup && activeGroup !== FREQUENT_ID ? activeGroup : undefined
            setSheet('none')
            void run(() => window.deskbox.addItem({ kind, target: value, groupId: target }))
          }}
        />
      )}

      {peekItem && (
        <TextPeek content={peekItem.target} onCopy={copyPeek} onClose={closePeek} />
      )}

      {menu && menuItem && (
        <ItemMenu
          key={menu.id}
          item={menuItem}
          groups={groups}
          counts={counts}
          x={menu.x}
          y={menu.y}
          onAction={handleItemMenuAction}
          onClose={closeItemMenu}
        />
      )}

      {toast && (
        <div key={toast.seq} className={`toast ${toast.tone === 'warn' ? 'is-warn' : ''}`}>
          {toast.text}
        </div>
      )}

      {/* 全应用只此一个悬浮提示层：事件委托在 document 上，谁写了 data-tip 谁就能用 */}
      <TooltipLayer />
    </div>
  )
}
