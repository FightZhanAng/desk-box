import type { AppData, Settings, ThemeId } from './types'

export const DATA_VERSION = 1

export const THEME_IDS: ThemeId[] = ['wood', 'night', 'celadon', 'indigo']

/** 主题的显示名。放在 THEME_IDS 旁边，加主题时不会漏掉一处 */
export const THEME_LABELS: Record<ThemeId, string> = {
  wood: '暖木',
  night: '夜墨',
  celadon: '青瓷',
  indigo: '靛蓝'
}

/**
 * 面板不透明度的可调范围。
 * 下限不能低于 0.78：再透一点，深色文字压在壁纸上就完全读不清了，
 * 而这个面板是常驻悬浮窗，不是偶尔瞄一眼的通知。
 */
export const OPACITY_MIN = 0.78
export const OPACITY_MAX = 1
export const OPACITY_STEP = 0.02

/** 把任意输入夹进合法区间，NaN 也当越界处理 */
export function clampOpacity(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(OPACITY_MAX, Math.max(OPACITY_MIN, value))
}

export const DEFAULT_SETTINGS: Settings = {
  alwaysOnTop: true,
  hideOnBlur: false,
  launchAtLogin: false,
  hotkey: 'Control+Shift+Space',
  opacity: 0.96,
  density: 'comfortable',
  theme: 'wood',
  // 后台静默检查不打扰人；下载却要手动点 ——
  // 到 GitHub 的带宽经常只有几十 KB/s，不该偷偷吃满
  autoCheckUpdate: true,
  autoDownloadUpdate: false
}

/**
 * 首次启动的分组。
 * 刻意不放示例收纳项 —— 示例里写死的文件路径在别人机器上必然失效，
 * 打开就是一堆红色「路径失效」，比空着更劝退。
 */
export function createDefaultData(): AppData {
  return {
    version: DATA_VERSION,
    groups: [
      { id: 'g-inbox', name: '待处理', order: 0 },
      { id: 'g-work', name: '工作', order: 1 },
      { id: 'g-tools', name: '工具', order: 2 }
    ],
    items: [],
    settings: { ...DEFAULT_SETTINGS },
    window: { width: 400, height: 580 }
  }
}

/** 把任意来源的旧数据补成当前结构，缺什么补什么，不抛错 */
export function normalizeData(raw: unknown): AppData {
  const base = createDefaultData()
  if (!raw || typeof raw !== 'object') return base
  const data = raw as Partial<AppData>

  const groups =
    Array.isArray(data.groups) && data.groups.length > 0
      ? data.groups
          .filter((g) => g && typeof g.id === 'string' && typeof g.name === 'string')
          .map((g, i) => ({ id: g.id, name: g.name, order: typeof g.order === 'number' ? g.order : i }))
      : base.groups

  const groupIds = new Set(groups.map((g) => g.id))
  const items = Array.isArray(data.items)
    ? data.items
        .filter((it) => it && typeof it.id === 'string' && typeof it.target === 'string')
        .map((it) => {
          const target = it.target
          let title = typeof it.title === 'string' ? it.title : ''
          // 老数据里快捷方式的标题是「xxx.lnk」。只在标题确实是自动生成的那个
          // 文件名时才截掉后缀 —— 用户手动改过的名字一律不动。
          const file = target.split(/[\\/]/).pop() ?? ''
          if (/\.lnk$/i.test(file) && (title === '' || title === file)) {
            title = file.slice(0, -4)
          }
          return {
            id: it.id,
            kind: (['file', 'folder', 'link', 'text'] as const).includes(it.kind as never)
              ? it.kind
              : ('text' as const),
            title,
            target,
            // 分组被删掉的项落到第一个分组，避免变成孤儿
            groupId: groupIds.has(it.groupId) ? it.groupId : groups[0].id,
            note: typeof it.note === 'string' ? it.note : '',
            pinned: it.pinned === true,
            createdAt: typeof it.createdAt === 'number' ? it.createdAt : Date.now(),
            lastOpenedAt: typeof it.lastOpenedAt === 'number' ? it.lastOpenedAt : 0,
            openCount: typeof it.openCount === 'number' ? it.openCount : 0
          }
        })
    : []

  const settings: Settings = {
    ...base.settings,
    ...(data.settings && typeof data.settings === 'object' ? data.settings : {})
  }

  // 关键字段逐项兜底：老数据里可能存着 0.62 这种过低的不透明度，
  // 直接沿用会让面板几乎全透、字压在壁纸上完全读不了
  if (!THEME_IDS.includes(settings.theme)) settings.theme = base.settings.theme
  if (settings.density !== 'compact' && settings.density !== 'comfortable') {
    settings.density = base.settings.density
  }
  settings.opacity = clampOpacity(settings.opacity, base.settings.opacity)
  if (typeof settings.hotkey !== 'string') settings.hotkey = base.settings.hotkey
  if (typeof settings.autoCheckUpdate !== 'boolean') {
    settings.autoCheckUpdate = base.settings.autoCheckUpdate
  }
  if (typeof settings.autoDownloadUpdate !== 'boolean') {
    settings.autoDownloadUpdate = base.settings.autoDownloadUpdate
  }

  return {
    version: DATA_VERSION,
    groups: groups.sort((a, b) => a.order - b.order),
    items,
    settings,
    window: { ...base.window, ...(data.window ?? {}) }
  }
}
