// BLE 心率:标准 Heart Rate Service(0x180D),点按心率格发起连接
import { setStatus, setHr } from './ui.js';

var hrCell = document.getElementById('cell-hr');
var hrDevice = null;

function hrDisconnected() {
  hrDevice = null;
  hrCell.classList.add('disconnected');
  hrCell.classList.remove('connected');
  setHr('--');
  setStatus('心率带已断开,点按心率格重连', 3000);
}

// 心率测量特征值解析:flags 位0 决定 8/16 位格式
function parseHr(dv) {
  return (dv.getUint8(0) & 0x1) ? dv.getUint16(1, true) : dv.getUint8(1);
}

async function connectHr() {
  if (hrDevice && hrDevice.gatt.connected) return;
  if (!('bluetooth' in navigator)) {
    setStatus('此浏览器不支持蓝牙心率,需手机 Chrome 并用 HTTPS 打开', 3000);
    return;
  }
  try {
    setStatus('正在搜索心率带…');
    var device = await navigator.bluetooth.requestDevice({
      filters: [{ services: ['heart_rate'] }]
    });
    device.addEventListener('gattserverdisconnected', hrDisconnected);
    var server = await device.gatt.connect();
    var svc = await server.getPrimaryService('heart_rate');
    var ch = await svc.getCharacteristic('heart_rate_measurement');
    await ch.startNotifications();
    ch.addEventListener('characteristicvaluechanged', function (e) {
      setHr(parseHr(e.target.value));
    });
    hrDevice = device;
    hrCell.classList.remove('disconnected');
    hrCell.classList.add('connected');
    setHr('--');
    setStatus('');
  } catch (err) {
    // 用户取消选择设备时静默返回
    if (err && err.name === 'NotFoundError') { setStatus(''); return; }
    setStatus('蓝牙连接失败:' + (err && err.message ? err.message : '未知错误'), 3000);
  }
}
hrCell.addEventListener('click', connectHr);
