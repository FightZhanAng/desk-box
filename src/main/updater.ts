/**
 * 版本更新检查与自动下载。
 *
 * 引擎用 electron-updater：它读打包时生成的 app-update.yml（来自 electron-builder.yml
 * 的 publish 配置），先去 GitHub Release 上拉 latest.yml 比对版本，再按需下载差分包。
 *
 * 两种形态走不通，必须显式说明而不是假装「已是最新」：
 *   - 开发模式：没有 app-update.yml，checkForUpdates 直接抛错
 *   - 免安装版（portable）：没有一个稳定的安装目录可以覆盖，electron-updater 自己也会拒绝
 * 这两种情况下界面只提供「打开发布页」。
 */
import { app, shell } from 'electron'
import { autoUpdater } from 'electron-updater'
import type { ProgressInfo, UpdateInfo } from 'electron-updater'
import type { UpdateState } from '../shared/types'
import { isNewerVersion, normalizeVersion } from '../shared/update'

/** 启动后延迟这么久再检查 —— 别和开机那阵子抢 IO */
const STARTUP_DELAY_MS = 6_000

/** 后台周期检查间隔：6 小时。托盘常驻应用不重启，光靠启动那一次会一直停在旧版本 */
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000

export interface UpdateOptions {
  /** 每次现读设置，用户改了开关立刻生效 */
  getAutoCheck(): boolean
  getAutoDownload(): boolean
  /** 状态变化时回调（主进程负责广播给窗口） */
  onChange(state: UpdateState): void
  /** 发布页地址，「打开发布页」用它 */
  releasePage: string
}

/** 把 electron-updater 的英文错误翻成能看懂的一句话 */
function describeError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? '')
  if (!raw) return '检查更新失败'
  if (/ERR_INTERNET_DISCONNECTED|ENOTFOUND|ETIMEDOUT|ECONNREFUSED|ECONNRESET|net::/i.test(raw)) {
    return '网络不可达，稍后再试'
  }
  if (/app-update\.yml/i.test(raw)) return '缺少更新配置，需重新安装本应用'
  if (/\b404\b|not found|Cannot find/i.test(raw)) return '更新源上还没有发布版本'
  if (/403|rate limit|API rate|Could not get/i.test(raw)) return '更新源访问受限，稍后再试'
  return raw.length > 120 ? `${raw.slice(0, 117)}…` : raw
}

/** releaseNotes 有 string / 对象数组两种形态，统一压成一段纯文本 */
function flattenNotes(info: UpdateInfo): string {
  const notes = info.releaseNotes
  if (typeof notes === 'string') return notes.trim()
  if (Array.isArray(notes)) {
    return notes
      .map((entry) => {
        const note = (entry as { note?: unknown }).note
        return typeof note === 'string' ? note : ''
      })
      .join('\n')
      .trim()
  }
  return ''
}

/** 当前运行形态能不能用 electron-updater */
function supportOf(): { ok: boolean; reason: string } {
  if (!app.isPackaged) return { ok: false, reason: '开发模式：更新检查在打包后才生效' }
  // electron-builder 的 portable target 会注入这个变量
  if (process.env['PORTABLE_EXECUTABLE_DIR']) {
    return { ok: false, reason: '免安装版：请到发布页下载新版本' }
  }
  return { ok: true, reason: '' }
}

function safeVersion(): string {
  try {
    return normalizeVersion(app.getVersion())
  } catch {
    return ''
  }
}

class UpdateController {
  private state: UpdateState
  private readonly supported: boolean
  private readonly supportReason: string
  private wired = false
  private periodicTimer: NodeJS.Timeout | null = null
  private startupTimer: NodeJS.Timeout | null = null
  /** 自检/开发用的假版本号：设了它就不走网络，直接装成「发现新版本」 */
  private readonly fakeVersion: string

