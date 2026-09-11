// 骑行状态 + localStorage 断点续记
export const SKEY = 'ride-dash-current';

export const state = {
  recording: false,      // 正在骑行(计时中)
  started: false,        // 本次记录是否已开始过
  points: [],            // [{lat,lng,t}] 全部有效点(含暂停前)
  ridePoints: [],        // 仅骑行中的点,用于 GPX
  distance: 0,           // 米
  activeMs: 0,           // 有效骑行毫秒(不含暂停)
  lastFix: null,         // 上一个有效定位点
  wakeLock: null,
  lastTick: 0,           // 上次计费时刻,配合自动暂停
  autoPaused: false      // 自动暂停中(速度低于阈值停表)
};

// localStorage 恢复(恢复后处于"暂停"态,可继续点开始)
try {
  var saved = JSON.parse(localStorage.getItem(SKEY) || 'null');
  if (saved && saved.points && saved.points.length) {
    state.points = saved.points;
    state.distance = saved.distance || 0;
    state.activeMs = saved.activeMs || 0;
    state.started = saved.started || false;
    state.lastFix = saved.points[saved.points.length - 1] || null;
  }
} catch (e) { /* 忽略损坏数据 */ }

export function persist() {
  try {
    localStorage.setItem(SKEY, JSON.stringify({
      points: state.points.slice(-2000), // 防止过大
      distance: state.distance,
      activeMs: state.activeMs,
      started: state.started
    }));
  } catch (e) { /* 存储满则忽略 */ }
}

// 不导出直接清零(GPX 导出后与设置里"清除当前记录"共用)
export function resetCurrent() {
  localStorage.removeItem(SKEY);
  state.points = []; state.ridePoints = []; state.distance = 0;
  state.activeMs = 0; state.lastFix = null;
}
