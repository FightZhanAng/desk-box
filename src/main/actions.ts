import { app, clipboard, dialog, Menu, nativeImage, shell } from 'electron'
import type { MenuItemConstructorOptions, NativeImage } from 'electron'
import { createHash, randomUUID } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, extname, isAbsolute, join } from 'node:path'
import type { AppState, Group, Item, ItemView, NewItemInput, Settings } from '../shared/types'
import { clampOpacity, SORT_IDS, THEME_IDS } from '../shared/defaults'
import { hasRealIcon } from '../shared/icons'
import { hostOf, normalizeUrl } from '../shared/url'
import { getActiveHotkey, registerHotkey } from './hotkey'
import { appIconPath } from './paths'
import { getData, replaceData, save } from './store'
import { applyUpdateSettings } from './updater'
import { splitIconLocation, urlIconSource } from './url-icon'
import type { IconSource } from './url-icon'
import { applyAlwaysOnTop, getWindow, lockAutoHide } from './window'
import { extractIcon } from './win-icon'

/* ------------------------------------------------------------------ 状态构建 */

/**
 * 图标不再来自系统（app.getFileIcon），改成渲染层按扩展名画的矢量图。
 * 好处有两条：同一堆文件不再需要逐个走 shell 查询（几十个文件会有肉眼可见的卡顿），
 * 而且 Windows 那套蓝黄文件夹图标和这套界面根本不搭。
 */
export function buildState(): AppState {
  const data = getData()

  const items: ItemView[] = data.items.map((item) => {
    const isPath = item.kind === 'file' || item.kind === 'folder'
    const ext = isPath ? extname(item.target).slice(1).toLowerCase() : ''
    return {
      ...item,
      exists: isPath ? existsSync(item.target) : true,
      ext,
      // 指向文件夹的快捷方式按文件夹展示：系统给的还是那套黄蓝文件夹图，跟矢量界面不搭
      linkDir: isShortcutToDirectory(ext, item.target)
    }
  })

  // 固定项永远在最前；其余先看手动位次，位次相同再按加入时间倒序 ——
  // 老数据 order 全是 0，这样排出来跟升级前完全一致，新拖进来的也照样在顶部
  items.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
    if (a.order !== b.order) return a.order - b.order
    return b.createdAt - a.createdAt
  })

  return {
    groups: [...data.groups].sort((a, b) => a.order - b.order),
    items,
    settings: { ...data.settings },
    activeHotkey: getActiveHotkey(),
    platform: process.platform,
    version: app.getVersion()
  }
}

/** 主进程自己发起的变更（托盘菜单、全局快捷键）需要主动推给渲染层 */
export function pushState(): void {
  const win = getWindow()
  if (!win || win.isDestroyed()) return
  win.webContents.send('state:changed', buildState())
}

export function findItem(id: string): Item | undefined {
  return getData().items.find((item) => item.id === id)
}

/* ------------------------------------------------------------------ 新增 */

/**
 * 展示用的文件名。
 *
 * 快捷方式去掉 `.lnk`：桌面上本来就不显示这个后缀，盒子里再挂一串
 * 「夸克网盘.lnk」既啰嗦又像个原始文件名。其他扩展名（.md / .pdf …）保留，
 * 那是用户判断文件类型的依据，不该藏。
 */
function displayName(target: string): string {
  const name = basename(target) || target
  return /\.lnk$/i.test(name) ? name.slice(0, -4) : name
}

function defaultTitle(kind: Item['kind'], target: string): string {
  if (kind === 'text') {
    const firstLine = target.split('\n')[0].trim()
    return firstLine.length > 24 ? `${firstLine.slice(0, 24)}…` : firstLine || '未命名片段'
  }
  if (kind === 'link') return hostOf(target) || target
  return displayName(target)
}

/**
 * 新条目的排序位次：永远比现有最小值再小一点，于是稳稳落在最前面。
 * 不用 0 是因为 0 会和已有条目撞位次，只能靠 createdAt 兜底 —— 同一毫秒
 * 批量拖进来几项时那个兜底就不成立了，顺序会抖。
 */
function nextTopOrder(items: Item[]): number {
  if (items.length === 0) return 0
  const min = Math.min(...items.map((item) => item.order))
  return min - 1
}

export interface AddPathsOutcome {
  added: number
  /** 已经在盒子里，只是挪了分组 */
  duplicated: number
  /** 路径不存在 / 没权限，直接跳过 */
  skipped: number
}

