// GPS 定位:watchPosition + 精度门槛 + 卡尔曼滤波 + 自适应漂移过滤 + 速度平滑 + 自动暂停判定
import { state, persist } from './state.js';
import { settings, filterDist, maxJump } from './settings.js';
import { haversine } from './geo.js';
import { createKalman } from './kalman.js';
import { updateMarker, drawTrack } from './map.js';
import { setStatus, setSpeedDisplay, updateDash } from './ui.js';
import { flushActive } from './timer.js';
import { updatePosition as updateRoutePos } from './route.js';

var ACC_MAX = 30;      // 精度半径超过该值(米)的定位点视为噪声,整点丢弃
var ACC_FILTER = 0.8;  // 动态漂移阈值 = max(基准阈值, 精度半径 × 该系数)
var SPEED_EMA = 0.3;   // 速度指数滑动平均系数:显示值 = 上次×(1-α) + 本次×α
var emaKmh = null;     // 平滑后的实时速度
var kf = createKalman();

function onFix(pos) {
  var lat = pos.coords.latitude, lng = pos.coords.longitude;
  var speed = pos.coords.speed; // m/s,可能为 null
  var accuracy = pos.coords.accuracy; // 定位精度半径(米)
  var now = Date.now();

  // 精度门槛:低质量定位点不进距离、不上轨迹,蓝点也不跳
  if (accuracy != null && accuracy > ACC_MAX) return;

  // 卡尔曼滤波:后续距离/轨迹/GPX 全部使用滤波位置
  var f = kf.filter(lat, lng, accuracy || 20, now);
  var pt = { lat: f.lat, lng: f.lng, t: now };
  updateMarker(pt.lat, pt.lng);

  var prev = state.lastFix;
  // 动态漂移阈值:信号差时阈值自动放大
  var dynFilter = Math.max(filterDist, (accuracy || 0) * ACC_FILTER);

  if (prev) {
    var d = haversine(prev.lat, prev.lng, pt.lat, pt.lng);
    var dtSeg = Math.min((now - prev.t) / 1000, 30);
    // 距离优先用多普勒速度积分(位置噪声零均值正负抵消,精度远高于逐点差分);
    // speed 缺失时退回卡尔曼位置差分,并保留漂移门限
    var added = null;
    if (speed != null && speed > -1 && speed < 30) {
      added = speed * dtSeg;
    } else if (d <= maxJump && d >= dynFilter) {
      added = d;
    }
    if (added != null) {
      state.distance += added;
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

  // 路书导航:偏航/进度
  updateRoutePos(pt.lat, pt.lng);

  // 实时速度:优先 GPS 速度(多普勒),退化为距离差分;再做 EMA 平滑
  var kmh = 0;
  if (speed != null && speed >= 0) kmh = speed * 3.6;
  else if (prev) {
    var dt = (now - prev.t) / 1000;
    if (dt > 0 && state.points.length > 1) kmh = haversine(prev.lat, prev.lng, pt.lat, pt.lng) / dt * 3.6;
  }
  // 定位间隔过长(刚恢复/信号中断)时直接采信本次值,避免旧值拖尾
  if (emaKmh === null || !prev || now - prev.t > 10000) emaKmh = kmh;
  else emaKmh = emaKmh * (1 - SPEED_EMA) + kmh * SPEED_EMA;
  setSpeedDisplay(emaKmh);

  // 自动暂停:用平滑后的速度判定,避免阈值附近来回跳
  if (settings.autoPause.on && state.recording) {
    if (!state.autoPaused && emaKmh < settings.autoPause.below) {
      flushActive();
      state.autoPaused = true;
      setStatus('已自动暂停(速度过低)', 3000);
    } else if (state.autoPaused && emaKmh > settings.autoPause.above) {
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
