// 界面渲染:状态条 + 仪表盘 + 心率显示
import { state } from './state.js';
import { fmtSpeed } from './settings.js';
import { effMs } from './timer.js';

var statusHoldUntil = 0;
export function setStatus(msg, holdMs) {
  var el = document.getElementById('map-status');
  if (msg) {
    el.textContent = msg; el.hidden = false;
    statusHoldUntil = Date.now() + (holdMs || 0);
  } else if (Date.now() >= statusHoldUntil) {
    el.hidden = true;
  }
}

export function setSpeedDisplay(kmh) {
  var sp = fmtSpeed(kmh);
  document.getElementById('v-speed').innerHTML = sp.v + '<span class="unit">' + sp.u + '</span>';
}

export function setHr(bpm) {
  document.getElementById('v-hr').innerHTML = bpm + '<span class="unit"> bpm</span>';
}

export function updateDash() {
  document.getElementById('v-dist').innerHTML = (state.distance / 1000).toFixed(2) + '<span class="unit"> km</span>';
  var ms = effMs();
  var avg = ms > 5000 ? (state.distance / 1000) / (ms / 3600000) : 0;
  var avgF = fmtSpeed(avg);
  document.getElementById('v-avg').innerHTML = avgF.v + '<span class="unit">' + avgF.u + '</span>';
  var s = Math.floor(ms / 1000);
  var hh = String(Math.floor(s / 3600)).padStart(2, '0');
  var mm = String(Math.floor(s % 3600 / 60)).padStart(2, '0');
  var ss = String(s % 60).padStart(2, '0');
  document.getElementById('v-time').textContent = hh + ':' + mm + ':' + ss;
}