/** 把一批本地路径收进收纳盒 */
export function addPaths(paths: string[], groupId?: string): AddPathsOutcome {
  const outcome: AddPathsOutcome = { added: 0, duplicated: 0, skipped: 0 }
  const data = getData()
  const targetGroup =
    groupId && data.groups.some((g) => g.id === groupId) ? groupId : data.groups[0]?.id
  if (!targetGroup) return outcome

  for (const raw of paths) {
    const target = raw.trim()
    if (!target) {
      outcome.skipped += 1
      continue
    }

    let kind: 'file' | 'folder'
    try {
      kind = statSync(target).isDirectory() ? 'folder' : 'file'
    } catch {
      // 路径不存在（拖动过程中被删 / 权限不足）直接跳过，不要在盒子里留死链
      outcome.skipped += 1
      continue
    }

    const existing = data.items.find((item) => item.target === target)
    if (existing) {
      // 已经收过就把它挪到当前分组，而不是堆第二条一模一样的
      existing.groupId = targetGroup
      outcome.duplicated += 1
      continue
    }

    data.items.push({
      id: randomUUID(),
      kind,
      title: displayName(target),
      target,
      groupId: targetGroup,
      note: '',
      pinned: false,
      createdAt: Date.now(),
      lastOpenedAt: 0,
      openCount: 0,
      order: nextTopOrder(data.items)
    })
    outcome.added += 1
  }

  save(data)
  return outcome
}

/** 把 addPaths 的结果翻译成一句人话，三种失败原因不能混成一句 */
export function describeAddPaths(outcome: AddPathsOutcome): string {
  if (outcome.added > 0) {
    const extra = outcome.skipped > 0 ? `，${outcome.skipped} 项收不进来` : ''
    return `已收纳 ${outcome.added} 项${extra}`
  }
  if (outcome.duplicated > 0 && outcome.skipped === 0) return '这些内容已经在盒子里了'
  if (outcome.skipped > 0 && outcome.duplicated === 0) {
    return `${outcome.skipped} 项没能收进来（路径不存在或没有权限）`
  }
  if (outcome.skipped > 0) return '已经在盒子里了，另一部分路径不存在'
  return '没有可收纳的内容'
}

export function addItem(input: NewItemInput): boolean {
  const data = getData()
  const groupId =
    input.groupId && data.groups.some((g) => g.id === input.groupId)
      ? input.groupId
      : data.groups[0]?.id
  if (!groupId) return false

  let target = input.target.trim()
  if (!target) return false
  if (input.kind === 'link') target = normalizeUrl(target)

  const title = (input.title ?? '').trim() || defaultTitle(input.kind, target)

  data.items.push({
    id: randomUUID(),
    kind: input.kind,
    title,
    target,
    groupId,
    note: input.note ?? '',
    pinned: false,
    createdAt: Date.now(),
    lastOpenedAt: 0,
    openCount: 0,
    order: nextTopOrder(data.items)
  })
  save(data)
  return true
}

/* ------------------------------------------------------------------ 修改 */

/**
 * 把一份 patch 应用到一个条目上，返回是否真的改了东西。
 * 单条改和批量改共用这一份逻辑：两边各写一遍，迟早会有一边漏掉某个字段。
 */
function applyItemPatch(groups: Group[], item: Item, patch: Record<string, unknown>): boolean {
  let changed = false

  if (typeof patch.title === 'string') {
    const next = patch.title.trim()
    if (next && next !== item.title) {
      item.title = next
      changed = true
    }
  }
  if (typeof patch.note === 'string' && patch.note !== item.note) {
    item.note = patch.note
    changed = true
  }
  if (typeof patch.pinned === 'boolean' && patch.pinned !== item.pinned) {
    item.pinned = patch.pinned
    changed = true
  }
  if (
    typeof patch.groupId === 'string' &&
    groups.some((g) => g.id === patch.groupId) &&
    patch.groupId !== item.groupId
  ) {
    item.groupId = patch.groupId
    changed = true
  }

  return changed
}

export function updateItem(id: string, patch: Record<string, unknown>): void {
  const data = getData()
  const item = data.items.find((it) => it.id === id)
  if (!item) return

  applyItemPatch(data.groups, item, patch)
  save(data)
}

/**
 * 批量改一组条目，返回真正被改到的条数。
 * 只落一次盘、只推一次状态：选中二三十项时逐条调用会让界面闪很多次，
 * 也会白白写几十遍磁盘。
 */
export function updateItems(ids: string[], patch: Record<string, unknown>): number {
  const data = getData()
  const wanted = new Set(ids)
  let changed = 0

  for (const item of data.items) {
    if (!wanted.has(item.id)) continue
    if (applyItemPatch(data.groups, item, patch)) changed += 1
  }

  if (changed > 0) save(data)
  return changed
}

function markOpened(id: string): void {
  const data = getData()
  const item = data.items.find((it) => it.id === id)
  if (!item) return
  item.lastOpenedAt = Date.now()
  item.openCount += 1
  save(data)
}

