// 路书导航:导入 GPX 路线,偏航判定,剩余里程
// 路书点为 WGS-84(其他 App 导出的 GPX),显示时统一纠偏;存储 localStorage 刷新不丢
import { haversine } from './geo.js';
import { setStatus } from './ui.js';
import { setRouteLine, clearRouteLine, fitRouteLine } from './map.js';

var RTE_KEY = 'ride-dash-route';
var OFF_LIMIT = 50;   // 距路书超过该距离(米)判为偏航
var BACK_LIMIT = 30;  // 回到该距离内判为回归,避免阈值附近抖动
var MAX_PTS = 3000;   // 路书点数上限,超出按步长抽稀
var ENDING_DIST = 200; // 接近终点提示距离(米)

// route = { name, pts:[{lat,lng}], cum:[累计里程m], total, lastIdx, offRoute, endedNotified }
var route = null;

// ---------- 持久化 ----------
function saveRoute() {
  try { localStorage.setItem(RTE_KEY, JSON.stringify({ name: route.name, pts: route.pts })); }
  catch (e) { /* 存储满则忽略 */ }
}
function loadSavedRoute() {
  try {
    var saved = JSON.parse(localStorage.getItem(RTE_KEY) || 'null');
    if (saved && saved.pts && saved.pts.length) buildRoute(saved.name, saved.pts, false);
  } catch (e) { /* 忽略损坏数据 */ }
}

// ---------- 构建 ----------
function buildRoute(name, pts, fit) {
  // 抽稀:超过上限按步长保留,末点必留
  if (pts.length > MAX_PTS) {
    var step = Math.ceil(pts.length / MAX_PTS);
    var kept = [];
    for (var i = 0; i < pts.length; i += step) kept.push(pts[i]);
    if (kept[kept.length - 1] !== pts[pts.length - 1]) kept.push(pts[pts.length - 1]);
    pts = kept;
  }
  var cum = [0];
  var total = 0;
  for (var j = 1; j < pts.length; j++) {
    total += haversine(pts[j - 1].lat, pts[j - 1].lng, pts[j].lat, pts[j].lng);
    cum.push(total);
  }
  route = { name: name, pts: pts, cum: cum, total: total, lastIdx: 0, offRoute: false, endedNotified: false };
  saveRoute();
  setRouteLine(pts);
  if (fit) fitRouteLine();
  refreshInfo();
}

// ---------- GPX 解析 ----------
export function parseGpx(text, fallbackName) {
  var doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('GPX 文件格式错误');
  function readPts(tag) {
    var out = [], els = doc.getElementsByTagName(tag);
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      var lat = parseFloat(el.getAttribute('lat')), lng = parseFloat(el.getAttribute('lon'));
      if (!isNaN(lat) && !isNaN(lng)) out.push({ lat: lat, lng: lng });
    }
    return out;
  }
  var pts = readPts('trkpt');
  if (pts.length < 2) pts = readPts('rtept');
  if (pts.length < 2) throw new Error('GPX 里没有轨迹点');
  var names = doc.getElementsByTagName('name');
  var name = (names.length ? names[0].textContent : '') || fallbackName || '路书';
  return { name: name, pts: pts };
}

export function loadRoute(name, pts) {
  buildRoute(name, pts, true);
  setStatus('路书已载入:' + name + '(' + (route.total / 1000).toFixed(1) + ' km)', 4000);
}
export function clearRoute() {
  route = null;
  localStorage.removeItem(RTE_KEY);
  clearRouteLine();
  refreshInfo();
}
export function hasRoute() { return route !== null; }

// ---------- 定位接入:最近点搜索 + 偏航 + 进度 ----------
// 最近点先在上次索引附近(±100)找,找不到再全表扫,兼顾速度与丢点恢复
function nearestIdx(lat, lng) {
  var best = -1, bestD = Infinity;
  function scan(from, to) {
    for (var i = Math.max(0, from); i <= Math.min(route.pts.length - 1, to); i++) {
      var d = haversine(lat, lng, route.pts[i].lat, route.pts[i].lng);
      if (d < bestD) { bestD = d; best = i; }
    }
  }
  scan(route.lastIdx - 100, route.lastIdx + 100);
  if (best === -1 || bestD > OFF_LIMIT) { best = -1; bestD = Infinity; scan(0, route.pts.length - 1); }
  route.lastIdx = Math.max(best, 0);
  return { idx: best, dist: bestD };
}

// 每个 GPS 定位点调用一次;返回 { onRoute, offBy, remainingM, ratio } 或 null
export function updatePosition(lat, lng) {
  if (!route) return null;
  var near = nearestIdx(lat, lng);
  var remaining = route.total - route.cum[near.idx];
  var ratio = route.total > 0 ? route.cum[near.idx] / route.total : 0;

  // 偏航状态机:带回归迟滞,防止阈值边缘来回报警
  if (near.dist > OFF_LIMIT && !route.offRoute) {
    route.offRoute = true;
    setStatus('已偏离路书 约' + Math.round(near.dist) + ' 米', 4000);
    if (navigator.vibrate) navigator.vibrate(300);
  } else if (route.offRoute && near.dist <= BACK_LIMIT) {
    route.offRoute = false;
    setStatus('已回到路书', 3000);
    if (navigator.vibrate) navigator.vibrate(150);
  } else if (route.offRoute) {
    setStatus('偏离路书 约' + Math.round(near.dist) + ' 米', 4000);
  }

  // 接近终点提示(一次性)
  if (!route.endedNotified && remaining < ENDING_DIST && near.dist < OFF_LIMIT) {
    route.endedNotified = true;
    setStatus('即将到达路书终点', 5000);
    if (navigator.vibrate) navigator.vibrate([150, 100, 150]);
  }

  refreshInfo(remaining, ratio);
  return { onRoute: !route.offRoute, offBy: near.dist, remainingM: Math.max(0, remaining), ratio: ratio };
}

function refreshInfo(remaining, ratio) {
  var el = document.getElementById('route-info');
  if (!el) return;
  if (!route) { el.textContent = '未导入'; return; }
  if (remaining == null) { remaining = route.total; ratio = 0; }
  el.textContent = route.name + ' · 共 ' + (route.total / 1000).toFixed(1) +
    ' km · 剩余 ' + (Math.max(0, remaining) / 1000).toFixed(1) + ' km(' + Math.round(ratio * 100) + '%)';
}

// 启动时恢复已存路书
loadSavedRoute();
