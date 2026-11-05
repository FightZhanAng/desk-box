const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')
// 相对脚本自身定位，换机器、换目录都能跑
const dir = __dirname + path.sep
// 64 位装在 Program Files，32 位装在 Program Files (x86)，两处都试
const edgeCandidates = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
]
const edge = edgeCandidates.find((p) => fs.existsSync(p))
if (!edge) {
  console.error('找不到 Edge，无法跑原型冒烟测试')
  process.exit(1)
}

const html = fs.readFileSync(dir + 'index.html', 'utf8')

const probe = String.raw`
<script>
addEventListener('load', function () {
  var out = []
  function ok(label, cond) { out.push((cond ? 'PASS ' : 'FAIL ') + label) }
  function shot(section, label) {
    var arts = document.querySelectorAll(section + ' .shot')
    for (var i = 0; i < arts.length; i++) {
      var h = arts[i].querySelector('.shot__label h3')
      if (h && h.textContent === label) return arts[i]
    }
    return null
  }
  try {
    var win = document.getElementById('live-window')
    ok('live-mounted', !!win && win.innerHTML.length > 2000)
    ok('live-tiles-22', win.querySelectorAll('.tile').length === 22)
    ok('titlebar-text', win.querySelector('.titlebar__name').textContent === '收纳盒')
    ok('dock-4-actions', win.querySelectorAll('.dock-btn').length === 4)
    ok('pinned-first', win.querySelector('.tile').getAttribute('data-id') === 'i1')
    ok('missing-tile-red', !!win.querySelector('.tile.is-missing'))
    ok('tabs-count', win.querySelectorAll('.tabs .pill').length === 8)

    /* ---- 快照 ---- */
    ok('shots-11', document.querySelectorAll('#shots .shot').length === 11)
    ok('settings-shots-6', document.querySelectorAll('#settings-shots .shot').length === 6)
    ok('frames-17', document.querySelectorAll('.shot__frame .win').length === 17)
    ok('shot-empty', !!shot('#shots', '空分组') && !!shot('#shots', '空分组').querySelector('.empty__title'))
    ok('shot-search', !!shot('#shots', '搜索无结果').querySelector('.empty__title'))
    ok('shot-select', !!shot('#shots', '多选批量条').querySelector('.selectbar'))
    ok('shot-ctx', !!shot('#shots', '右键菜单').querySelector('.ctx'))
    ok('shot-sort', shot('#shots', '排序菜单').querySelectorAll('.ctx__item').length === 5)
    /* 整理模式：工作组 7 项里有 2 项固定，固定项不参与拖拽，故只有 5 张可拖 */
    ok('shot-arrange', shot('#shots', '整理模式').querySelectorAll('.tile').length === 7 &&
      shot('#shots', '整理模式').querySelectorAll('.tile[draggable="true"]').length === 5)
    ok('shot-drop', !!shot('#shots', '拖入投放').querySelector('.dropzone'))
    ok('shot-peek', !!shot('#shots', '片段预览').querySelector('.peek__body'))
    ok('shot-sheet', !!shot('#shots', '收一条链接').querySelector('.sheet'))
    ok('shot-more', !!shot('#shots', '分组收纳').querySelector('.ctx'))
    ok('shot-settings', !!shot('#settings-shots', '设置面板').querySelector('.settings'))
    ok('shot-update-alert', !!shot('#settings-shots', '发现新版本').querySelector('.update-card.is-alert'))
    ok('shot-update-bar', shot('#settings-shots', '下载中').querySelector('.update-card__bar i').getAttribute('style').indexOf('62') > -1)
    ok('shot-night', !!shot('#settings-shots', '夜墨 · 紧凑').querySelector('.win[data-theme="night"]'))
    ok('shot-frequent', shot('#settings-shots', '青瓷 · 常用').querySelectorAll('.tile').length === 10)
    ok('shots-inputs-disabled', Array.prototype.every.call(document.querySelectorAll('.shot__frame input'), function (i) { return i.disabled }))

    /* ---- 交互：设置开关 ---- */
    win.querySelector('[data-act="settings"]').click()
    ok('open-settings', !!win.querySelector('.settings'))
    win.querySelector('[data-act="close-settings"]').click()
    ok('close-settings', !win.querySelector('.settings'))

    /* ---- 交互：切分组 ---- */
    win.querySelector('[data-act="group"][data-id="g-tools"]').click()
    ok('group-tools-5', win.querySelectorAll('.tile').length === 5)
    ok('group-active-pill', win.querySelector('.pill.is-active').textContent.indexOf('工具') === 0)

    /* ---- 交互：搜索 ---- */
    var input = win.querySelector('[data-live="search"]')
    function type(v) {
      input = win.querySelector('[data-live="search"]')
      input.value = v
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input = win.querySelector('[data-live="search"]')
    }
    type('脉')
    ok('search-no-hit', !!win.querySelector('.empty__title'))
    /* 检索按当前分组过滤，拼音首字母用例要落在「周报模板」所在的「工作」分组 */
    type('')
    win.querySelector('[data-act="group"][data-id="g-work"]').click()
    type('zbmb')
    ok('search-initials', win.querySelectorAll('.tile').length === 1)
    type('')
    win.querySelector('[data-act="group"][data-id="g-tools"]').click()
    ok('search-cleared', win.querySelectorAll('.tile').length === 5)

    /* ---- 交互：多选 ---- */
    win.querySelector('.tile').dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true }))
    ok('ctrl-multi-select', !!win.querySelector('.selectbar'))
    win.querySelector('[data-act="b-all"]').click()
    ok('select-all', win.querySelector('.selectbar__count').textContent.indexOf('5') > -1)
    win.querySelector('[data-act="b-remove"]').click()
    ok('batch-remove', !win.querySelector('.selectbar') && win.querySelectorAll('.tile').length === 0)
    win.querySelector('[data-act="group"][data-id="__all__"]').click()

    /* ---- 交互：右键清多选并出菜单 ---- */
    win.querySelector('.tile').dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true }))
    win.querySelector('.tile').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))
    ok('context-clears-selection', !!win.querySelector('.ctx') && !win.querySelector('.selectbar'))
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    ok('esc-closes-menu', !win.querySelector('.ctx'))

    /* ---- 交互：片段预览 ---- */
    var txt = null
    win.querySelectorAll('.tile').forEach(function (t) { if (t.querySelector('.glyph--text')) txt = t })
    txt.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
    ok('peek-opens', !!win.querySelector('.peek'))
    ok('peek-count', /\d+ 字 · \d+ 行/.test(win.querySelector('.peek__count').textContent))
    win.querySelector('[data-act="peek-copy"]').click()
    ok('peek-copy-label', win.querySelector('[data-act="peek-copy"]').textContent.indexOf('已复制') === 0)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    ok('peek-esc', !win.querySelector('.peek'))

    /* ---- 交互：失效路径 ---- */
    var miss = win.querySelector('.tile.is-missing')
    miss.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
    ok('missing-warn-toast', !!win.querySelector('.toast.is-warn'))

    /* ---- 交互：排序 + 整理模式 ---- */
    win.querySelector('[data-act="sort"]').click()
    ok('sort-menu-open', win.querySelectorAll('.ctx__item').length === 5)
    win.querySelector('[data-act="set-sort"][data-id="name"]').click()
    ok('sort-by-name', win.querySelector('.sortbtn').getAttribute('title').indexOf('按名称') > -1)
    win.querySelector('[data-act="sort"]').click()
    win.querySelector('[data-act="toggle-arrange"]').click()
    ok('arrange-mode', win.querySelectorAll('.tile.is-arranging').length > 0)
    ok('pinned-not-draggable', Array.prototype.every.call(
      document.querySelectorAll('#live-window .tile.is-pinned'),
      function (t) { return !t.hasAttribute('draggable') }
    ))
    win.querySelector('[data-act="sort"]').click()
    win.querySelector('[data-act="toggle-arrange"]').click()

    /* ---- 交互：设置里的密度 / 主题 / 开关 / 不透明度 ---- */
    win.querySelector('[data-act="settings"]').click()
    win.querySelector('[data-density-pick="compact"]').click()
    ok('density-compact', win.getAttribute('data-density') === 'compact')
    win.querySelector('[data-theme-pick="night"]').click()
    ok('theme-night', win.getAttribute('data-theme') === 'night')
    var sw = win.querySelector('[data-toggle="hideOnBlur"]')
    sw.click()
    ok('toggle-switch', win.querySelector('[data-toggle="hideOnBlur"]').classList.contains('is-on'))
    var range = win.querySelector('[data-live="alpha"]')
    range.value = '0.5'
    range.dispatchEvent(new Event('input', { bubbles: true }))
    ok('opacity-clamped', Math.abs(st.settings.opacity - 0.78) < 1e-9)
    win.querySelector('[data-theme-pick="indigo"]').click()
    win.querySelector('[data-density-pick="comfortable"]').click()
    win.querySelector('[data-act="close-settings"]').click()

    /* ---- 交互：收一条链接 ---- */
    var before = win.querySelectorAll('.tile').length
    win.querySelector('[data-act="add-link"]').click()
    ok('sheet-open', !!win.querySelector('.sheet'))
    var field = win.querySelector('[data-live="sheet"]')
    field.value = 'https://github.com/desk-box/releases'
    win.querySelector('[data-act="submit-sheet"]').click()
    ok('sheet-submit', win.querySelectorAll('.tile').length === before + 1)

    /* ---- token 纯度：计算样式里没有裸色值泄漏 ---- */
    var cs = getComputedStyle(win.querySelector('.btn--primary') || win.querySelector('.dock-btn'))
    ok('accent-resolves', /rgb/.test(cs.backgroundColor))
    var rootVars = getComputedStyle(document.documentElement)
    ok('token-bg', rootVars.getPropertyValue('--bg').trim() === '#eef6ff')
  } catch (err) {
    out.push('ERROR ' + err.message + ' @ ' + (err.stack || '').split('\n')[1])
  }
  var pre = document.createElement('pre')
  pre.id = 'smoke-result'
  pre.textContent = out.join('\n')
  document.body.appendChild(pre)
})
</scr` + `ipt>
`

fs.writeFileSync(dir + 'smoke.html', html.replace('</body>', probe + '</body>'), 'utf8')

const dom = execFileSync(
  edge,
  ['--headless=new', '--disable-gpu', '--virtual-time-budget=8000', '--dump-dom', 'file:///' + dir + 'smoke.html'],
  { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }
)
const m = /<pre id="smoke-result">([\s\S]*?)<\/pre>/.exec(dom)
if (!m) {
  console.log('probe missing; dom length=' + dom.length)
} else {
  const text = m[1].replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&')
  console.log(text)
  const fails = text.split('\n').filter((l) => l.startsWith('FAIL') || l.startsWith('ERROR'))
  console.log('\n--- ' + (fails.length ? fails.length + ' FAILING ---' : 'ALL PASS ---'))
  fails.forEach((f) => console.log(f))
}
