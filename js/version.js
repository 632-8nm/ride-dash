// 应用版本号:单一来源,页脚等处从这里取
// 三段式语义版本 MAJOR.MINOR.PATCH:
//   0.x 阶段 = 个人使用、持续迭代期
//   MINOR    = 重大里程碑才 +1(如历史记录页、外置 GPS、1.0.0 正式版)
//   PATCH    = 日常小功能/修 bug/调参数,每发布一批 +1
// 历史批次:0.1.0 初版(地图+仪表盘+GPX)/ 0.1.1 BLE 心率 /
//           0.1.2 设置抽屉+双主题 / 0.1.3 精度算法 / 0.1.4 版本机制+自动暂停默认开 /
//           0.2.0 路书导航(MINOR 里程碑) / 0.2.1 大字模式 /
//           0.2.2 底部三标签导航(地图/数据/设置),控制行置其上 /
//           0.2.3 数据页高度固定 + 左右滑切换页面 /
//           0.2.4 漂移过滤作用于多普勒路径的轨迹点 /
//           0.2.5 更新检查(自动轮询 + 设置页手动检查)
import { setStatus } from './ui.js';
import { state } from './state.js';

// 与线上版本号比对:发现差异即视为有更新(个人应用,不区分新旧方向)
export function checkForUpdate(auto) {
  return fetch('js/version.js', { cache: 'no-store' })
    .then(function (r) { return r.text(); })
    .then(function (t) {
      var m = t.match(/APP_VERSION = '([0-9.]+)'/);
      if (!m || m[1] === APP_VERSION) {
        if (!auto) setStatus('已是最新版本 v' + APP_VERSION, 3000);
        return false;
      }
      try { localStorage.setItem('ride-dash-pending', m[1]); } catch (e) {}
      if (auto && state.recording) {
        setStatus('发现新版本 v' + m[1] + ',本次骑行结束后刷新', 5000);
      } else if (auto) {
        setStatus('发现新版本 v' + m[1] + ',正在更新…', 3000);
        setTimeout(function () { location.reload(); }, 1200);
      } else if (confirm('发现新版本 v' + m[1] + ',立即刷新页面?')) {
        location.reload();
      } else {
        setStatus('可在下次打开时更新', 3000);
      }
      return true;
    })
    .catch(function () {
      if (!auto) setStatus('检查更新失败,请检查网络', 3000);
      return false;
    });
}

export const APP_VERSION = '0.2.5';
