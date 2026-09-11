// 设置抽屉:上滑仪表盘呼出(跟手),桌面双击等效
import { settings, saveSettings, applyTheme, applyFilterPreset } from './settings.js';
import { state, resetCurrent } from './state.js';
import { setStatus, updateDash } from './ui.js';
import { releaseWake, requestWake } from './timer.js';
import { drawTrack } from './map.js';

var setPanel = document.getElementById('set-panel');
var setBackdrop = document.getElementById('set-backdrop');
var setOpen = false;

export function openSettings() {
  setOpen = true;
  setPanel.style.transform = '';
  setPanel.classList.add('open');
  setBackdrop.classList.add('show');
}
function closeSettings() {
  setOpen = false;
  setPanel.style.transform = '';
  setPanel.classList.remove('open');
  setBackdrop.classList.remove('show');
}
document.getElementById('set-close').addEventListener('click', closeSettings);
setBackdrop.addEventListener('click', closeSettings);

// 上滑仪表盘呼出(跟手);桌面双击仪表盘同样可开
var dashEl = document.getElementById('dash');
var swipeY = null, dragPx = 0;
dashEl.addEventListener('touchstart', function (e) {
  if (setOpen) return;
  swipeY = e.touches[0].clientY;
  dragPx = 0;
  setPanel.style.transition = 'none';
}, { passive: true });
dashEl.addEventListener('touchmove', function (e) {
  if (swipeY === null || setOpen) return;
  var dy = swipeY - e.touches[0].clientY;
  if (dy <= 0) { dragPx = 0; return; }
  dragPx = Math.min(dy, 180);
  e.preventDefault();
  setPanel.style.transform = 'translateY(calc(105% - ' + dragPx + 'px))';
}, { passive: false });
dashEl.addEventListener('touchend', function () {
  if (swipeY === null) return;
  setPanel.style.transition = '';
  if (dragPx > 70) openSettings();
  else setPanel.style.transform = '';
  swipeY = null; dragPx = 0;
});
dashEl.addEventListener('dblclick', function () { openSettings(); });

// ---------- 设置项绑定 ----------
var setWake = document.getElementById('set-wake');
var setTheme = document.getElementById('set-theme');
var setUnit = document.getElementById('set-unit');
var setFilter = document.getElementById('set-filter');
var setAp = document.getElementById('set-ap');
var setApBelow = document.getElementById('set-ap-below');
var setApAbove = document.getElementById('set-ap-above');

function markSeg(seg, val) {
  var btns = seg.querySelectorAll('button');
  for (var i = 0; i < btns.length; i++) btns[i].classList.toggle('on', btns[i].getAttribute('data-v') === val);
}
function bindSeg(seg, get, set) {
  seg.addEventListener('click', function (e) {
    var v = e.target && e.target.getAttribute && e.target.getAttribute('data-v');
    if (!v || v === get()) return;
    set(v);
    markSeg(seg, v);
    saveSettings();
  });
}

// 初始回显
setWake.checked = settings.wake;
markSeg(setTheme, settings.theme);
markSeg(setUnit, settings.unit);
markSeg(setFilter, settings.filter);
setAp.checked = settings.autoPause.on;
setApBelow.value = settings.autoPause.below;
setApAbove.value = settings.autoPause.above;

setWake.addEventListener('change', function () {
  settings.wake = setWake.checked;
  if (!settings.wake) releaseWake();
  else if (state.recording) requestWake();
  saveSettings();
});
bindSeg(setTheme, function () { return settings.theme; }, function (v) { settings.theme = v; applyTheme(); });
bindSeg(setUnit, function () { return settings.unit; }, function (v) { settings.unit = v; updateDash(); });
bindSeg(setFilter, function () { return settings.filter; }, function (v) { settings.filter = v; applyFilterPreset(); });

setAp.addEventListener('change', function () {
  settings.autoPause.on = setAp.checked;
  if (setAp.checked && settings.autoPause.above <= settings.autoPause.below) {
    settings.autoPause.above = settings.autoPause.below + 3;
    setApAbove.value = settings.autoPause.above;
  }
  saveSettings();
});
function bindApNum(input, key) {
  input.addEventListener('change', function () {
    var v = parseFloat(input.value);
    if (isNaN(v) || v < 0) v = key === 'below' ? 2 : 5;
    settings.autoPause[key] = v;
    if (settings.autoPause.above <= settings.autoPause.below) {
      settings.autoPause.above = settings.autoPause.below + 3;
      setApAbove.value = settings.autoPause.above;
    }
    saveSettings();
  });
}
bindApNum(setApBelow, 'below');
bindApNum(setApAbove, 'above');

// 清除当前记录:不导出直接清零
document.getElementById('set-clear').addEventListener('click', function () {
  if (!confirm('确定丢弃当前记录?距离和计时将清零,且不会导出。')) return;
  if (state.recording) { state.recording = false; releaseWake(); }
  state.started = false; state.autoPaused = false;
  var btnStart = document.getElementById('btn-start');
  btnStart.textContent = '开始';
  btnStart.classList.remove('recording');
  document.getElementById('btn-end').disabled = true;
  resetCurrent();
  drawTrack(); updateDash();
  closeSettings();
  setStatus('记录已清除', 2000);
});
