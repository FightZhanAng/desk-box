import type { ActionResult, AppState, NewItemInput, Settings, UpdateState } from './types'

/**
 * preload 通过 contextBridge 暴露给渲染层的全部能力。
 * 单独抽到 shared 里，是为了让 preload 的实现和渲染层的调用共用同一份签名 ——
 * 两边各写一次类型，迟早会有一边忘了改。
 */
export interface DeskboxApi {
  getState(): Promise<AppState>

  addItem(input: NewItemInput): Promise<ActionResult>
  addPaths(paths: string[], groupId?: string): Promise<ActionResult>
  updateItem(id: string, patch: Record<string, unknown>): Promise<ActionResult>
  removeItem(id: string): Promise<ActionResult>

  openItem(id: string): Promise<ActionResult>
  revealItem(id: string): Promise<ActionResult>
  copyItem(id: string): Promise<ActionResult>

  /**
   * 批量改一组条目（固定 / 移动分组）。
   * 走一次 IPC、一次落盘、一次状态推送 —— 逐条调用在选中二三十项时
   * 会让界面闪很多次，也白白多写几十次磁盘。
   */
  updateItems(ids: string[], patch: Record<string, unknown>): Promise<ActionResult>
  /** 批量从收纳盒移除记录（同样不动磁盘上的原文件） */
  removeItems(ids: string[]): Promise<ActionResult>
  /** 批量打开：文件/文件夹走系统默认程序，链接走浏览器，文本片段跳过 */
  openItems(ids: string[]): Promise<ActionResult>

  /**
   * 手动排序：按给定顺序重排这些条目，只改动它们之间的位次。
   * 传的是「整理模式下当前看得见的那些 id」，按显示顺序排列。
   */
  reorderItems(ids: string[]): Promise<ActionResult>

  /**
   * 原生右键菜单（系统样式），不再由渲染层调用 —— 界面现在用自绘的
   * ItemMenu，才能跟上玻璃面板。留在这里当兜底：万一自绘菜单在某个
   * 环境里出问题，把它接回去就能用。
   */
  showItemMenu(id: string): void
  /** 同上，批量版本；渲染层目前也没在用 */
  showBatchMenu(ids: string[]): void
  /** 把条目拖到资源管理器 / 其他程序。只在 dragstart 里同步调用有效 */
  startDrag(id: string): void

  addGroup(name: string): Promise<ActionResult>
  renameGroup(id: string, name: string): Promise<ActionResult>
  removeGroup(id: string): Promise<ActionResult>
  /** 按给定顺序重排分组（拖拽胶囊或右键左移/右移都会走这里） */
  reorderGroups(ids: string[]): Promise<ActionResult>

  patchSettings(patch: Partial<Settings>): Promise<ActionResult>

  pickFiles(): Promise<ActionResult>
  pickFolder(): Promise<ActionResult>

  readClipboard(): Promise<string>
  openExternal(url: string): Promise<ActionResult>

  exportData(): Promise<ActionResult>
  importData(): Promise<ActionResult>

  hideWindow(): Promise<void>
  togglePin(): Promise<ActionResult>

  /**
   * Electron 32 起 File.path 被移除，取真实路径只能走 webUtils.getPathForFile。
   * 参数用 unknown 是为了不让 shared 依赖 DOM 的 File 类型。
   */
  getPathForFile(file: unknown): string

  /** 订阅主进程推送的状态变更，返回取消订阅函数 */
  onStateChanged(callback: (state: AppState) => void): () => void

  /**
   * 快捷方式 / 可执行文件的「系统原图标」，PNG data URL。
   * 不适用（普通文件）或取不到时为 null，界面回退到自绘矢量图。
   */
  getItemIcon(id: string): Promise<string | null>

  /* ------------------------------------------------------------ 更新 */

  getUpdate(): Promise<UpdateState>
  checkUpdate(): Promise<UpdateState>
  downloadUpdate(): Promise<UpdateState>
  installUpdate(): Promise<void>
  openUpdatePage(): Promise<void>
  /** 主进程检查/下载过程中会推状态，返回取消订阅函数 */
  onUpdateChanged(callback: (state: UpdateState) => void): () => void
}