/**
 * 手动排序。
 *
 * 只重排传进来的这些条目，且只改动它们之间的相对位次 —— 没参与排序的
 * 条目（其他分组、或被搜索过滤掉的）一律保持原样。
 *
 * 做法：先按当前全局顺序排一遍，找出这批条目原本占住的那些「座位」，
 * 再把它们按新顺序依次填回同样的座位，最后整库重编号。这样既不会因为
 * 一次整理把没参与排序的条目挤到别处，也顺手解决了老数据 order 全为 0、
 * 根本插不进值的问题。
 */
export function reorderItems(ids: string[]): number {
  const data = getData()
  const wanted = new Set(ids)
  const moving = data.items.filter((item) => wanted.has(item.id))
  if (moving.length < 2) return 0

  // 拖拽过程中可能混进重复 id 或已被删掉的 id，先去重去无效
  const next = [...new Set(ids)].filter((id) => moving.some((item) => item.id === id))
  if (next.length < 2) return 0

  const sorted = [...data.items].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
    if (a.order !== b.order) return a.order - b.order
    return b.createdAt - a.createdAt
  })

  // 按新顺序依次填回这批条目原本占住的座位
  let cursor = 0
  const arranged = sorted.map((item) => {
    if (!wanted.has(item.id)) return item
    const id = next[cursor]
    cursor += 1
    return data.items.find((it) => it.id === id) ?? item
  })

  let changed = 0
  arranged.forEach((item, index) => {
    if (item.order !== index) {
      item.order = index
      changed += 1
    }
  })

  if (changed > 0) save(data)
  return changed
}

/**
 * 打开收纳项。
 * 返回错误文案（拿不到就给 null），界面据此弹提示 —— 文件被移走后
 * 双击没反应是最让人困惑的状态，必须说清楚。
 */
export async function openItem(id: string): Promise<string | null> {
  const item = findItem(id)
  if (!item) return '条目不存在'

  if (item.kind === 'text') {
    clipboard.writeText(item.target)
    markOpened(id)
    return null
  }

  if (item.kind === 'link') {
    try {
      await shell.openExternal(normalizeUrl(item.target))
    } catch (error) {
      return error instanceof Error ? error.message : '打开链接失败'
    }
    markOpened(id)
    return null
  }

  if (!existsSync(item.target)) return '路径不存在，可能已被移动或删除'
  const message = await shell.openPath(item.target)
  markOpened(id)
  return message || null
}

export function revealItem(id: string): void {
  const item = findItem(id)
  if (!item || (item.kind !== 'file' && item.kind !== 'folder')) return
  if (!existsSync(item.target)) return
  shell.showItemInFolder(item.target)
}

export function copyItemTarget(id: string): void {
  const item = findItem(id)
  if (!item) return
  clipboard.writeText(item.target)
}

/**
 * 拖出到资源管理器 / 其他程序。
 * Electron 要求 icon 是同步拿到的 NativeImage，而每个文件单独取系统图标是异步的，
 * 赶不上 dragstart 这一帧。所以统一用应用自己的图标当拖拽光标 ——
 * 用户看到的是「从收纳盒里拖出来的东西」，语义上反而更清楚。
 */
let dragCursor: NativeImage | null = null

function getDragCursor(): NativeImage | null {
  if (!dragCursor || dragCursor.isEmpty()) {
    const image = nativeImage.createFromPath(appIconPath())
    dragCursor = image.isEmpty() ? null : image.resize({ width: 48, height: 48, quality: 'best' })
  }
  return dragCursor
}

export function startDragItem(id: string): void {
  const win = getWindow()
  const item = findItem(id)
  if (!win || !item) return
  if (item.kind !== 'file' && item.kind !== 'folder') return
  if (!existsSync(item.target)) return

  const icon = getDragCursor()
  // startDrag 对空图标会直接抛错，宁可不拖也不能崩
  if (!icon) return
  win.webContents.startDrag({ file: item.target, icon })
}

export function removeItem(id: string): void {
  const data = getData()
  const index = data.items.findIndex((it) => it.id === id)
  if (index < 0) return
  // 只从收纳盒移除记录，绝不动磁盘上的文件
  data.items.splice(index, 1)
  save(data)
}

/** 批量移除记录，返回实际移除的条数；原文件同样不动 */
export function removeItems(ids: string[]): number {
  const data = getData()
  const wanted = new Set(ids)
  const kept = data.items.filter((item) => !wanted.has(item.id))
  const removed = data.items.length - kept.length
  if (removed > 0) {
    data.items = kept
    save(data)
  }
  return removed
}

