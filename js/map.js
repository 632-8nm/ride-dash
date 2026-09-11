// 地图:Leaflet + 高德瓦片 + GCJ-02 纠偏
import { state } from './state.js';
import { setStatus } from './ui.js';

// 高德瓦片国内直连快,但坐标系是 GCJ-02;GPS 是 WGS-84,
// 显示前先纠偏,记录和 GPX 导出仍用原始 WGS-84 坐标。
export const map = L.map('map', { zoomControl: false, attributionControl: false }).setView([30.66, 104.07], 13);
L.tileLayer('https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}', {
  subdomains: ['1', '2', '3', '4'], maxZoom: 18
}).addTo(map);
var marker = null;
var trackLine = L.polyline([], { color: '#1f6feb', weight: 4 }).addTo(map);

// WGS-84 → GCJ-02 标准纠偏算法
function outOfChina(lat, lng) {
  return lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271;
}
function transformLat(x, y) {
  var ret = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
  ret += (20.0 * Math.sin(6.0 * x * Math.PI) + 20.0 * Math.sin(2.0 * x * Math.PI)) * 2.0 / 3.0;
  ret += (20.0 * Math.sin(y * Math.PI) + 40.0 * Math.sin(y / 3.0 * Math.PI)) * 2.0 / 3.0;
  ret += (160.0 * Math.sin(y / 12.0 * Math.PI) + 320 * Math.sin(y * Math.PI / 30.0)) * 2.0 / 3.0;
  return ret;
}
function transformLng(x, y) {
  var ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  ret += (20.0 * Math.sin(6.0 * x * Math.PI) + 20.0 * Math.sin(2.0 * x * Math.PI)) * 2.0 / 3.0;
  ret += (20.0 * Math.sin(x * Math.PI) + 40.0 * Math.sin(x / 3.0 * Math.PI)) * 2.0 / 3.0;
  ret += (150.0 * Math.sin(x / 12.0 * Math.PI) + 300.0 * Math.sin(x / 30.0 * Math.PI)) * 2.0 / 3.0;
  return ret;
}
export function wgs2gcj(lat, lng) {
  if (outOfChina(lat, lng)) return [lat, lng];
  var a = 6378245.0, ee = 0.00669342162296594323;
  var dLat = transformLat(lng - 105.0, lat - 35.0);
  var dLng = transformLng(lng - 105.0, lat - 35.0);
  var radLat = lat / 180.0 * Math.PI;
  var magic = Math.sin(radLat);
  magic = 1 - ee * magic * magic;
  var sqrtMagic = Math.sqrt(magic);
  dLat = (dLat * 180.0) / ((a * (1 - ee)) / (magic * sqrtMagic) * Math.PI);
  dLng = (dLng * 180.0) / (a / sqrtMagic * Math.cos(radLat) * Math.PI);
  return [lat + dLat, lng + dLng];
}

export function drawTrack() {
  trackLine.setLatLngs(state.points.map(function (p) {
    var c = wgs2gcj(p.lat, p.lng);
    return [c[0], c[1]];
  }));
}
if (state.points.length) drawTrack();

// 每个定位点更新蓝点;首次定位把地图居中到 16 级
export function updateMarker(lat, lng) {
  var c = wgs2gcj(lat, lng);
  if (marker) {
    marker.setLatLng([c[0], c[1]]);
  } else {
    marker = L.circleMarker([c[0], c[1]], { radius: 8, color: '#fff', weight: 2, fillColor: '#1f6feb', fillOpacity: 1 }).addTo(map);
    map.setView([c[0], c[1]], 16);
  }
}

export function locateMe() {
  if (!state.lastFix) { setStatus('还没有定位,等待 GPS…'); return; }
  var c = wgs2gcj(state.lastFix.lat, state.lastFix.lng);
  map.setView([c[0], c[1]], Math.max(map.getZoom(), 16));
}
document.getElementById('btn-loc').addEventListener('click', locateMe);