  constructor(private readonly options: UpdateOptions) {
    const support = supportOf()
    this.fakeVersion = (process.env['DESK_BOX_FAKE_UPDATE'] ?? '').trim()
    // 注入假版本时即使处在开发模式也当作「可检查」—— 否则 dev 下永远是 unsupported，
    // 更新界面根本没机会被看到/验证
    this.supported = support.ok || this.fakeVersion !== ''
    this.supportReason = support.reason

    this.state = {
      status: this.supported ? 'idle' : 'unsupported',
      current: safeVersion(),
      latest: '',
      percent: 0,
      message: this.supported ? '' : support.reason,
      checkedAt: 0,
      notes: '',
      canDownload: false
    }
  }

  describe(): UpdateState {
    return { ...this.state }
  }

  /**
   * 手动检查。
   * 正在检查/下载时直接忽略，免得连点堆出一串请求 ——
   * electron-updater 对并发 checkForUpdates 的处理并不友好。
   */
  check(): void {
    if (!this.supported) {
      this.set({ message: this.supportReason })
      return
    }
    if (this.state.status === 'checking' || this.state.status === 'downloading') return

    if (this.fakeVersion) {
      this.set({ status: 'checking', message: '' })
      const available = isNewerVersion(this.fakeVersion, this.state.current)
      this.set({
        status: available ? 'available' : 'latest',
        latest: available ? normalizeVersion(this.fakeVersion) : '',
        notes: available ? '（自检注入的假版本，没有真实更新说明）' : '',
        percent: 0,
        message: '',
        checkedAt: Date.now(),
        canDownload: available
      })
      return
    }

    this.set({ status: 'checking', message: '' })
    this.wire()
    autoUpdater.autoDownload = this.options.getAutoDownload()
    autoUpdater
      .checkForUpdates()
      .then((result) => {
        // 没有新版本时 electron-updater 只发事件、不回 info，这里兜个底，
        // 免得状态永远停在 checking
        if (!result?.updateInfo && this.state.status === 'checking') {
          this.set({ status: 'latest', latest: '', checkedAt: Date.now(), message: '' })
        }
      })
      .catch((error: unknown) => {
        this.set({ status: 'error', message: describeError(error), checkedAt: Date.now() })
      })
  }

  /** 手动开始下载（autoDownload 关掉时用） */
  download(): void {
    if (!this.supported) return
    if (this.state.status !== 'available') return
    if (this.fakeVersion) {
      this.set({ status: 'downloaded', percent: 100 })
      return
    }
    this.set({ status: 'downloading', percent: 0 })
    autoUpdater.downloadUpdate().catch((error: unknown) => {
      this.set({ status: 'error', message: describeError(error) })
    })
  }

  /**
   * 装完重启。只有用户明确点过按钮才会走到这里。
   * quitAndInstall 自己会触发 app.quit()，不需要额外设「正在退出」的标记。
   */
  install(): void {
    if (this.state.status !== 'downloaded') return
    if (this.fakeVersion) return
    setImmediate(() => autoUpdater.quitAndInstall())
  }

  openReleasePage(): void {
    void shell.openExternal(this.options.releasePage)
  }

  /** 启动时那一次自动检查（延迟一点，别和创建窗口/读数据抢 IO） */
  scheduleStartupCheck(): void {
    if (!this.supported || !this.options.getAutoCheck()) return
    if (this.startupTimer) clearTimeout(this.startupTimer)
    this.startupTimer = setTimeout(() => {
      this.startupTimer = null
      if (this.options.getAutoCheck()) this.check()
    }, STARTUP_DELAY_MS)
    this.startupTimer.unref?.()
  }

  /** 常驻应用的周期检查 */
  startPeriodicCheck(): void {
    if (!this.supported || this.periodicTimer) return
    this.periodicTimer = setInterval(() => {
      if (this.options.getAutoCheck()) this.check()
    }, CHECK_INTERVAL_MS)
    this.periodicTimer.unref?.()
  }

