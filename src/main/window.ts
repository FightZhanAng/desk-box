import { BrowserWindow, screen } from 'electron'
import { join } from 'node:path'
import { getDevRendererUrl } from './launch-env'
import { appIconPath } from './paths'
import { getData, save } from './store'

let mainWindow: BrowserWindow | null = null
let quitting = false
let boundsTimer: NodeJS.Timeout | null = null

/**
 * 打开原生对话框 / 右键菜单期间禁止「失焦自动收起」。
 * 这两种操作都会让窗口先失焦，不挡住的话对话框还没弹出来，收纳盒自己先没了。
 */
let autoHideLocks = 0

export function setQuitting(value: boolean): void {
  quitting = value
}

export function isQuitting(): boolean {
  return quitting
}

export function getWindow(): BrowserWindow | null {
  return mainWindow
}

export function lockAutoHide(): () => void {
  autoHideLocks += 1
  let released = false
  return () => {
    if (released) return
    released = true
    autoHideLocks = Math.max(0, autoHideLocks - 1)
  }
}

/** 旧坐标是否还落在某块屏幕的可见区域内（换显示器 / 改分辨率后会失效） */
function isOnScreen(x: number, y: number, width: number, height: number): boolean {
  return screen.getAllDisplays().some(({ workArea: a }) => {
    const overlapX = Math.min(x + width, a.x + a.width) - Math.max(x, a.x)
    const overlapY = Math.min(y + height, a.y + a.height) - Math.max(y, a.y)
    return overlapX > 120 && overlapY > 80
  })
}

export function createMainWindow(): BrowserWindow {
  const data = getData()
  const width = Math.max(340, data.window.width)
  const height = Math.max(420, data.window.height)
  const area = screen.getPrimaryDisplay().workArea

  let x = data.window.x
  let y = data.window.y
  if (x === undefined || y === undefined || !isOnScreen(x, y, width, height)) {
    // 首次启动贴在当前屏幕右侧偏上，像抽屉挂在桌沿
    x = area.x + area.width - width - 28
    y = area.y + Math.round((area.height - height) * 0.32)
  }

  mainWindow = new BrowserWindow({
    width,
    height,
    x,
    y,
    minWidth: 340,
    minHeight: 420,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    // 系统阴影会在透明窗口边缘留一圈灰边，圆角和投影都交给 CSS
    hasShadow: false,
    resizable: true,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    show: false,
    title: '桌面收纳盒',
    icon: appIconPath(),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
      backgroundThrottling: false
    }
  })

  mainWindow.setAlwaysOnTop(data.settings.alwaysOnTop, 'floating')

  // 环境变量在启动时已被清掉（防止被子进程继承），这里用清理前存下的副本
  const rendererUrl = getDevRendererUrl()
  if (rendererUrl) {
    void mainWindow.loadURL(rendererUrl)
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  /**
   * 显示窗口。
   * 透明窗口（transparent: true）在 Windows 上 ready-to-show 经常永远不触发，
   * 只挂那一个事件的结果是：进程好好活着、CDP 连得上，但桌面上什么都看不到。
   * 所以三条路都挂上，谁先来算谁。
   */
  let revealed = false
  const reveal = (): void => {
    if (revealed || !mainWindow || mainWindow.isDestroyed()) return
    revealed = true
    mainWindow.show()
  }

  mainWindow.once('ready-to-show', reveal)
  mainWindow.webContents.once('did-finish-load', reveal)
  const revealFallback = setTimeout(reveal, 1200)
  mainWindow.on('closed', () => clearTimeout(revealFallback))

  // 关闭按钮只是收进托盘，真正退出走托盘菜单或 before-quit
  mainWindow.on('close', (event) => {
    if (!quitting) {
      event.preventDefault()
      mainWindow?.hide()
    }
  })

  mainWindow.on('blur', () => {
    if (autoHideLocks > 0) return
    const settings = getData().settings
    if (settings.hideOnBlur && !mainWindow?.webContents.isDevToolsOpened()) {
      mainWindow?.hide()
    }
  })

  const persistTimer = (): void => {
    if (boundsTimer) clearTimeout(boundsTimer)
    boundsTimer = setTimeout(() => {
      boundsTimer = null
      if (!mainWindow || mainWindow.isDestroyed()) return
      const b = mainWindow.getBounds()
      const current = getData()
      current.window = { x: b.x, y: b.y, width: b.width, height: b.height }
      save(current)
    }, 400)
  }

  mainWindow.on('move', persistTimer)
  mainWindow.on('resize', persistTimer)

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  return mainWindow
}

export function toggleWindow(forceShow?: boolean): void {
  const win = mainWindow
  if (!win || win.isDestroyed()) return

  const shouldShow = forceShow ?? !win.isVisible()
  if (shouldShow) {
    win.show()
    win.focus()
  } else {
    win.hide()
  }
}

export function showWindow(): void {
  toggleWindow(true)
}

export function applyAlwaysOnTop(value: boolean): void {
  mainWindow?.setAlwaysOnTop(value, 'floating')
}

/** 退出前把窗口位置和待写数据落盘，避免防抖计时器被进程退出吃掉 */
export function flushBounds(): void {
  if (boundsTimer) {
    clearTimeout(boundsTimer)
    boundsTimer = null
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    const b = mainWindow.getBounds()
    const current = getData()
    current.window = { x: b.x, y: b.y, width: b.width, height: b.height }
    save(current, true)
  }
}
