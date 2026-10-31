/**
 * 主进程与渲染进程共用的类型定义。
 * 这里的所有类型都必须能在 Node 与浏览器两套 tsconfig 下通过编译，
 * 因此不允许出现 electron / react 的类型引用。
 */

export type ItemKind = 'file' | 'folder' | 'link' | 'text'

/** 面板配色方案 */
export type ThemeId = 'wood' | 'night' | 'celadon' | 'indigo'

/** 收纳项。落盘时不含 icon，icon 由主进程在构建状态时临时附加。 */
export interface Item {
  id: string
  kind: ItemKind
  /** 显示名。用户可改名，留空时由 target 推导 */
  title: string
  /** 文件/文件夹：绝对路径；链接：URL；文本：正文 */
  target: string
  groupId: string
  note: string
  pinned: boolean
  createdAt: number
  lastOpenedAt: number
  openCount: number
}

/** 带派生信息的收纳项，仅存在于 IPC 传输层 */
export interface ItemView extends Item {
  /** 文件扩展名（小写、不含点）；文件夹、链接、文本为空串 */
  ext: string
  /** 文件是否还在原位 */
  exists: boolean
}

export interface Group {
  id: string
  name: string
  order: number
}

export interface Settings {
  alwaysOnTop: boolean
  /** 点到窗口外面就收起来 */
  hideOnBlur: boolean
  launchAtLogin: boolean
  hotkey: string
  /** 面板不透明度 0.78 - 1 */
  opacity: number
  /** 卡片尺寸 */
  density: 'compact' | 'comfortable'
  /** 面板配色 */
  theme: ThemeId
  /** 启动后台检查新版本 */
  autoCheckUpdate: boolean
  /** 发现新版本后自动下载（慢网络下建议关掉，手动点） */
  autoDownloadUpdate: boolean
}

export interface WindowBounds {
  x?: number
  y?: number
  width: number
  height: number
}

export interface AppData {
  version: number
  groups: Group[]
  items: Item[]
  settings: Settings
  window: WindowBounds
}

/** 渲染层提交的新增请求 */
export interface NewItemInput {
  kind: ItemKind
  target: string
  title?: string
  groupId?: string
  note?: string
}

export interface AppState {
  groups: Group[]
  items: ItemView[]
  settings: Settings
  /** 当前生效的全局快捷键；注册失败时为 null */
  activeHotkey: string | null
  platform: NodeJS.Platform
  version: string
}

/** 所有写操作的统一返回：带上最新状态，界面一次 setState 就够 */
export interface ActionResult {
  ok: boolean
  /** 需要提示给用户的文案（成功提示或失败原因） */
  message?: string
  state: AppState
}

/* ---------------------------------------------------------------- 更新 */

export type UpdateStatus =
  | 'unsupported'
  | 'idle'
  | 'checking'
  | 'latest'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'error'

export interface UpdateState {
  status: UpdateStatus
  /** 当前运行的版本号 */
  current: string
  /** 远端发现的新版本号；未知时为空串 */
  latest: string
  /** 下载进度 0..100，仅 status === 'downloading' 时有意义 */
  percent: number
  /** 失败原因或「不支持」的原因；状态正常时为空串 */
  message: string
  /** 最近一次检查完成的时刻（毫秒）；从未查过为 0 */
  checkedAt: number
  /** 新版本的更新说明，可能为空 */
  notes: string
  /** 能否在本应用内直接下载 —— false 时只能去发布页手动下 */
  canDownload: boolean
}

/** 设置页里「更新」那块的按钮动作 */
export type UpdateAction = 'check' | 'download' | 'install' | 'page'

export const IPC = {
  stateGet: 'state:get',
  stateChanged: 'state:changed',
  itemAdd: 'item:add',
  itemAddPaths: 'item:add-paths',
  itemUpdate: 'item:update',
  itemRemove: 'item:remove',
  itemOpen: 'item:open',
  itemReveal: 'item:reveal',
  itemCopy: 'item:copy',
  itemMenu: 'item:menu',
  itemDrag: 'item:drag',
  itemIcon: 'item:icon',
  groupAdd: 'group:add',
  groupRename: 'group:rename',
  groupRemove: 'group:remove',
  settingsPatch: 'settings:patch',
  pickFiles: 'dialog:pick-files',
  pickFolder: 'dialog:pick-folder',
  readClipboard: 'clipboard:read',
  openExternal: 'shell:open-external',
  exportData: 'data:export',
  importData: 'data:import',
  windowHide: 'win:hide',
  windowMinimize: 'win:minimize',
  windowTogglePin: 'win:toggle-pin',

  updateGet: 'update:get',
  updateCheck: 'update:check',
  updateDownload: 'update:download',
  updateInstall: 'update:install',
  updateOpenPage: 'update:open-page',
  updateChanged: 'update:changed'
} as const
