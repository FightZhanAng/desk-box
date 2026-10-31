import { app, clipboard, dialog, Menu, nativeImage, shell } from 'electron'
import type { MenuItemConstructorOptions, NativeImage } from 'electron'
import { createHash, randomUUID } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, extname, join } from 'node:path'
import type { AppState, Item, ItemView, NewItemInput, Settings } from '../shared/types'
import { clampOpacity, THEME_IDS } from '../shared/defaults'
import { hasRealIcon } from '../shared/icons'
import { hostOf, normalizeUrl } from '../shared/url'
import { getActiveHotkey, registerHotkey } from './hotkey'
import { appIconPath } from './paths'
import { getData, replaceData, save } from './store'
import { applyUpdateSettings } from './updater'
import { applyAlwaysOnTop, getWindow, lockAutoHide } from './window'

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
    return {
      ...item,
      exists: isPath ? existsSync(item.target) : true,
      ext: isPath ? extname(item.target).slice(1).toLowerCase() : ''
    }
  })

  // 固定项永远在最前；其余按加入时间倒序，刚拖进来的立刻出现在顶部
  items.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
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

function defaultTitle(kind: Item['kind'], target: string): string {
  if (kind === 'text') {
    const firstLine = target.split('\n')[0].trim()
    return firstLine.length > 24 ? `${firstLine.slice(0, 24)}…` : firstLine || '未命名片段'
  }
  if (kind === 'link') return hostOf(target) || target
  return basename(target) || target
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
      title: basename(target) || target,
      target,
      groupId: targetGroup,
      note: '',
      pinned: false,
      createdAt: Date.now(),
      lastOpenedAt: 0,
      openCount: 0
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
    openCount: 0
  })
  save(data)
  return true
}

/* ------------------------------------------------------------------ 修改 */

export function updateItem(id: string, patch: Record<string, unknown>): void {
  const data = getData()
  const item = data.items.find((it) => it.id === id)
  if (!item) return

  if (typeof patch.title === 'string') {
    const next = patch.title.trim()
    if (next) item.title = next
  }
  if (typeof patch.note === 'string') item.note = patch.note
  if (typeof patch.pinned === 'boolean') item.pinned = patch.pinned
  if (typeof patch.groupId === 'string' && data.groups.some((g) => g.id === patch.groupId)) {
    item.groupId = patch.groupId
  }
  save(data)
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

/* ------------------------------------------------------------------ 设置 */

export function patchSettings(patch: Partial<Settings>): void {
  const data = getData()

  // 渲染层递上来的 patch 也不能全信：透明度越界会把面板弄成全透、字压在壁纸上读不清；
  // 主题 id 拼错则整块配色塌回无色。这里兜一层，落盘的永远是合法值。
  if ('opacity' in patch) patch.opacity = clampOpacity(patch.opacity, data.settings.opacity)
  if (patch.theme !== undefined && !THEME_IDS.includes(patch.theme)) delete patch.theme

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
 * 取图标前先算出「该问谁要图标」。
 *
 * 快捷方式是这里的坑：直接 app.getFileIcon('xxx.lnk') 拿到的是系统画的
 * 「白纸 + 蓝箭头」占位图，两个不同的快捷方式长得一模一样，等于没有信息。
 * 必须先用 shell.readShortcutLink 解析出它指向的程序（或它自定义的图标文件）再取。
 */
function iconSource(target: string, ext: string): string {
  if (ext !== 'lnk') return target
  try {
    const link = shell.readShortcutLink(target)
    // icon 可能带 ",0" 这样的索引后缀，getFileIcon 不认，去掉
    const custom = typeof link.icon === 'string' ? link.icon.replace(/,\s*-?\d+$/, '') : ''
    if (custom && existsSync(custom)) return custom
    if (link.target && existsSync(link.target)) return link.target
  } catch {
    /* 快捷方式损坏或没有权限，退回问它自己 */
  }
  return target
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

  if (iconCache.has(item.target)) return iconCache.get(item.target) ?? null

  try {
    const source = iconSource(item.target, ext)
    // large = 48×48（exe 有的话）；.ico 直接按图片读，别再问 shell
    let image =
      ext === 'ico'
        ? nativeImage.createFromPath(source)
        : await app.getFileIcon(source, { size: 'large' })

    // 取到的和系统那张通用占位图一模一样 → 等于没图标，试试同目录的 ico
    if (!image.isEmpty()) {
      const generic = await genericHash()
      if (generic !== null && digest(image) === generic) {
        const fallback = siblingIcon(source)
        const custom = fallback ? nativeImage.createFromPath(fallback) : null
        if (custom && !custom.isEmpty()) {
          // 品牌 ico 常常是 256×256，缩到 64 够 2x 屏，也免得 data URL 太大
          image = custom.resize({ width: 64, height: 64, quality: 'best' })
        }
      }
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
