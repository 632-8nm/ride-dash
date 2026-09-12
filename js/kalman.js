// 恒速卡尔曼滤波:平滑 GPS 轨迹,抑制定位噪声
// 状态 x = [北向位置m, 东向位置m, 北向速度m/s, 东向速度m/s]
// 测量噪声 R 取 GPS 精度半径的平方;过程噪声按自行车动力学取值
var SIGMA_A = 0.8;      // 过程噪声:自行车加计标准差 m/s²
var REINIT_GAP = 10000; // 定位间隔超过该毫秒数则重置滤波器(信号中断)

function zeros4() {
  var m = [];
  for (var i = 0; i < 4; i++) m.push([0, 0, 0, 0]);
  return m;
}
function diag4(v) {
  return [
    [v, 0, 0, 0], [0, v, 0, 0],
    [0, 0, v, 0], [0, 0, 0, v]
  ];
}
function mat4mul(A, B) {
  var M = zeros4();
  for (var i = 0; i < 4; i++)
    for (var j = 0; j < 4; j++) {
      var s = 0;
      for (var k = 0; k < 4; k++) s += A[i][k] * B[k][j];
      M[i][j] = s;
    }
  return M;
}
function transpose4(A) {
  var M = zeros4();
  for (var i = 0; i < 4; i++)
    for (var j = 0; j < 4; j++) M[i][j] = A[j][i];
  return M;
}

export function createKalman() {
  var initialised = false;
  var lat0 = 0, lng0 = 0, lastT = 0;
  var x = [0, 0, 0, 0];
  var P = diag4(1e6);

  function reinit(lat, lng, accuracy, t) {
    lat0 = lat; lng0 = lng; lastT = t;
    x = [0, 0, 0, 0];
    var r = accuracy * accuracy;
    P = diag4(r + 25); // 初速未知,位置给大不确定性
    initialised = true;
  }

  return {
    // 输入原始 GPS;输出滤波后的 {lat, lng}
    filter: function (lat, lng, accuracy, tMs) {
      if (!initialised) reinit(lat, lng, accuracy, tMs);

      var dt = (tMs - lastT) / 1000;
      if (dt < 0.2) dt = 0.2;
      if (tMs - lastT > REINIT_GAP) reinit(lat, lng, accuracy, tMs);
      lastT = tMs;

      // 经纬度 → 以 lat0 为原点的局部平面坐标(米)
      var cosLat0 = Math.cos(lat0 * Math.PI / 180);
      var mN = (lat - lat0) * 111320;
      var mE = (lng - lng0) * 111320 * cosLat0;

      // ---- 预测:x = F x,P = F P Fᵀ + Q ----
      var F = [
        [1, 0, dt, 0], [0, 1, 0, dt],
        [0, 0, 1, 0], [0, 0, 0, 1]
      ];
      x = [
        x[0] + x[2] * dt,
        x[1] + x[3] * dt,
        x[2], x[3]
      ];
      var Ft = transpose4(F);
      P = mat4mul(mat4mul(F, P), Ft);
      var s2 = SIGMA_A * SIGMA_A;
      var Q = [
        [dt * dt * dt * dt / 4 * s2, 0, dt * dt * dt / 2 * s2, 0],
        [0, dt * dt * dt * dt / 4 * s2, 0, dt * dt * dt / 2 * s2],
        [dt * dt * dt / 2 * s2, 0, dt * dt * s2, 0],
        [0, dt * dt * dt / 2 * s2, 0, dt * dt * s2]
      ];
      for (var qi = 0; qi < 4; qi++)
        for (var qj = 0; qj < 4; qj++) P[qi][qj] += Q[qi][qj];

      // ---- 更新:H 取位置两行,S = H P Hᵀ + R(2×2 直接求逆) ----
      var r = accuracy * accuracy;
      var s00 = P[0][0] + r, s01 = P[0][1], s10 = P[1][0], s11 = P[1][1] + r;
      var det = s00 * s11 - s01 * s10;
      if (Math.abs(det) < 1e-12) det = 1e-12;
      var K = zeros4();
      K[0][0] = (s11 * P[0][0] - s01 * P[1][0]) / det;
      K[0][1] = (-s01 * P[0][0] + s00 * P[1][0]) / det;
      K[1][0] = (s11 * P[0][1] - s01 * P[1][1]) / det;
      K[1][1] = (-s01 * P[0][1] + s00 * P[1][1]) / det;
      K[2][0] = (s11 * P[2][0] - s01 * P[3][0]) / det;
      K[2][1] = (-s01 * P[2][0] + s00 * P[3][0]) / det;
      K[3][0] = (s11 * P[2][1] - s01 * P[3][1]) / det;
      K[3][1] = (-s01 * P[2][1] + s00 * P[3][1]) / det;

      var yN = mN - x[0], yE = mE - x[1];
      x = [
        x[0] + K[0][0] * yN + K[0][1] * yE,
        x[1] + K[1][0] * yN + K[1][1] * yE,
        x[2] + K[2][0] * yN + K[2][1] * yE,
        x[3] + K[3][0] * yN + K[3][1] * yE
      ];

      // P = (I − K H) P:KH 只取 P 的前两行参与
      var NP = zeros4();
      for (var i = 0; i < 4; i++)
        for (var j = 0; j < 4; j++)
          NP[i][j] = P[i][j] - K[i][0] * P[0][j] - K[i][1] * P[1][j];
      P = NP;

      // 滤波结果 → 经纬度
      return {
        lat: lat0 + x[0] / 111320,
        lng: lng0 + x[1] / (111320 * cosLat0)
      };
    },
    reset: function () { initialised = false; }
  };
}
