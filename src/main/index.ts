import { app } from 'electron'
import { IPC } from '../shared/types'
import { bootstrapHotkey, unregisterHotkey } from './hotkey'
import { registerIpc } from './ipc'
import { createTray } from './tray'
import { flushNow, getData } from './store'
import { disposeUpdater, initUpdater } from './updater'
import { createMainWindow, flushBounds, getWindow, setQuitting, showWindow } from './window'

const APP_ID = 'com.tomcato.desk-box'

/** 「打开发布页」用的地址，也是托盘里那句「有新版本」的落地页 */
const RELEASE_PAGE = 'https://github.com/FightZhanAng/desk-box/releases/latest'

/** 已经有实例在跑时，第二次启动只是把已有窗口叫出来 */
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.setAppUserModelId(APP_ID)

  app.on('second-instance', () => {
    showWindow()
  })

  void app.whenReady().then(() => {
    registerIpc()
    createMainWindow()
    createTray()
    bootstrapHotkey()

    // 更新检查放在窗口之后：状态要广播给渲染层，窗口得先在
    initUpdater({
      // 每次现读设置，用户关掉自动检查立刻生效
      getAutoCheck: () => getData().settings.autoCheckUpdate,
      getAutoDownload: () => getData().settings.autoDownloadUpdate,
      onChange: (state) => {
        const win = getWindow()
        if (win && !win.isDestroyed()) win.webContents.send(IPC.updateChanged, state)
      },
      releasePage: RELEASE_PAGE
    })

    // macOS 下点 Dock 图标重新打开窗口
    app.on('activate', () => {
      showWindow()
    })
  })

  app.on('before-quit', () => {
    setQuitting(true)
    flushBounds()
    flushNow()
    unregisterHotkey()
    disposeUpdater()
  })

  // 托盘常驻：关掉窗口不等于退出应用
  app.on('window-all-closed', () => {
    /* 故意留空 */
  })
}