/** 批量改完给一句人话：固定 / 移动分组 / 改名，各自说清改了几项 */
export function describeBatchPatch(patch: Record<string, unknown>, changed: number): string {
  if (typeof patch.pinned === 'boolean') return patch.pinned ? `已固定 ${changed} 项` : `已取消固定 ${changed} 项`
  if (typeof patch.groupId === 'string') {
    const name = getData().groups.find((g) => g.id === patch.groupId)?.name
    return name ? `已把 ${changed} 项移到「${name}」` : `已移动 ${changed} 项`
  }
  return `已更新 ${changed} 项`
}

/* ------------------------------------------------------------------ 批量打开 */

export interface OpenManyOutcome {
  opened: number
  /** 文本片段：打开动作是「复制到剪贴板」，多选时逐条复制没有意义，单独计数 */
  skipped: number
  /** 路径已失效 / 打不开的条数 */
  failed: number
  /** 第一条失败原因，用来提示用户，别把一堆错误文案拼成一段 */
  firstError: string | null
}

/**
 * 批量打开。
 *
 * 文本片段（kind === 'text'）刻意跳过：它的「打开」是复制到剪贴板，
 * 连点十条等于只剩最后一条，用户还以为全都复制了 —— 不如明确说跳过。
 * 每个条目之间只留一点点间隔：Windows 对同一瞬间拉起十几个进程并不友好，
 * 但等太久又会让「批量打开」变成一段要盯着看的进度条。
 */
export async function openItems(ids: string[]): Promise<OpenManyOutcome> {
  const outcome: OpenManyOutcome = { opened: 0, skipped: 0, failed: 0, firstError: null }

  for (const id of ids) {
    const item = findItem(id)
    if (!item) {
      outcome.failed += 1
      outcome.firstError ??= '部分条目已不存在'
      continue
    }
    if (item.kind === 'text') {
      outcome.skipped += 1
      continue
    }

    const error = await openItem(id)
    if (error) {
      outcome.failed += 1
      outcome.firstError ??= error
    } else {
      outcome.opened += 1
    }
    // 连续拉起多个进程时给系统喘口气；最后一条不用等
    await new Promise((resolve) => setTimeout(resolve, 60))
  }

  return outcome
}

export function describeOpenMany(outcome: OpenManyOutcome): string {
  if (outcome.opened === 0 && outcome.failed === 0 && outcome.skipped === 0) return ''
  if (outcome.opened === 0 && outcome.failed === 0) return '文本片段没法批量打开，请单条双击复制'

  const parts: string[] = []
  if (outcome.opened > 0) parts.push(`已打开 ${outcome.opened} 项`)
  if (outcome.failed > 0) parts.push(`${outcome.failed} 项打不开${outcome.firstError ? `（${outcome.firstError}）` : ''}`)
  if (outcome.skipped > 0) parts.push(`跳过 ${outcome.skipped} 条文本片段`)
  return parts.join('，')
}

/* ------------------------------------------------------------------ 分组 */

export function addGroup(name: string): boolean {
  const data = getData()
  const trimmed = name.trim()
  if (!trimmed) return false
  if (data.groups.some((g) => g.name === trimmed)) return false

  data.groups.push({
    id: randomUUID(),
    name: trimmed,
    order: data.groups.length
  })
  save(data)
  return true
}

export function renameGroup(id: string, name: string): void {
  const data = getData()
  const group = data.groups.find((g) => g.id === id)
  const trimmed = name.trim()
  if (!group || !trimmed) return
  group.name = trimmed
  save(data)
}

export function removeGroup(id: string): boolean {
  const data = getData()
  // 至少留一个分组，否则新收纳的东西无处安放
  if (data.groups.length <= 1) return false

  const group = data.groups.find((g) => g.id === id)
  if (!group) return false

  const fallback = data.groups.find((g) => g.id !== id)
  if (!fallback) return false

  for (const item of data.items) {
    if (item.groupId === id) item.groupId = fallback.id
  }

  data.groups = data.groups
    .filter((g) => g.id !== id)
    .map((g, index) => ({ ...g, order: index }))
  save(data)
  return true
}

/**
 * 重排分组。
 *
 * 传进来的 id 顺序就是目标顺序；没出现在列表里的分组（理论上不该有，
 * 但渲染层可能只拿到可见的那些）按原相对顺序补到末尾，绝不因为一次
 * 拖拽把某个分组弄丢。落盘时统一重编号，位次永远是 0..n-1 的连续整数 ——
 * 分组数量本来就少，不像条目那样需要留插入间隔。
 */
