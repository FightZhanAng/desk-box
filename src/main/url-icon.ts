/**
 * .url（Internet 快捷方式）的图标从哪来。
 *
 * 这类文件不是二进制快捷方式，图标写在文本里 —— 就是 `IconFile` / `IconIndex` 两行。
 * 直接 app.getFileIcon('xxx.url') 拿到的是系统画的「白纸 + 小地球」通用图，
 * 所有 .url 长得一模一样。桌面上摆三五个 Steam 游戏，就是三五个同样的占位图。
 *
 * 解析规则照资源管理器来：
 *   - IconFile 可以指 .ico，也可以指 exe/dll（此时 IconIndex 选第几个图标）
 *   - 值里可能有 %SystemRoot% 这类环境变量
 *   - 相对路径按 .url 自己所在的目录解析
 *   - IconFile 指向的文件没了（Steam 换库、重装会清掉 steam/games 下的缓存 ico），
 *     就按 appid 去 Steam 自己的 librarycache 里找官方图标
 */

import { existsSync, readFileSync } from 'node:fs'
import { dirname, isAbsolute, join } from 'node:path'

export interface IconSource {
  file: string
  index: number
}

/**
 * Electron 的 readShortcutLink 把 IconLocation 拆成了两个字段：
 * `icon` 只有路径（"shell32.dll"），索引单独在 `iconIndex`。
 * 但 .url 的 IconFile、以及老版本/手工写的快捷方式偶尔把 ",14" 塞在路径里，
 * 所以两种都要认。
 */
export function splitIconLocation(value: unknown, index: unknown): IconSource {
  const numeric = typeof index === 'number' && Number.isFinite(index) ? index : 0
  if (typeof value !== 'string' || !value.trim()) return { file: '', index: numeric }
  const match = value.match(/^(.*?)(?:,\s*(-?\d+))\s*$/)
  if (!match) return { file: value.trim(), index: numeric }
  // 路径自带索引时以它为准（iconIndex 此时通常是 0，是 Electron 的默认值）
  return { file: match[1].trim(), index: Number.parseInt(match[2], 10) || 0 }
}

/** .url 是 INI 文本，Windows 写的是 ANSI（中文路径就是 GBK），也可能是 UTF-16/UTF-8 */
function readUrlText(file: string): string | null {
  let buf: Buffer
  try {
    buf = readFileSync(file)
  } catch {
    return null
  }
  if (buf.length === 0) return null
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) return buf.toString('utf16le')

  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf)
  } catch {
    // 不是合法 UTF-8 → 基本就是系统 ANSI 代码页（简中是 GBK）
    try {
      return new TextDecoder('gbk').decode(buf)
    } catch {
      return buf.toString('latin1')
    }
  }
}

/** Windows 自己会展开 %SystemRoot% 这类变量，这里也照做 */
function expandEnv(value: string): string {
  return value.replace(/%([^%]+)%/g, (whole, name: string) => process.env[name] ?? whole)
}

/**
 * IconFile 指向的 .ico 不在了：按 appid 去 Steam 的 librarycache 找官方图标。
 * 路径从 IconFile 反推（<steam>/steam/games/<hash>.ico → <steam>），
 * 这样不用查注册表，也不怕 Steam 装在非默认目录。
 */
function steamLibraryIcon(url: string, iconFile: string): string | null {
  const appid = /steam:\/\/rungameid\/(\d+)/i.exec(url)?.[1]
  if (!appid || !iconFile) return null
  if (!/[\\/]steam[\\/]games[\\/][^\\/]+$/i.test(iconFile)) return null

  // <steam>/steam/games/xxx.ico 往上三层才是 Steam 根目录
  const root = dirname(dirname(dirname(iconFile)))
  const cache = join(root, 'appcache', 'librarycache')
  const candidates = [
    join(cache, `${appid}_icon.jpg`),
    join(cache, `${appid}_logo.png`),
    join(cache, `${appid}_logo_schinese.png`)
  ]
  return candidates.find((path) => existsSync(path)) ?? null
}

/**
 * 读出 .url 该用哪个文件、第几个图标。
 * 解析不出来（或者 IconFile 指向的文件已消失且没有 Steam 缓存）返回 null，
 * 调用方会退回问 shell —— 至少不会让卡片空着。
 */
export function urlIconSource(target: string): IconSource | null {
  const text = readUrlText(target)
  if (!text) return null

  let iconFile = ''
  let iconIndex = 0
  let url = ''

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith(';') || line.startsWith('[')) continue
    const eq = line.indexOf('=')
    if (eq <= 0) continue
    const key = line.slice(0, eq).trim().toLowerCase()
    const value = line.slice(eq + 1).trim()
    if (key === 'iconfile') iconFile = value.replace(/^"(.*)"$/, '$1')
    else if (key === 'iconindex') iconIndex = Number.parseInt(value, 10) || 0
    else if (key === 'url') url = value
  }

  const picked = splitIconLocation(iconFile, iconIndex)
  let file = expandEnv(picked.file)
  if (file && !isAbsolute(file)) file = join(dirname(target), file)

  if (file && existsSync(file)) return { file, index: picked.index }

  const cached = steamLibraryIcon(url, file)
  if (cached) return { file: cached, index: 0 }

  return null
}
