/**
 * 开发 / 预览启动器（electron-vite dev | preview）。
 *
 * 存在的唯一理由：环境里只要有 ELECTRON_RUN_AS_NODE，electron.exe 就会退化成
 * 普通 Node —— 主进程里 `require('electron')` 拿到的是 npm 包那个「路径转发壳」，
 * 于是启动即崩，报错还完全看不出真正原因。这里直接摘掉。
 *
 * 用法与 electron-vite 一致：
 *   node scripts/electron-run.mjs dev
 *   node scripts/electron-run.mjs preview
 */
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const require = createRequire(import.meta.url)
const packageFile = require.resolve('electron-vite/package.json')
const pkg = JSON.parse(readFileSync(packageFile, 'utf-8'))
const binField = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin['electron-vite']
const cli = join(dirname(packageFile), binField)

const env = { ...process.env }
if (env.ELECTRON_RUN_AS_NODE !== undefined) {
  delete env.ELECTRON_RUN_AS_NODE
  console.log('[run] 环境里有 ELECTRON_RUN_AS_NODE，已为 electron 摘掉')
}

const child = spawn(process.execPath, [cli, ...process.argv.slice(2)], {
  cwd: ROOT,
  env,
  stdio: 'inherit'
})

child.on('exit', (code, signal) => {
  if (signal) {
    console.error(`[run] 被信号 ${signal} 终止`)
    process.exit(1)
  }
  process.exit(code ?? 1)
})
