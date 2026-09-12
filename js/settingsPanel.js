// 设置页:设置项绑定与路书导入(页面切换由 main.js 的底部标签栏负责)
import { settings, saveSettings, applyTheme, applyFilterPreset } from './settings.js';
import { state, resetCurrent } from './state.js';
import { setStatus, updateDash } from './ui.js';
import { releaseWake, requestWake } from './timer.js';
import { drawTrack } from './map.js';
import { APP_VERSION } from './version.js';
import { parseGpx, loadRoute, clearRoute } from './route.js';

// 版本页脚:单一来源 js/version.js
document.getElementById('set-ver').textContent =
  'ride-dash v' + APP_VERSION + ' · 数据仅存本机';

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
  setStatus('记录已清除', 2000);
});

// ---------- 路书导航 ----------
var routeFile = document.getElementById('route-file');
document.getElementById('route-import').addEventListener('click', function () {
  routeFile.click();
});
routeFile.addEventListener('change', function () {
  var file = routeFile.files[0];
  routeFile.value = ''; // 清空以便可重复选择同一文件
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function () {
    try {
      var g = parseGpx(reader.result, file.name.replace(/\.gpx$/i, ''));
      loadRoute(g.name, g.pts);
    } catch (e) {
      setStatus('路书导入失败:' + e.message, 4000);
    }
  };
  reader.onerror = function () { setStatus('路书文件读取失败', 3000); };
  reader.readAsText(file);
});
document.getElementById('route-clear').addEventListener('click', function () {
  clearRoute();
  setStatus('路书已清除', 2000);
});
