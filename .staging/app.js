(function () {
  'use strict';

  // ---------- 状态 ----------
  var state = {
    recording: false,      // 正在骑行(计时中)
    started: false,        // 本次记录是否已开始过
    points: [],            // [{lat,lng,t}] 全部有效点(含暂停前)
    ridePoints: [],        // 仅骑行中的点,用于 GPX
    distance: 0,           // 米
    activeMs: 0,           // 有效骑行毫秒(不含暂停)
    lastFix: null,         // 上一个有效定位点
    timerId: null,
    wakeLock: null,
    lastTick: 0,           // 上次计费时刻,配合自动暂停
    autoPaused: false      // 自动暂停中(速度低于阈值停表)
  };

  // localStorage 恢复
  var SKEY = 'ride-dash-current';
  try {
    var saved = JSON.parse(localStorage.getItem(SKEY) || 'null');
    if (saved && saved.points && saved.points.length) {
      state.points = saved.points;
      state.distance = saved.distance || 0;
      state.activeMs = saved.activeMs || 0;
      state.started = saved.started || false;
      state.lastFix = saved.points[saved.points.length - 1] || null;
      // 恢复后处于"暂停"态,可继续点开始
      updateDash();
    }
  } catch (e) { /* 忽略损坏数据 */ }

  function persist() {
    try {
      localStorage.setItem(SKEY, JSON.stringify({
        points: state.points.slice(-2000), // 防止过大
        distance: state.distance,
        activeMs: state.activeMs,
        started: state.started
      }));
    } catch (e) { /* 存储满则忽略 */ }
  }

  // ---------- 地图 ----------
  // 高德瓦片国内直连快,但坐标系是 GCJ-02;GPS 是 WGS-84,
  // 显示前先纠偏,记录和 GPX 导出仍用原始 WGS-84 坐标。
  var map = L.map('map', { zoomControl: false, attributionControl: false }).setView([30.66, 104.07], 13);
  L.tileLayer('https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}', {
    subdomains: ['1', '2', '3', '4'], maxZoom: 18
  }).addTo(map);
  var marker = null, trackLine = L.polyline([], { color: '#1f6feb', weight: 4 }).addTo(map);

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
  function wgs2gcj(lat, lng) {
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

  function drawTrack() {
    trackLine.setLatLngs(state.points.map(function (p) {
      var c = wgs2gcj(p.lat, p.lng);
      return [c[0], c[1]];
    }));
  }
  if (state.points.length) drawTrack();

  function locateMe() {
    if (!state.lastFix) { setStatus('还没有定位,等待 GPS…'); return; }
    var c = wgs2gcj(state.lastFix.lat, state.lastFix.lng);
    map.setView([c[0], c[1]], Math.max(map.getZoom(), 16));
  }
  document.getElementById('btn-loc').addEventListener('click', locateMe);

  var statusHoldUntil = 0;
  function setStatus(msg, holdMs) {
    var el = document.getElementById('map-status');
    if (msg) {
      el.textContent = msg; el.hidden = false;
      statusHoldUntil = Date.now() + (holdMs || 0);
    } else if (Date.now() >= statusHoldUntil) {
      el.hidden = true;
    }
  }

  // ---------- 设置 ----------
  var SETKEY = 'ride-dash-settings';
  var settings = {
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
  function saveSettings() {
    try { localStorage.setItem(SETKEY, JSON.stringify(settings)); } catch (e) {}
  }

  // 主题:body data-theme 驱动 CSS 变量切换
  function applyTheme() {
    document.body.setAttribute('data-theme', settings.theme === 'light' ? 'light' : 'dark');
  }
  applyTheme();

  // 漂移过滤:宽松=几乎全保留;严格=更多点视为漂移丢弃
  var FILTER_PRESETS = {
    loose:  { filterDist: 2,  maxJump: 500 },
    std:    { filterDist: 5,  maxJump: 200 },
    strict: { filterDist: 10, maxJump: 100 }
  };
  var filterDist = FILTER_PRESETS[settings.filter].filterDist;
  var maxJump = FILTER_PRESETS[settings.filter].maxJump;
  function applyFilterPreset() {
    filterDist = FILTER_PRESETS[settings.filter].filterDist;
    maxJump = FILTER_PRESETS[settings.filter].maxJump;
  }

  // 速度单位显示:内部一律 km/h,展示层转换
  function fmtSpeed(kmh) {
    if (settings.unit === 'mph') return { v: (kmh / 1.609344).toFixed(1), u: ' mph' };
    return { v: kmh.toFixed(1), u: ' km/h' };
  }

  // ---------- GPS ----------

  function onFix(pos) {
    var lat = pos.coords.latitude, lng = pos.coords.longitude;
    var speed = pos.coords.speed; // m/s,可能为 null
    var now = Date.now();
    var pt = { lat: lat, lng: lng, t: now };

    var c = wgs2gcj(lat, lng);
    if (marker) {
      marker.setLatLng([c[0], c[1]]);
    } else {
      marker = L.circleMarker([c[0], c[1]], { radius: 8, color: '#fff', weight: 2, fillColor: '#1f6feb', fillOpacity: 1 }).addTo(map);
      map.setView([c[0], c[1]], 16);
    }

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
    var sp = fmtSpeed(kmh);
    document.getElementById('v-speed').innerHTML = sp.v + '<span class="unit">' + sp.u + '</span>';

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

  // 页面一打开就提示,不等定位报错
  if (!window.isSecureContext) {
    setStatus('当前为 HTTP 访问,浏览器不会授予定位权限,请用 HTTPS 打开本页');
  }

  navigator.geolocation.watchPosition(onFix, onErr, {
    enableHighAccuracy: true, maximumAge: 1000, timeout: 15000
  });

  function haversine(lat1, lng1, lat2, lng2) {
    var R = 6371000, rad = Math.PI / 180;
    var dLat = (lat2 - lat1) * rad, dLng = (lng2 - lng1) * rad;
    var a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  // ---------- 仪表盘 ----------
  // 计时采用 lastTick 增量累计:自动暂停时停表但不停止记录
  function flushActive() {
    if (state.recording && !state.autoPaused && state.lastTick) {
      state.activeMs += Date.now() - state.lastTick;
    }
    state.lastTick = Date.now();
  }
  function effMs() {
    return state.activeMs + (state.recording && !state.autoPaused ? Date.now() - state.lastTick : 0);
  }
  function updateDash() {
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
  setInterval(function () {
    if (state.recording && !state.autoPaused) flushActive();
    updateDash();
  }, 1000);

  // ---------- BLE 心率 ----------
  var hrCell = document.getElementById('cell-hr');
  var hrValue = document.getElementById('v-hr');
  var hrDevice = null;

  function setHr(bpm) {
    hrValue.innerHTML = bpm + '<span class="unit"> bpm</span>';
  }
  function hrDisconnected() {
    hrDevice = null;
    hrCell.classList.add('disconnected');
    hrCell.classList.remove('connected');
    setHr('--');
    setStatus('心率带已断开,点按心率格重连');
  }

  // 心率测量特征值解析:flags 位0 决定 8/16 位格式
  function parseHr(dv) {
    return (dv.getUint8(0) & 0x1) ? dv.getUint16(1, true) : dv.getUint8(1);
  }

  async function connectHr() {
    if (hrDevice && hrDevice.gatt.connected) return;
    if (!('bluetooth' in navigator)) {
      setStatus('此浏览器不支持蓝牙心率,需手机 Chrome 并用 HTTPS 打开');
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
      setStatus('蓝牙连接失败:' + (err && err.message ? err.message : '未知错误'));
    }
  }
  hrCell.addEventListener('click', connectHr);

  // ---------- Wake Lock ----------
  async function requestWake() {
    if (!settings.wake) return;
    try {
      if ('wakeLock' in navigator) state.wakeLock = await navigator.wakeLock.request('screen');
    } catch (e) { /* 不支持则忽略 */ }
  }
  function releaseWake() {
    if (state.wakeLock) { state.wakeLock.release().catch(function(){}); state.wakeLock = null; }
  }
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && state.recording) requestWake();
  });

  // ---------- 开始 / 结束 ----------
  var btnStart = document.getElementById('btn-start');
  var btnEnd = document.getElementById('btn-end');

  btnStart.addEventListener('click', function () {
    if (state.recording) { // 暂停
      flushActive();
      state.recording = false;
      state.autoPaused = false;
      btnStart.textContent = '开始';
      btnStart.classList.remove('recording');
      btnEnd.disabled = false;
      releaseWake();
    } else {
      state.recording = true;
      if (!state.started) { state.started = true; state.ridePoints = []; state.distance = 0; state.activeMs = 0; state.points = []; state.lastFix = null; drawTrack(); }
      state.autoPaused = false;
      state.lastTick = Date.now();
      btnStart.textContent = '暂停';
      btnStart.classList.add('recording');
      btnEnd.disabled = false;
      requestWake();
    }
    persist();
  });

  btnEnd.addEventListener('click', function () {
    if (!state.started) return;
    flushActive();
    state.recording = false;
    state.autoPaused = false;
    state.started = false;
    btnStart.textContent = '开始';
    btnStart.classList.remove('recording');
    btnEnd.disabled = true;
    releaseWake();
    var s = Math.floor(state.activeMs / 1000);
    document.getElementById('export-summary').textContent =
      '距离 ' + (state.distance / 1000).toFixed(2) + ' km · 用时 ' +
      String(Math.floor(s / 3600)).padStart(2, '0') + ':' +
      String(Math.floor(s % 3600 / 60)).padStart(2, '0') + ':' +
      String(s % 60).padStart(2, '0');
    document.getElementById('export-panel').classList.add('show');
    persist();
  });

  // ---------- GPX 导出 ----------
  document.getElementById('btn-gpx').addEventListener('click', function () {
    var pts = state.points.length ? state.points : [];
    var xml = '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<gpx version="1.1" creator="ride-dash" xmlns="http://www.topografix.com/GPX/1/1">\n' +
      '  <trk><name>骑行 ' + new Date().toLocaleString() + '</name><trkseg>\n' +
      pts.map(function (p) {
        return '    <trkpt lat="' + p.lat.toFixed(6) + '" lon="' + p.lng.toFixed(6) + '"><time>' +
          new Date(p.t).toISOString() + '</time></trkpt>';
      }).join('\n') + '\n  </trkseg></trk>\n</gpx>';
    var blob = new Blob([xml], { type: 'application/gpx+xml' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'ride-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-') + '.gpx';
    a.click();
    URL.revokeObjectURL(a.href);
    localStorage.removeItem(SKEY);
    state.points = []; state.ridePoints = []; state.distance = 0; state.activeMs = 0; state.lastFix = null;
    drawTrack(); updateDash();
    document.getElementById('export-panel').classList.remove('show');
  });
  document.getElementById('btn-close').addEventListener('click', function () {
    document.getElementById('export-panel').classList.remove('show');
  });

  // ---------- 全屏 ----------
  document.getElementById('btn-full').addEventListener('click', function () {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen().catch(function () {});
  });

  // ---------- 设置抽屉 ----------
  var setPanel = document.getElementById('set-panel');
  var setBackdrop = document.getElementById('set-backdrop');
  var setOpen = false;

  function openSettings() {
    setOpen = true;
    setPanel.style.transform = '';
    setPanel.classList.add('open');
    setBackdrop.classList.add('show');
  }
  function closeSettings() {
    setOpen = false;
    setPanel.style.transform = '';
    setPanel.classList.remove('open');
    setBackdrop.classList.remove('show');
  }
  document.getElementById('set-close').addEventListener('click', closeSettings);
  setBackdrop.addEventListener('click', closeSettings);

  // 上滑仪表盘呼出(跟手);桌面双击仪表盘同样可开
  var dashEl = document.getElementById('dash');
  var swipeY = null, dragPx = 0;
  dashEl.addEventListener('touchstart', function (e) {
    if (setOpen) return;
    swipeY = e.touches[0].clientY;
    dragPx = 0;
    setPanel.style.transition = 'none';
  }, { passive: true });
  dashEl.addEventListener('touchmove', function (e) {
    if (swipeY === null || setOpen) return;
    var dy = swipeY - e.touches[0].clientY;
    if (dy <= 0) { dragPx = 0; return; }
    dragPx = Math.min(dy, 180);
    e.preventDefault();
    setPanel.style.transform = 'translateY(calc(105% - ' + dragPx + 'px))';
  }, { passive: false });
  dashEl.addEventListener('touchend', function () {
    if (swipeY === null) return;
    setPanel.style.transition = '';
    if (dragPx > 70) openSettings();
    else setPanel.style.transform = '';
    swipeY = null; dragPx = 0;
  });
  dashEl.addEventListener('dblclick', function () { openSettings(); });

  // 设置项绑定
  var setWake = document.getElementById('set-wake');
  var setTheme = document.getElementById('set-theme');
  var setUnit = document.getElementById('set-unit');
  var setFilter = document.getElementById('set-filter');
  var setAp = document.getElementById('set-ap');
  var setApBelow = document.getElementById('set-ap-below');
  var setApAbove = document.getElementById('set-ap-above');

  function markSeg(seg, val) {
    var btns = seg.querySelectorAll('button');
    for (var i = 0; i < btns.length; i++) btns[i].classList.toggle('on', btns[i].getAttribute('data-v') === val);
  }
  function bindSeg(seg, get, set) {
    seg.addEventListener('click', function (e) {
      var v = e.target && e.target.getAttribute && e.target.getAttribute('data-v');
      if (!v || v === get()) return;
      set(v);
      markSeg(seg, v);
      saveSettings();
    });
  }

  // 初始回显
  setWake.checked = settings.wake;
  markSeg(setTheme, settings.theme);
  markSeg(setUnit, settings.unit);
  markSeg(setFilter, settings.filter);
  setAp.checked = settings.autoPause.on;
  setApBelow.value = settings.autoPause.below;
  setApAbove.value = settings.autoPause.above;

  setWake.addEventListener('change', function () {
    settings.wake = setWake.checked;
    if (!settings.wake) releaseWake();
    else if (state.recording) requestWake();
    saveSettings();
  });
  bindSeg(setTheme, function () { return settings.theme; }, function (v) { settings.theme = v; applyTheme(); });
  bindSeg(setUnit, function () { return settings.unit; }, function (v) { settings.unit = v; updateDash(); });
  bindSeg(setFilter, function () { return settings.filter; }, function (v) { settings.filter = v; applyFilterPreset(); });

  setAp.addEventListener('change', function () {
    settings.autoPause.on = setAp.checked;
    if (setAp.checked && settings.autoPause.above <= settings.autoPause.below) {
      settings.autoPause.above = settings.autoPause.below + 3;
      setApAbove.value = settings.autoPause.above;
    }
    saveSettings();
  });
  function bindApNum(input, key) {
    input.addEventListener('change', function () {
      var v = parseFloat(input.value);
      if (isNaN(v) || v < 0) v = key === 'below' ? 2 : 5;
      settings.autoPause[key] = v;
      if (settings.autoPause.above <= settings.autoPause.below) {
        settings.autoPause.above = settings.autoPause.below + 3;
        setApAbove.value = settings.autoPause.above;
      }
      saveSettings();
    });
  }
  bindApNum(setApBelow, 'below');
  bindApNum(setApAbove, 'above');

  document.getElementById('set-clear').addEventListener('click', function () {
    if (!confirm('确定丢弃当前记录?距离和计时将清零,且不会导出。')) return;
    if (state.recording) { state.recording = false; releaseWake(); }
    state.started = false; state.autoPaused = false;
    btnStart.textContent = '开始';
    btnStart.classList.remove('recording');
    btnEnd.disabled = true;
    localStorage.removeItem(SKEY);
    state.points = []; state.ridePoints = []; state.distance = 0; state.activeMs = 0; state.lastFix = null;
    drawTrack(); updateDash();
    closeSettings();
    setStatus('记录已清除', 2000);
  });

  // 首次使用提示(只提示一次)
  try {
    if (!localStorage.getItem('ride-dash-hint')) {
      localStorage.setItem('ride-dash-hint', '1');
      setTimeout(function () { setStatus('提示:上滑仪表盘可打开设置', 5000); }, 1500);
    }
  } catch (e) {}
})();
