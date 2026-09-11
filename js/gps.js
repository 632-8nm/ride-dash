// GPS 定位:watchPosition + 漂移过滤 + 自动暂停判定
import { state, persist } from './state.js';
import { settings, filterDist, maxJump, fmtSpeed } from './settings.js';
import { haversine } from './geo.js';
import { wgs2gcj, updateMarker, drawTrack } from './map.js';
import { setStatus, setSpeedDisplay, updateDash } from './ui.js';
import { flushActive } from './timer.js';

function onFix(pos) {
  var lat = pos.coords.latitude, lng = pos.coords.longitude;
  var speed = pos.coords.speed; // m/s,可能为 null
  var now = Date.now();
  var pt = { lat: lat, lng: lng, t: now };

  updateMarker(lat, lng);

  var prev = state.lastFix;
  if (prev) {
    var d = haversine(prev.lat, prev.lng, lat, lng);
    if (d <= maxJump && (d >= filterDist || speed > 0.6)) {
      state.distance += d;
      state.points.push(pt);
      if (state.recording) state.ridePoints.push(pt);
      drawTrack();
      if (state.points.length % 10 === 0) persist();
    }
  } else {
    state.points.push(pt);
    if (state.recording) state.ridePoints.push(pt);
    drawTrack();
  }
  state.lastFix = pt;

  // 实时速度:优先 GPS 速度,退化为距离差分
  var kmh = 0;
  if (speed != null && speed >= 0) kmh = speed * 3.6;
  else if (prev) {
    var dt = (now - prev.t) / 1000;
    if (dt > 0 && state.points.length > 1) kmh = haversine(prev.lat, prev.lng, lat, lng) / dt * 3.6;
  }
  setSpeedDisplay(kmh);

  // 自动暂停:低于停表阈值停计时,高于开表阈值恢复
  if (settings.autoPause.on && state.recording) {
    if (!state.autoPaused && kmh < settings.autoPause.below) {
      flushActive();
      state.autoPaused = true;
      setStatus('已自动暂停(速度过低)', 3000);
    } else if (state.autoPaused && kmh > settings.autoPause.above) {
      state.autoPaused = false;
      state.lastTick = Date.now();
      setStatus('已自动继续', 3000);
    }
  }
  updateDash();
  setStatus('');
}

function onErr(err) {
  var msg = { 1: '定位权限被拒绝,请在设置中允许', 2: '暂无信号,等待 GPS…', 3: '定位超时,重试中…' }[err.code] || '定位异常';
  if (err.code === 1 && !window.isSecureContext) {
    msg = '定位被浏览器拦截:HTTP 页面没有定位权限,需用 HTTPS 打开(见页面说明)';
  }
  setStatus(msg);
}

export function initGps() {
  // 页面一打开就提示,不等定位报错
  if (!window.isSecureContext) {
    setStatus('当前为 HTTP 访问,浏览器不会授予定位权限,请用 HTTPS 打开本页');
  }
  navigator.geolocation.watchPosition(onFix, onErr, {
    enableHighAccuracy: true, maximumAge: 1000, timeout: 15000
  });
}
