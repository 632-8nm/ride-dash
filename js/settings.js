// 应用设置:localStorage 持久化 + 主题/过滤/单位
export const SETKEY = 'ride-dash-settings';

export const settings = {
  wake: true,                                  // 屏幕常亮
  theme: 'dark',                               // dark | light
  unit: 'kmh',                                 // kmh | mph
  filter: 'std',                               // loose | std | strict
  autoPause: { on: false, below: 2, above: 5 } // km/h,低于停表、高于开表
};

try {
  var savedSet = JSON.parse(localStorage.getItem(SETKEY) || 'null');
  if (savedSet) {
    if ('wake' in savedSet) settings.wake = savedSet.wake;
    if (savedSet.theme) settings.theme = savedSet.theme;
    if (savedSet.unit) settings.unit = savedSet.unit;
    if (savedSet.filter) settings.filter = savedSet.filter;
    if (savedSet.autoPause) settings.autoPause = savedSet.autoPause;
  }
} catch (e) { /* 忽略损坏数据 */ }

export function saveSettings() {
  try { localStorage.setItem(SETKEY, JSON.stringify(settings)); } catch (e) {}
}

// 主题:body data-theme 驱动 CSS 变量切换
export function applyTheme() {
  document.body.setAttribute('data-theme', settings.theme === 'light' ? 'light' : 'dark');
}
applyTheme();

// 漂移过滤:宽松=几乎全保留;严格=更多点视为漂移丢弃
// 导出的 let 是活绑定:applyFilterPreset 更新后,导入方读到的就是新值
export const FILTER_PRESETS = {
  loose:  { filterDist: 2,  maxJump: 500 },
  std:    { filterDist: 5,  maxJump: 200 },
  strict: { filterDist: 10, maxJump: 100 }
};
export let filterDist = FILTER_PRESETS[settings.filter].filterDist;
export let maxJump = FILTER_PRESETS[settings.filter].maxJump;
export function applyFilterPreset() {
  filterDist = FILTER_PRESETS[settings.filter].filterDist;
  maxJump = FILTER_PRESETS[settings.filter].maxJump;
}

// 速度单位显示:内部一律 km/h,展示层转换
export function fmtSpeed(kmh) {
  if (settings.unit === 'mph') return { v: (kmh / 1.609344).toFixed(1), u: ' mph' };
  return { v: kmh.toFixed(1), u: ' km/h' };
}
