import { globalShortcut } from 'electron'
import { getData } from './store'
import { toggleWindow } from './window'

let active: string | null = null

export function getActiveHotkey(): string | null {
  return active
}

/**
 * 注册全局快捷键。
 * 返回 false 表示这个组合被别的程序占了 —— 界面要如实告诉用户，
 * 而不是显示一个按下去没反应的快捷键。
 */
export function registerHotkey(accelerator: string): boolean {
  globalShortcut.unregisterAll()
  active = null

  const trimmed = accelerator.trim()
  if (!trimmed) return false

  try {
    const ok = globalShortcut.register(trimmed, () => toggleWindow())
    if (ok) active = trimmed
  } catch {
    // 非法的 accelerator 字符串在这里抛错，当成注册失败处理
  }
  return active !== null
}

export function unregisterHotkey(): void {
  globalShortcut.unregisterAll()
  active = null
}

export function bootstrapHotkey(): void {
  registerHotkey(getData().settings.hotkey)
}
