/**
 * 更新检查的纯逻辑：版本比较与状态文案。
 *
 * 刻意不碰 electron / electron-updater —— 主进程那份封装只负责把事件翻译成状态，
 * 真正的判断都在这里，方便无头验证。
 */
import type { UpdateState, UpdateStatus } from './types'

/** 去掉 `v` 前缀与首尾空白 */
export function normalizeVersion(raw: unknown): string {
  return String(raw ?? '')
    .trim()
    .replace(/^v/i, '')
}

interface ParsedVersion {
  nums: number[]
  /** 预发布标识（`-` 之后的部分），正式版为空数组 */
  pre: string[]
}

function parseVersion(raw: unknown): ParsedVersion {
  const text = normalizeVersion(raw)
  const dash = text.indexOf('-')
  const core = dash >= 0 ? text.slice(0, dash) : text
  const tail = dash >= 0 ? text.slice(dash + 1) : ''
  return {
    nums: core.split('.').map((part) => {
      const value = Number.parseInt(part, 10)
      return Number.isFinite(value) ? value : 0
    }),
    pre: tail.split('.').filter((part) => part.length > 0)
  }
}

function numericId(value: string): number | null {
  return /^\d+$/.test(value) ? Number.parseInt(value, 10) : null
}

/**
 * 语义化版本比较 —— `a > b` 返回 1，`a < b` 返回 -1，相等返回 0。
 *
 * 不能直接字符串比：`"0.6.10" < "0.6.9"` 是字符串比较的经典翻车点。
 * 带预发布后缀的小于同版本正式版（`0.1.0-beta.1 < 0.1.0`）。
 */
export function compareVersion(a: unknown, b: unknown): number {
  const left = parseVersion(a)
  const right = parseVersion(b)

  const width = Math.max(left.nums.length, right.nums.length)
  for (let i = 0; i < width; i += 1) {
    const x = left.nums[i] ?? 0
    const y = right.nums[i] ?? 0
    if (x !== y) return x > y ? 1 : -1
  }

  if (left.pre.length === 0 && right.pre.length === 0) return 0
  if (left.pre.length === 0) return 1
  if (right.pre.length === 0) return -1

  const depth = Math.max(left.pre.length, right.pre.length)
  for (let i = 0; i < depth; i += 1) {
    const x = left.pre[i]
    const y = right.pre[i]
    if (x === undefined) return -1
    if (y === undefined) return 1
    if (x === y) continue
    const xn = numericId(x)
    const yn = numericId(y)
    if (xn !== null && yn !== null) return xn > yn ? 1 : -1
    if (xn !== null) return -1
    if (yn !== null) return 1
    return x > y ? 1 : -1
  }
  return 0
}

/** `latest` 是否比 `current` 新 */
export function isNewerVersion(latest: unknown, current: unknown): boolean {
  return compareVersion(latest, current) > 0
}

/** 状态一句话文案 —— 设置页与托盘菜单共用，避免两边写岔 */
export function updateStatusText(state: UpdateState): string {
  switch (state.status) {
    case 'unsupported':
      return state.message || '当前版本不支持自动更新'
    case 'idle':
      return '尚未检查更新'
    case 'checking':
      return '正在检查更新…'
    case 'latest':
      return '已是最新版本'
    case 'available':
      return `发现新版本 ${state.latest}`
    case 'downloading':
      return `正在下载 ${state.latest} ${Math.max(0, Math.min(100, Math.round(state.percent)))}%`
    case 'downloaded':
      return `新版本 ${state.latest} 已就绪`
    case 'error':
      return state.message || '检查更新失败'
    default:
      return ''
  }
}

/** 有「值得用户看一眼」的事实时为真 —— 界面据此上强调色 */
export function updateNeedsAttention(status: UpdateStatus): boolean {
  return status === 'available' || status === 'downloaded'
}

/** 是否正在进行中（按钮转圈） */
export function updateBusy(status: UpdateStatus): boolean {
  return status === 'checking' || status === 'downloading'
}
