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