export function reorderGroups(ids: string[]): number {
  const data = getData()
  const next = [...new Set(ids)].filter((id) => data.groups.some((g) => g.id === id))
  if (next.length === 0) return 0

  const ordered = data.groups
    .filter((g) => next.includes(g.id))
    .sort((a, b) => next.indexOf(a.id) - next.indexOf(b.id))
  const rest = data.groups.filter((g) => !next.includes(g.id))

  const arranged = [...ordered, ...rest]
  let changed = 0
  arranged.forEach((group, index) => {
    if (group.order !== index) {
      group.order = index
      changed += 1
    }
  })

  if (changed > 0) save(data)
  return changed
}

/* ------------------------------------------------------------------ 设置 */

export function patchSettings(patch: Partial<Settings>): void {
  const data = getData()

  // 渲染层递上来的 patch 也不能全信：透明度越界会把面板弄成全透、字压在壁纸上读不清；
  // 主题 id 拼错则整块配色塌回无色。这里兜一层，落盘的永远是合法值。
  if ('opacity' in patch) patch.opacity = clampOpacity(patch.opacity, data.settings.opacity)
  if (patch.theme !== undefined && !THEME_IDS.includes(patch.theme)) delete patch.theme
  if (patch.sortBy !== undefined && !SORT_IDS.includes(patch.sortBy)) delete patch.sortBy

  const hotkeyChanged = typeof patch.hotkey === 'string' && patch.hotkey !== data.settings.hotkey

  Object.assign(data.settings, patch)
  save(data)

  if (typeof patch.alwaysOnTop === 'boolean') {
    applyAlwaysOnTop(patch.alwaysOnTop)
  }
  if (typeof patch.launchAtLogin === 'boolean') {
    try {
      app.setLoginItemSettings({ openAtLogin: patch.launchAtLogin })
    } catch {
      /* 部分环境（无权限的便携版）不支持，静默失败即可 */
    }
  }
  if (hotkeyChanged) {
    registerHotkey(data.settings.hotkey)
  }
  if ('autoCheckUpdate' in patch || 'autoDownloadUpdate' in patch) {
    applyUpdateSettings()
  }
}

/* ------------------------------------------------------------------ 对话框 */

export async function promptAddFiles(): Promise<number> {
  const win = getWindow()
  if (!win) return 0

  const release = lockAutoHide()
  try {
    const result = await dialog.showOpenDialog(win, {
      title: '选择要收纳的文件',
      buttonLabel: '收进盒子',
      properties: ['openFile', 'multiSelections']
    })
    if (result.canceled || result.filePaths.length === 0) return 0
    return addPaths(result.filePaths).added
  } finally {
    release()
  }
}

export async function promptAddFolder(): Promise<number> {
  const win = getWindow()
  if (!win) return 0

  const release = lockAutoHide()
  try {
    const result = await dialog.showOpenDialog(win, {
      title: '选择要收纳的文件夹',
      buttonLabel: '收进盒子',
      properties: ['openDirectory', 'multiSelections']
    })
    if (result.canceled || result.filePaths.length === 0) return 0
    return addPaths(result.filePaths).added
  } finally {
    release()
  }
}