  /** 设置变化后同步 autoDownload；刚打开且有新版待下就立刻开始 */
  applySettings(): void {
    if (!this.supported) return
    this.wire()
    autoUpdater.autoDownload = this.options.getAutoDownload()
    if (autoUpdater.autoDownload && this.state.status === 'available') this.download()
  }

  dispose(): void {
    if (this.periodicTimer) clearInterval(this.periodicTimer)
    if (this.startupTimer) clearTimeout(this.startupTimer)
    this.periodicTimer = null
    this.startupTimer = null
  }

  /* ---------------------------------------------------------- 内部 */

  private set(patch: Partial<UpdateState>): void {
    this.state = { ...this.state, ...patch }
    this.options.onChange(this.describe())
  }

  /** 只在第一次真正要用的时候接线，免得开发模式下白注册一堆监听 */
  private wire(): void {
    if (this.wired) return
    this.wired = true

    // Windows 上 GUI 进程没有控制台，默认的 console 日志等于丢掉
    autoUpdater.logger = null
    autoUpdater.autoInstallOnAppQuit = true
    autoUpdater.autoRunAppAfterInstall = true
    // 只吃正式版：预发布包不该推给普通用户
    autoUpdater.allowPrerelease = false

    autoUpdater.on('checking-for-update', () => {
      this.set({ status: 'checking', message: '' })
    })

    autoUpdater.on('update-available', (info: UpdateInfo) => {
      const latest = normalizeVersion(info.version)
      const available = isNewerVersion(latest, this.state.current)
      this.set({
        status: available ? 'available' : 'latest',
        latest: available ? latest : '',
        notes: available ? flattenNotes(info) : '',
        percent: 0,
        message: '',
        checkedAt: Date.now(),
        canDownload: available
      })
      // autoDownload 打开时 electron-updater 会自己开始下，这里只是把状态先摆正
      if (available && autoUpdater.autoDownload) this.set({ status: 'downloading', percent: 0 })
    })

    autoUpdater.on('update-not-available', () => {
      this.set({
        status: 'latest',
        latest: '',
        notes: '',
        percent: 0,
        message: '',
        checkedAt: Date.now(),
        canDownload: false
      })
    })

    autoUpdater.on('download-progress', (progress: ProgressInfo) => {
      this.set({
        status: 'downloading',
        percent: Number.isFinite(progress?.percent) ? progress.percent : 0
      })
    })

    autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
      const latest = normalizeVersion(info.version) || this.state.latest
      this.set({
        status: 'downloaded',
        latest,
        percent: 100,
        message: '',
        checkedAt: Date.now(),
        canDownload: false
      })
    })

    autoUpdater.on('error', (error: Error) => {
      // 下载中途出错也要落到 error，用户才知道没在下了
      this.set({ status: 'error', message: describeError(error), checkedAt: Date.now() })
    })
  }
}

/* ------------------------------------------------------------------ 单例 */

let controller: UpdateController | null = null

export function initUpdater(options: UpdateOptions): void {
  controller = new UpdateController(options)
  controller.scheduleStartupCheck()
  controller.startPeriodicCheck()
}

export function getUpdateState(): UpdateState {
  if (!controller) {
    return {
      status: 'unsupported',
      current: safeVersion(),
      latest: '',
      percent: 0,
      message: '更新模块还没准备好',
      checkedAt: 0,
      notes: '',
      canDownload: false
    }
  }
  return controller.describe()
}

export function checkForUpdate(): UpdateState {
  controller?.check()
  return getUpdateState()
}

export function downloadUpdate(): UpdateState {
  controller?.download()
  return getUpdateState()
}

export function installUpdate(): void {
  controller?.install()
}

export function openReleasePage(): void {
  controller?.openReleasePage()
}

/** 设置里改了自动检查/自动下载后调用 */
export function applyUpdateSettings(): void {
  controller?.applySettings()
}

export function disposeUpdater(): void {
  controller?.dispose()
  controller = null
}
