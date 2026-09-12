// 入口:装配各模块,按钮事件与秒级 tick
import { state, persist } from './state.js';
import { flushActive, effMs, requestWake, releaseWake } from './timer.js';
import { initGps } from './gps.js';
import { drawTrack, map } from './map.js';
import { setStatus, updateDash } from './ui.js';
import { exportGpx } from './gpx.js';
import './hr.js';
import './settingsPanel.js';

// ---------- 开始 / 结束 ----------
var btnStart = document.getElementById('btn-start');
var btnEnd = document.getElementById('btn-end');

btnStart.addEventListener('click', function () {
  if (state.recording) { // 暂停
    flushActive();
    state.recording = false;
    state.autoPaused = false;
    btnStart.textContent = '开始';
    btnStart.classList.remove('recording');
    btnEnd.disabled = false;
    releaseWake();
  } else {
    state.recording = true;
    if (!state.started) { state.started = true; state.ridePoints = []; state.distance = 0; state.activeMs = 0; state.points = []; state.lastFix = null; state.ascent = 0; drawTrack(); }
    state.autoPaused = false;
    state.lastTick = Date.now();
    btnStart.textContent = '暂停';
    btnStart.classList.add('recording');
    btnEnd.disabled = false;
    requestWake();
  }
  persist();
});

btnEnd.addEventListener('click', function () {
  if (!state.started) return;
  flushActive();
  state.recording = false;
  state.autoPaused = false;
  state.started = false;
  btnStart.textContent = '开始';
  btnStart.classList.remove('recording');
  btnEnd.disabled = true;
  releaseWake();
  var s = Math.floor(state.activeMs / 1000);
  document.getElementById('export-summary').textContent =
    '距离 ' + (state.distance / 1000).toFixed(2) + ' km · 用时 ' +
    String(Math.floor(s / 3600)).padStart(2, '0') + ':' +
    String(Math.floor(s % 3600 / 60)).padStart(2, '0') + ':' +
    String(s % 60).padStart(2, '0');
  document.getElementById('export-panel').classList.add('show');
  persist();
});

// ---------- GPX 导出面板 ----------
document.getElementById('btn-gpx').addEventListener('click', exportGpx);
document.getElementById('btn-close').addEventListener('click', function () {
  document.getElementById('export-panel').classList.remove('show');
});

// ---------- 全屏 ----------
document.getElementById('btn-full').addEventListener('click', function () {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen().catch(function () {});
});

// ---------- 视图切换:底部标签栏(地图 / 数据 / 设置) ----------
var VKEY = 'ride-dash-view';
var tabButtons = document.querySelectorAll('#tabbar .tab');

function setView(name) {
  document.body.classList.toggle('view-data', name === 'data');
  document.body.classList.toggle('view-settings', name === 'settings');
  for (var i = 0; i < tabButtons.length; i++) {
    tabButtons[i].classList.toggle('active', tabButtons[i].getAttribute('data-view') === name);
  }
  try { localStorage.setItem(VKEY, name); } catch (e) {}
  // 地图容器从 display:none 恢复后尺寸变了,需要让 Leaflet 重算
  if (name === 'map') setTimeout(function () { map.invalidateSize(); }, 60);
}
for (var ti = 0; ti < tabButtons.length; ti++) {
  (function (btn) {
    btn.addEventListener('click', function () { setView(btn.getAttribute('data-view')); });
  })(tabButtons[ti]);
}
try {
  var savedView = localStorage.getItem(VKEY);
  if (savedView === 'data' || savedView === 'settings') setView(savedView);
} catch (e) {}

// ---------- 左右滑切换页面:地图 → 数据 → 设置(地图页滑底部数据条) ----------
var ORDER = ['map', 'data', 'settings'];
var sStart = null, sAxis = null;
function sDown(x, y) { sStart = { x: x, y: y }; sAxis = null; }
function sMove(x, y) {
  if (!sStart) return;
  var dx = x - sStart.x, dy = y - sStart.y;
  if (!sAxis && (Math.abs(dx) > 12 || Math.abs(dy) > 12)) sAxis = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
}
function sUp(x) {
  if (!sStart || sAxis !== 'h') { sStart = null; return; }
  var dx = x - sStart.x;
  sStart = null;
  var cur = ORDER.indexOf(document.querySelector('#tabbar .tab.active').getAttribute('data-view'));
  if (cur === -1) return;
  if (dx < -60 && cur < ORDER.length - 1) setView(ORDER[cur + 1]);
  else if (dx > 60 && cur > 0) setView(ORDER[cur - 1]);
}
// 数据条(地图页的底条、数据页的整个面板)与设置页都接入横滑
var swipeEls = [document.getElementById('dash'), document.getElementById('view-settings')];
for (var si = 0; si < swipeEls.length; si++) {
  (function (el) {
    if (!el) return;
    el.addEventListener('touchstart', function (e) { sDown(e.touches[0].clientX, e.touches[0].clientY); }, { passive: true });
    el.addEventListener('touchmove', function (e) { sMove(e.touches[0].clientX, e.touches[0].clientY); }, { passive: true });
    el.addEventListener('touchend', function (e) { sUp(e.changedTouches[0].clientX); });
    el.addEventListener('mousedown', function (e) { sDown(e.clientX, e.clientY); });
    el.addEventListener('mousemove', function (e) { if (sStart) sMove(e.clientX, e.clientY); });
  })(swipeEls[si]);
}
window.addEventListener('mouseup', function (e) { if (sStart) sUp(e.clientX); });

// ---------- 秒级刷新 ----------
setInterval(function () {
  if (state.recording && !state.autoPaused) flushActive();
  updateDash();
}, 1000);

// ---------- 启动 ----------
initGps();
updateDash(); // 恢复的断点记录回显

// 首次使用提示(只提示一次)
try {
  if (!localStorage.getItem('ride-dash-hint')) {
    localStorage.setItem('ride-dash-hint', '1');
    setTimeout(function () { setStatus('提示:上滑仪表盘可打开设置', 5000); }, 1500);
  }
} catch (e) {}
