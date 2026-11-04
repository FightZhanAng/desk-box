/**
 * 被拉起的程序会原样继承我们这一整块环境变量 —— 这正是「从盒子打开」和
 * 「桌面上双击」最大的区别：后者由 Explorer 启动，环境是干净的。
 *
 * 收纳盒平时是从终端 / IDE 里 `pnpm dev` 起来的，父进程会顺手塞进一批
 * 只属于它自己的东西：`NODE_OPTIONS=--require=…`（它自己的 shim）、
 * `ELECTRON_RUN_AS_NODE`，以及一整套 `WORKBUDDY_*` / `CODEBUDDY_*` / `CLAUDE_*`
 * （启动 PID、会话 ID、任务名、MCP 配置……）。它们对收纳盒自己没用，
 * 却会跟着 ShellExecute 传给每一个被打开的应用。
 *
 * 最典型的就是 WorkBuddy：它自己也读这些变量来决定「我是不是被谁拉起来的、
 * 该接管哪个会话」。从桌面双击时环境干净，它老老实实把已有窗口叫出来；
 * 从盒子里打开时带着上一份启动信息，它按「resume / 子进程」的路子初始化，
 * 窗口建出来了但内容一直不加载 —— 整窗白。
 *
 * 所以在启动时把这批「只属于启动者」的变量清掉，让子进程的环境回到跟桌面双击一致。
 * 清的是 process.env，只影响之后新建的进程；收纳盒自己已经起来了，不受影响。
 */
// 必须在清理之前取出来：窗口创建时还要用它加载 dev server
const devRendererUrl = process.env['ELECTRON_RENDERER_URL']

/** dev 态 electron-vite 注入的渲染层地址；打包后为 undefined */
export function getDevRendererUrl(): string | undefined {
  return devRendererUrl
}

const HOST_ONLY_ENV = [
  // 子进程会退化成普通 Node，Electron 应用连窗口都开不出来
  'ELECTRON_RUN_AS_NODE',
  // --require 别人的 shim，注入进每一个子进程（包括 Electron 的主进程）
  'NODE_OPTIONS',
  // Vite 的 dev server 会把它设成 development，子进程会据此走调试 / 开发分支
  'NODE_ENV',
  // 全局兜底模块搜索路径，可能命中启动者自己的依赖，桌面启动时本来没有
  'NODE_PATH',
  // 跟随启动者的证书链，桌面启动时本来就没有
  'NODE_EXTRA_CA_CERTS',
  // 关掉 asar 支持 → 打包应用找不到自己的资源，典型表现就是白屏
  'ELECTRON_NO_ASAR',
  // dev 下 electron-vite 注入的渲染层地址。别的 electron-vite 应用（WorkBuddy、
  // Token 计量器……）会把它当成自己的页面地址，拿自己的 preload 去加载收纳盒的
  // dev 页面，API 对不上，整窗白屏。窗口自己用的那份已提前存进 devRendererUrl。
  'ELECTRON_RENDERER_URL',
  // 这些只会让子进程多写日志 / 弹自己的错误框
  'ELECTRON_ENABLE_LOGGING',
  'ELECTRON_LOG_FILE',
  'ELECTRON_DEFAULT_ERROR_MODE'
]

/**
 * 前缀整组清掉：这些是 IDE / 智能体宿主自己的启动上下文，
 * 被打开的应用拿到只会误判自己的启动方式。
 */
const HOST_ONLY_PREFIXES = ['WORKBUDDY_', 'CODEBUDDY_', 'CLAUDE_']

export function sanitizeInheritedEnv(): void {
  for (const key of HOST_ONLY_ENV) {
    if (process.env[key] !== undefined) delete process.env[key]
  }
  for (const key of Object.keys(process.env)) {
    if (HOST_ONLY_PREFIXES.some((prefix) => key.startsWith(prefix))) delete process.env[key]
  }
}
