// 计时引擎:lastTick 增量累计;自动暂停时停表但不停止记录
import { state } from './state.js';

export function flushActive() {
  if (state.recording && !state.autoPaused && state.lastTick) {
    state.activeMs += Date.now() - state.lastTick;
  }
  state.lastTick = Date.now();
}

export function effMs() {
  return state.activeMs + (state.recording && !state.autoPaused ? Date.now() - state.lastTick : 0);
}

// ---------- Wake Lock ----------
import { settings } from './settings.js';

export async function requestWake() {
  if (!settings.wake) return;
  try {
    if ('wakeLock' in navigator) state.wakeLock = await navigator.wakeLock.request('screen');
  } catch (e) { /* 不支持则忽略 */ }
}
export function releaseWake() {
  if (state.wakeLock) { state.wakeLock.release().catch(function(){}); state.wakeLock = null; }
}
document.addEventListener('visibilitychange', function () {
  if (document.visibilityState === 'visible' && state.recording) requestWake();
});