export async function exportData(): Promise<string | null> {
  const win = getWindow()
  if (!win) return null

  const release = lockAutoHide()
  try {
    const stamp = new Date().toISOString().slice(0, 10)
    const result = await dialog.showSaveDialog(win, {
      title: '导出收纳盒数据',
      defaultPath: `desk-box-${stamp}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }]
    })
    if (result.canceled || !result.filePath) return null

    const data = getData()
    writeFileSync(result.filePath, JSON.stringify(data, null, 2), 'utf8')
    return result.filePath
  } finally {
    release()
  }
}

export async function importData(): Promise<boolean> {
  const win = getWindow()
  if (!win) return false

  const release = lockAutoHide()
  try {
    const result = await dialog.showOpenDialog(win, {
      title: '从备份恢复',
      buttonLabel: '恢复',
      properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json'] }]
    })
    if (result.canceled || result.filePaths.length === 0) return false

    const raw = JSON.parse(readFileSync(result.filePaths[0], 'utf8'))
    replaceData(raw)
    return true
  } catch {
    return false
  } finally {
    release()
  }
}

export function readClipboardText(): string {
  return clipboard.readText()
}

/* ------------------------------------------------------------------ 右键菜单 */

export function showItemMenu(id: string): void {
  const win = getWindow()
  const item = findItem(id)
  if (!win || !item) return

  const isPath = item.kind === 'file' || item.kind === 'folder'
  const template: MenuItemConstructorOptions[] = [
    {
      label: item.kind === 'text' ? '复制到剪贴板' : '打开',
      click: () => {
        void openItem(id)
      }
    }
  ]

  if (isPath) {
    template.push({ label: '在文件夹中显示', click: () => revealItem(id) })
    template.push({ label: '复制完整路径', click: () => copyItemTarget(id) })
  }
  if (item.kind === 'link') {
    template.push({ label: '复制链接', click: () => copyItemTarget(id) })
  }

  template.push({ type: 'separator' })
  template.push({
    label: item.pinned ? '取消固定' : '固定到最前',
    click: () => {
      updateItem(id, { pinned: !item.pinned })
      pushState()
    }
  })

  const otherGroups = getData().groups.filter((g) => g.id !== item.groupId)
  if (otherGroups.length > 0) {
    template.push({
      label: '移动到分组',
      submenu: otherGroups.map((group) => ({
        label: group.name,
        click: () => {
          updateItem(id, { groupId: group.id })
          pushState()
        }
      }))
    })
  }

  template.push({ type: 'separator' })
  template.push({
    label: '从收纳盒移除',
    click: () => {
      removeItem(id)
      pushState()
    }
  })

  const release = lockAutoHide()
  const menu = Menu.buildFromTemplate(template)
  menu.popup({
    window: win,
    callback: () => release()
  })
}

/* ------------------------------------------------------------------ 批量右键菜单 */

/**
 * 多选状态的右键菜单。
 *
 * 不另起一套「批量菜单」的另一个原因：用户选了三项之后右键，如果他以为
 * 点的是那一项而不是整组，菜单上写清条数就能救回来 —— 所以标题里带 N。
 */
export function showBatchMenu(ids: string[]): void {
  const win = getWindow()
  if (!win) return

  const list = [...new Set(ids)].filter((id) => findItem(id))
  if (list.length === 0) return
  // 只剩一条时没有「批量」可言，直接退回单条菜单，菜单项也更好用
  if (list.length === 1) {
    showItemMenu(list[0])
    return
  }

  const data = getData()
  const items = list.map((id) => findItem(id)).filter((item): item is Item => Boolean(item))
  const hasOpenable = items.some((item) => item.kind !== 'text')
  const allPinned = items.every((item) => item.pinned)

  const template: MenuItemConstructorOptions[] = [
    {
      label: `打开选中的 ${items.filter((it) => it.kind !== 'text').length} 项`,
      enabled: hasOpenable,
      click: () => {
        void openItems(list).then(() => pushState())
      }
    },
    { type: 'separator' },
    {
      label: allPinned ? '取消固定' : '固定到最前',
      click: () => {
        updateItems(list, { pinned: !allPinned })
        pushState()
      }
    }
  ]

  // 只有一组可去的地方就不必给子菜单，直接列出来
  const otherGroups = data.groups.filter((group) => items.some((item) => item.groupId !== group.id))
  if (otherGroups.length > 0) {
    template.push({
      label: '全部移动到分组',
      submenu: otherGroups.map((group) => ({
        label: group.name,
        click: () => {
          updateItems(list, { groupId: group.id })
          pushState()
        }
      }))
    })
  }

  template.push({ type: 'separator' })
  template.push({
    label: `从收纳盒移除这 ${items.length} 项`,
    click: () => {
      void removeItemsConfirmed(list).then(() => pushState())
    }
  })

  const release = lockAutoHide()
  const menu = Menu.buildFromTemplate(template)
  menu.popup({
    window: win,
    callback: () => release()
  })
}

/**
 * 批量移除前先确认。
 *
 * 单条移除一直是不问的 —— 点错了右键菜单再补回来也就两步。但批量移除
 * 一次能带走二三十条记录，误触的代价是重新拖一遍全部内容，值得多一次确认。
 */
export async function removeItemsConfirmed(ids: string[]): Promise<number> {
  const list = [...new Set(ids)].filter((id) => findItem(id))
  if (list.length === 0) return 0
  if (list.length === 1) {
    removeItem(list[0])
    return 1
  }

  const win = getWindow()
  if (!win) return 0

  const release = lockAutoHide()
  try {
    const result = await dialog.showMessageBox(win, {
      type: 'warning',
      title: '从收纳盒移除',
      message: `从收纳盒移除 ${list.length} 项？`,
      detail: '只删掉盒子里的记录，磁盘上的原文件不会被移动或删除。',
      buttons: ['移除', '取消'],
      defaultId: 1,
      cancelId: 1,
      noLink: true
    })
    if (result.response !== 0) return 0
    return removeItems(list)
  } finally {
    release()
  }
}

/* ------------------------------------------------------------------ 系统图标 */

/**
 * 快捷方式 / 可执行文件的「原图标」。
 *
 * 只有 .lnk .exe .url .ico 走这条路（见 shared/icons.ts）：用户对快捷方式认的就是
 * 它指向的那个程序的图标，画个通用「窗口」等于没给信息。
 *
 * 每次 app.getFileIcon 都要问一遍 shell，几十个文件会肉眼可见地卡，所以必须缓存。
 * 缓存按路径存、进程内有效：换了图标要重启才看得到，这个代价可以接受。
 */
const ICON_CACHE_LIMIT = 300
const iconCache = new Map<string, string | null>()

/**
 * 卡片上图标实际渲染的边长。
 * .tile__visual 是 34px（紧凑模式 27px），2x 屏要 68px 才够清晰，
 * 取 64 兼顾清晰度与 data URL 体积（256×256 原图直接塞会又大又糊）。
 */
const ICON_SIZE = 64

/** 图标源本身就是一张图（.ico / .png / .jpg）：直接读文件，别去问 shell */
const RASTER_ICON = /\.(ico|png|jpe?g|bmp)$/i

/**
 * 取图标前先算出「该问谁要图标」。
 *
 * 快捷方式是这里的坑：直接 app.getFileIcon('xxx.lnk') 拿到的是系统画的
 * 「白纸 + 蓝箭头」占位图，两个不同的快捷方式长得一模一样，等于没有信息。
 * 必须先用 shell.readShortcutLink 解析出它指向的程序（或它自定义的图标文件）再取。
 *
 * 光有路径还不够，索引也得带上：桌面图标是 (IconLocation 文件, 索引) 这一对决定的，
 * 比如夸克网盘是 quark.exe 的第 8 个图标。只取路径会把索引丢掉，取到的就是第 0 个。
 *
 * .url（Internet 快捷方式）同理，图标写在文本的 IconFile 里，见 url-icon.ts。
 */

/**
 * 相对路径的 IconLocation（典型是 "shell32.dll,14"）要按 System32 解析，
 * 这是资源管理器自己的规则；直接 existsSync('shell32.dll') 永远为假。
 */
function absoluteIconPath(file: string): string {
  if (!file) return ''
  if (isAbsolute(file)) return file
  const system32 = join(process.env.SystemRoot || 'C:\\Windows', 'System32', file)
  return existsSync(system32) ? system32 : file
}

/**
 * .lnk 是否指向文件夹（目标存在时才算）。
 *
 * 这类快捷方式显示系统图标时拿到的仍是 Windows 那张黄蓝文件夹图，
 * 跟界面里自绘的矢量文件夹完全两套语言，所以整体按文件夹处理。
 */
function isShortcutToDirectory(ext: string, target: string): boolean {
  if (ext !== 'lnk') return false
  try {
    const link = shell.readShortcutLink(target)
    if (!link.target) return false
    // 用户自己给快捷方式设过图标就尊重原图；只接管「用目标默认图标」的那类
    if (splitIconLocation(link.icon, link.iconIndex).file) return false
    return statSync(link.target).isDirectory()
  } catch {
    return false
  }
}

function iconSource(target: string, ext: string): IconSource {
  if (ext === 'url') {
    // IconFile 指向的图标往往就是这个快捷方式唯一的「身份」，不用它就只能给通用占位图
    const fromUrl = urlIconSource(target)
    if (fromUrl) return fromUrl
    return { file: target, index: 0 }
  }
  if (ext !== 'lnk') return { file: target, index: 0 }
  try {
    const link = shell.readShortcutLink(target)
    const custom = splitIconLocation(link.icon, link.iconIndex)
    const customFile = absoluteIconPath(custom.file)
    if (customFile && existsSync(customFile)) return { file: customFile, index: custom.index }
    // 快捷方式没设图标 → 资源管理器就用目标程序自己的第 0 个图标
    if (link.target && existsSync(link.target)) return { file: link.target, index: 0 }
  } catch {
    /* 快捷方式损坏或没有权限，退回问它自己 */
  }
  return { file: target, index: 0 }
}

/**
 * 系统对「不带图标资源的 exe」统一画一张通用占位图。
 * 拿一张垃圾内容的 .exe 问一次系统，就知道这张图长什么样 —— 比硬编码尺寸或
 * 字节数稳，因为不同 Windows 版本/DPI 下这张图并不一样。
 * 只在第一次需要判断时算一遍，之后用缓存。
 */
let genericIconHash: string | null | undefined

function digest(image: NativeImage): string {
  return createHash('sha1').update(image.toPNG()).digest('hex')
}

async function genericHash(): Promise<string | null> {
  if (genericIconHash !== undefined) return genericIconHash
  const probe = join(tmpdir(), `desk-box-icon-probe-${process.pid}.exe`)
  try {
    writeFileSync(probe, 'desk-box icon probe')
    const image = await app.getFileIcon(probe, { size: 'large' })
    genericIconHash = image.isEmpty() ? null : digest(image)
  } catch {
    genericIconHash = null
  } finally {
    try {
      rmSync(probe, { force: true })
    } catch {
      /* 临时文件，删不掉也不影响取图标 */
    }
  }
  return genericIconHash ?? null
}

/**
 * exe 里一个图标资源都没有时，去它所在目录找随包发的 .ico。
 * 有些应用是直接从 stock electron 改名出来的，exe 不带品牌图标，Windows 只能画
 * 通用图；但安装目录里往往躺着一张 256×256 的正版 logo（常见叫 uninstallerIcon.ico）。
 * 顺序：同名 ico → 约定的 icon/app → resources 下的 → 目录里唯一那个 ico。
 * 只在「exe 确认没有图标」时才走这条路，正常程序不会被打扰。
 */
function siblingIcon(path: string): string | null {
  const dir = dirname(path)
  const stem = basename(path, extname(path))
  const tried = [
    join(dir, `${stem}.ico`),
    join(dir, 'icon.ico'),
    join(dir, 'app.ico'),
    join(dir, 'resources', 'icon.ico'),
    join(dir, 'resources', 'app.ico')
  ]
  for (const candidate of tried) {
    if (existsSync(candidate)) return candidate
  }
  try {
    const icons = readdirSync(dir).filter((name) => name.toLowerCase().endsWith('.ico'))
    // 目录里只有一个 ico，基本可以认定就是它的；多个就不猜了，猜错了更难看
    if (icons.length === 1) return join(dir, icons[0])
  } catch {
    /* 目录读不了就放弃 */
  }
  return null
}

export async function getItemIcon(id: string): Promise<string | null> {
  const item = getData().items.find((entry) => entry.id === id)
  if (!item) return null
  if (item.kind !== 'file' && item.kind !== 'folder') return null

  const ext = extname(item.target).slice(1).toLowerCase()
  if (!hasRealIcon(ext)) return null
  if (!existsSync(item.target)) return null
  // 指向文件夹的快捷方式：系统给的黄蓝文件夹图和矢量界面不搭，走渲染层的矢量文件夹
  if (isShortcutToDirectory(ext, item.target)) return null

  if (iconCache.has(item.target)) return iconCache.get(item.target) ?? null

  try {
    const source = iconSource(item.target, ext)

    // 首选：自己按 (文件, 索引) 提取，和资源管理器一致（含 PNG 帧的 exe、自定义 .ico 都能取对）
    // .dll 例外：shell32.dll / imageres.dll 这类系统资源库没有 ICON 资源，图标由系统内部映射，
    // 只能交给 shell（虽然拿不到指定索引，但总比空白强）
    let image = /\.dll$/i.test(source.file) ? null : extractIcon(source.file, source.index, ICON_SIZE)

    // 自己解析不出来（系统 DLL / 少见格式 / 资源损坏）才退回 shell。
    // 图标源是图片文件时直接读：.url 可能指到 png/jpg（Steam 库缓存就是），
    // 问 shell 只会得到一张「图片文件」的通用白纸图。
    if (!image || image.isEmpty()) {
      if (RASTER_ICON.test(source.file)) image = nativeImage.createFromPath(source.file)
      if (!image || image.isEmpty()) image = await app.getFileIcon(source.file, { size: 'large' })
    }

    // 取到的和系统那张通用占位图一模一样 → 等于没图标，试试同目录的 ico
    if (!image.isEmpty()) {
      const generic = await genericHash()
      if (generic !== null && digest(image) === generic) {
        const fallback = siblingIcon(source.file)
        const custom = fallback ? nativeImage.createFromPath(fallback) : null
        if (custom && !custom.isEmpty()) {
          // 品牌 ico 常常是 256×256，缩到 64 够 2x 屏，也免得 data URL 太大
          image = custom.resize({ width: 64, height: 64, quality: 'best' })
        }
      }
    }

    // 统一成卡片用的尺寸：图标可能是 256×256，直接塞 data URL 又大又糊。
    // 只给宽度，让它自己按比例缩 —— 库缓存里的游戏图标不一定是正方形
    if (!image.isEmpty() && image.getSize().width > ICON_SIZE) {
      image = image.resize({ width: ICON_SIZE, quality: 'best' })
    }

    const url = image.isEmpty() ? null : image.toDataURL()
    if (iconCache.size >= ICON_CACHE_LIMIT) {
      const oldest = iconCache.keys().next().value
      if (oldest !== undefined) iconCache.delete(oldest)
    }
    iconCache.set(item.target, url)
    return url
  } catch {
    // 取不到就走矢量图兜底，不要让卡片空着
    iconCache.set(item.target, null)
    return null
  }
}
