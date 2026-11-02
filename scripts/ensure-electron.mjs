/**
 * 确保 electron 的运行时二进制就位。
 *
 * 为什么需要这个脚本：
 * electron 43 起，包自己不再带 postinstall（registry 上 43.3.0 的 scripts 字段是空的），
 * 改成「谁 require('electron') 谁触发下载」。但 electron-vite 解析可执行文件路径时
 * 只读 node_modules/electron/path.txt，根本不 require 它 —— 于是二进制永远下不下来，
 * `pnpm dev` 直接抛 "Electron uninstall"。pnpm-workspace.yaml 里的 allowBuilds
 * 白名单对它也无效：没有 scripts 字段，就没有脚本可放行。
 *
 * 所以这里在安装阶段主动补一次，逻辑与 electron 自己的 install.js 一致（幂等，
 * 已装好会立刻返回），并沿用 dist.mjs 的镜像，避免国内网络下卡在下载那一步。
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const ELECTRON_DIR = join(ROOT, 'node_modules', 'electron')
const MIRROR = process.env.ELECTRON_MIRROR ?? 'https://npmmirror.com/mirrors/electron/'

function readTrim(file) {
  try {
    return readFileSync(file, 'utf8').trim()
  } catch {
    return ''
  }
}

/** 和 install.js 的 isInstalled 同样的判据：path.txt 与 dist/version 都在才算装好 */
function installed() {
  const exe = readTrim(join(ELECTRON_DIR, 'path.txt'))
  if (!exe) return false
  if (!existsSync(join(ELECTRON_DIR, 'dist', exe))) return false
  return readTrim(join(ELECTRON_DIR, 'dist', 'version')) !== ''
}

if (!existsSync(ELECTRON_DIR)) {
  // 还没装依赖（比如只跑了 pnpm install --prod），交给下一次安装
  process.exit(0)
}

if (installed()) process.exit(0)

console.log('[electron] 二进制缺失，开始下载（镜像：%s）', MIRROR)

const result = spawnSync(process.execPath, [join(ELECTRON_DIR, 'install.js')], {
  stdio: 'inherit',
  env: {
    ...process.env,
    ELECTRON_MIRROR: MIRROR,
    // 本机环境里可能带着它，会让 electron.exe 退化成普通 node
    ELECTRON_RUN_AS_NODE: undefined
  }
})

if (result.status === 0 && installed()) {
  console.log('[electron] 二进制已就位')
  process.exit(0)
}

// 下载失败不拦安装：离线 / 镜像不可达时先让 pnpm install 正常结束，
// 把明确的补救命令打出来，比让整个安装失败更有用。
console.warn(
  '\n[electron] 二进制下载失败，`pnpm dev` 会报 "Electron uninstall"。\n' +
    '  联网后手动执行：node scripts/ensure-electron.mjs\n'
)
process.exit(0)
