// GPX 1.1 导出:WGS-84 原始坐标,Strava/X-TRACK 通用
import { state, SKEY, resetCurrent } from './state.js';
import { drawTrack } from './map.js';
import { updateDash } from './ui.js';

export function exportGpx() {
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
  resetCurrent();
  drawTrack(); updateDash();
  document.getElementById('export-panel').classList.remove('show');
}
