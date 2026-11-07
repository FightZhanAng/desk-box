import { app, Menu, nativeImage, shell, Tray } from 'electron'
import type { MenuItemConstructorOptions } from 'electron'
import { addItem, promptAddFiles, promptAddFolder, pushState, readClipboardText } from './actions'
import { applyLaunchAtLogin } from './login-item'
import { appIconPath, trayIconPath } from './paths'
import { dataFile, getData, save } from './store'
import { toggleWindow } from './window'

let tray: Tray | null = null

/** 资源缺失时的兜底：1x1 透明 PNG，保证 Tray 构造不抛错 */
const FALLBACK_ICON =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAHElEQVQ4jWNgGAWjYBSMglEwCkbBKBgFo2AUAAAGgAAB6J3sQwAAAABJRU5ErkJggg=='

function loadTrayImage(): Electron.NativeImage {
  let image = nativeImage.createFromPath(trayIconPath())
  if (image.isEmpty()) image = nativeImage.createFromPath(appIconPath())
  if (image.isEmpty()) image = nativeImage.createFromDataURL(FALLBACK_ICON)

  // Windows 上别在这里 resize：托盘要的 HICON 由 Electron 按 SM_CXSMICON
  // （150% 缩放时是 24px）向多尺寸 .ico 取，1:1 出图。手动缩到 16px 再交给系统
  // 拉伸，就是 16→24 的插值糊。macOS 的托盘仍是逻辑 16pt，按原来的尺寸归一。
  if (process.platform === 'win32') return image
  return image.resize({ width: 16, height: 16, quality: 'best' })
}

/** 设置变了（置顶 / 自启 / 快捷键）就要重建菜单，否则勾选状态停在旧值上 */
export function refreshTrayMenu(): void {
  if (!tray) return
  const settings = getData().settings

  const template: MenuItemConstructorOptions[] = [
    {
      label: '显示收纳盒',
      accelerator: settings.hotkey || undefined,
      click: () => toggleWindow()
    },
    { type: 'separator' },
    {
      label: '收纳文件…',
      click: () => {
        void promptAddFiles().then(() => pushState())
      }
    },
    {
      label: '收纳文件夹…',
      click: () => {
        void promptAddFolder().then(() => pushState())
      }
    },
    {
      label: '收纳剪贴板内容',
      enabled: readClipboardText().trim().length > 0,
      click: () => {
        const text = readClipboardText().trim()
        if (!text) return
        addItem({ kind: 'text', target: text })
        pushState()
      }
    },
    { type: 'separator' },
    {
      label: '窗口置顶',
      type: 'checkbox',
      checked: settings.alwaysOnTop,
      click: (menuItem) => {
        const data = getData()
        data.settings.alwaysOnTop = menuItem.checked
        save(data)
        pushState()
        refreshTrayMenu()
      }
    },
    {
      label: '开机自动启动',
      type: 'checkbox',
      checked: settings.launchAtLogin,
      click: (menuItem) => {
        const data = getData()
        data.settings.launchAtLogin = menuItem.checked
        save(data)
        applyLaunchAtLogin(menuItem.checked)
        pushState()
        refreshTrayMenu()
      }
    },
    { type: 'separator' },
    {
      label: '打开数据文件夹',
      click: () => {
        shell.showItemInFolder(dataFile())
      }
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        app.quit()
      }
    }
  ]

  tray.setContextMenu(Menu.buildFromTemplate(template))
}

export function createTray(): void {
  tray = new Tray(loadTrayImage())
  tray.setToolTip('桌面收纳盒')
  // 左键点一下就是开关，符合「抽屉」的直觉
  tray.on('click', () => toggleWindow())
  tray.on('double-click', () => toggleWindow(true))
  refreshTrayMenu()
}
