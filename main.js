import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const APPKEY = '3b9043faf7d20eb9e29543b0f804711e';
let map, libraryMarkers = [], activeIdx = null;
let jsonpCounter = 0, pollingTimers = {};

// ===== 初期化 =====
document.addEventListener('DOMContentLoaded', initMap);

function initMap() {
  map = L.map('map', { center: [35.6762, 139.6503], zoom: 11 });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors',
    maxZoom: 19,
  }).addTo(map);
}

// ===== グローバル公開 =====
window.switchTab       = switchTab;
window.searchByArea    = searchByArea;
window.searchByGeo     = searchByGeo;
window.focusLibrary    = focusLibrary;
window.checkBookPopup  = checkBookPopup;
window.toggleSidebar   = toggleSidebar;

// ===== タブ =====
function switchTab(id) {
  ['area', 'geo'].forEach(t => {
    document.getElementById('tab-' + t).classList.toggle('active', t === id);
    document.getElementById('tab-' + t + '-btn').classList.toggle('active', t === id);
  });
}

// ===== モバイル サイドバートグル =====
function toggleSidebar() {
  const sb = document.getElementById('sidebar');
  sb.classList.toggle('open');
  document.getElementById('mobile-toggle').textContent =
    sb.classList.contains('open') ? '🗺️ 地図' : '📋 リスト';
}

// ===== JSONP =====
function jsonp(url, cb) {
  const name = '__calil_' + (jsonpCounter++);
  const script = document.createElement('script');
  window[name] = (data) => {
    cb(data);
    delete window[name];
    if (script.parentNode) script.parentNode.removeChild(script);
  };
  script.onerror = () => { cb(null); delete window[name]; };
  script.src = url + (url.includes('?') ? '&' : '?') + 'callback=' + name;
  document.head.appendChild(script);
}

// ===== 地域検索 =====
function searchByArea() {
  const pref = document.getElementById('pref-select').value;
  const city = document.getElementById('city-input').value.trim();
  if (!pref) { alert('都道府県を選択してください'); return; }
  setLoading('検索中...');
  let url = `https://api.calil.jp/library?appkey=${APPKEY}&pref=${encodeURIComponent(pref)}&format=json`;
  if (city) url += `&city=${encodeURIComponent(city)}`;
  jsonp(url, renderLibraries);
}

// ===== 現在地検索 =====
function searchByGeo() {
  if (!navigator.geolocation) { alert('このブラウザは位置情報に対応していません'); return; }
  setLoading('位置情報を取得中...');
  navigator.geolocation.getCurrentPosition(
    pos => {
      const { latitude: lat, longitude: lng } = pos.coords;
      L.circleMarker([lat, lng], {
        radius: 9, fillColor: '#2563eb', color: '#fff',
        weight: 2.5, fillOpacity: 0.95,
      }).addTo(map).bindPopup('<b>現在地</b>');
      map.setView([lat, lng], 13);
      setLoading('近くの図書館を検索中...');
      jsonp(`https://api.calil.jp/library?appkey=${APPKEY}&geocode=${lng},${lat}&format=json`, renderLibraries);
    },
    () => setLoading('位置情報の取得に失敗しました'),
  );
}

// ===== ローディング =====
function setLoading(msg) {
  document.getElementById('results-header').innerHTML =
    `<span class="spinner"></span><span style="font-size:0.78rem;color:#64748b;">${msg}</span>`;
  document.getElementById('lib-list').innerHTML = '';
}

// ===== マーカーアイコン =====
function makeIcon(isActive) {
  const bg  = isActive ? '#2563eb' : 'white';
  const brd = isActive ? '#1d4ed8' : '#2563eb';
  const clr = isActive ? '#fff'    : '#1e293b';
  return L.divIcon({
    html: `<div style="
      width:36px;height:36px;
      background:${bg};
      border:2.5px solid ${brd};
      border-radius:50% 50% 50% 0;
      transform:rotate(-45deg);
      box-shadow:0 2px 8px rgba(0,0,0,0.22);
      display:flex;align-items:center;justify-content:center;">
      <span style="transform:rotate(45deg);font-size:15px;color:${clr};">📚</span>
    </div>`,
    className: '',
    iconSize:    [36, 36],
    iconAnchor:  [18, 36],
    popupAnchor: [0, -40],
  });
}

// ===== 図書館一覧レンダリング =====
function renderLibraries(data) {
  clearMarkers();
  document.getElementById('results-header').innerHTML = '';

  const list = document.getElementById('lib-list');

  if (!data || data.length === 0) {
    list.innerHTML = `<div class="empty-state"><div class="icon">🔍</div><p>図書館が見つかりませんでした。<br>市区町村名を変えてお試しください。</p></div>`;
    return;
  }

  document.getElementById('results-header').innerHTML =
    `<strong>${data.length}件</strong>の図書館が見つかりました`;

  list.innerHTML = '';
  const bounds = [];

  data.forEach((lib, idx) => {
    const geo    = lib.geocode ? lib.geocode.split(',') : null;
    const lng    = geo ? parseFloat(geo[0]) : NaN;
    const lat    = geo ? parseFloat(geo[1]) : NaN;
    const hasGeo = !isNaN(lat) && !isNaN(lng);

    // リストアイテム
    const item = document.createElement('div');
    item.className = 'lib-item';
    item.id = 'lib-item-' + idx;
    item.innerHTML = `
      <div class="lib-name">${lib.formal || lib.short || '図書館'}</div>
      <div class="lib-addr">${lib.address || ''}</div>
      ${!hasGeo ? '<span class="no-geo-badge">地図なし</span>' : ''}
    `;
    item.addEventListener('click', () => focusLibrary(idx));
    list.appendChild(item);

    if (!hasGeo) {
      libraryMarkers.push({ marker: null, lib, idx, hasGeo: false });
      return;
    }

    const marker = L.marker([lat, lng], { icon: makeIcon(false) }).addTo(map);
    marker.bindPopup(buildPopup(lib, idx), { minWidth: 300, maxWidth: 340 });
    marker.on('click', () => setActive(idx));
    libraryMarkers.push({ marker, lib, idx, hasGeo: true, lat, lng });
    bounds.push([lat, lng]);
  });

  if (bounds.length > 0) {
    map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
  }

  // モバイルでリストを表示
  const sb = document.getElementById('sidebar');
  if (!sb.classList.contains('open') && window.innerWidth <= 700) {
    sb.classList.add('open');
  }
}

// ===== マーカークリア =====
function clearMarkers() {
  libraryMarkers.forEach(({ marker }) => marker && map.removeLayer(marker));
  libraryMarkers = [];
  activeIdx = null;
  Object.values(pollingTimers).forEach(clearTimeout);
  pollingTimers = {};
}

// ===== アクティブ切り替え =====
function setActive(idx) {
  if (activeIdx !== null) {
    libraryMarkers[activeIdx]?.marker?.setIcon(makeIcon(false));
    document.getElementById('lib-item-' + activeIdx)?.classList.remove('active');
  }
  activeIdx = idx;
  libraryMarkers[idx]?.marker?.setIcon(makeIcon(true));
  const item = document.getElementById('lib-item-' + idx);
  if (item) {
    item.classList.add('active');
    item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

// ===== リストクリックで地図フォーカス =====
function focusLibrary(idx) {
  setActive(idx);
  const entry = libraryMarkers[idx];
  if (!entry?.hasGeo) return;
  map.setView([entry.lat, entry.lng], Math.max(map.getZoom(), 15), { animate: true });
  entry.marker.openPopup();
}

// ===== ポップアップ HTML =====
function buildPopup(lib, idx) {
  const sid    = (lib.systemid || '').replace(/'/g, "\\'");
  const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent((lib.formal || '') + ' ' + (lib.address || ''))}`;
  const webLink = lib.url_pc
    ? `<a href="${lib.url_pc}" target="_blank" rel="noopener">🌐 公式サイト</a>`
    : '';

  return `
    <div class="popup-inner">
      <div class="popup-name">${lib.formal || lib.short || '図書館'}</div>
      ${lib.address ? `<div class="popup-row">📍 ${lib.address}</div>` : ''}
      ${lib.tel     ? `<div class="popup-row">📞 ${lib.tel}</div>`     : ''}
      <div class="popup-links">
        ${webLink}
        <a href="${mapUrl}" target="_blank" rel="noopener">🗺️ Google Maps</a>
      </div>
      <div class="popup-book-section">
        <div class="popup-book-label">📖 蔵書を確認（ISBN）</div>
        <div class="popup-isbn-row">
          <input type="text" id="p-isbn-${idx}" placeholder="例：9784101010014" maxlength="20"
                 onkeydown="if(event.key==='Enter') checkBookPopup(${idx},'${sid}')">
          <button onclick="checkBookPopup(${idx},'${sid}')">検索</button>
        </div>
        <div id="p-result-${idx}"></div>
      </div>
    </div>`;
}

// ===== 蔵書チェック =====
function checkBookPopup(idx, systemid) {
  const raw = (document.getElementById('p-isbn-' + idx)?.value || '').trim().replace(/-/g, '');
  if (!raw) { alert('ISBNを入力してください'); return; }
  if (!/^\d{10}(\d{3})?$/.test(raw)) { alert('ISBNは10桁または13桁の数字で入力してください'); return; }

  const resultEl = document.getElementById('p-result-' + idx);
  if (!resultEl) return;
  resultEl.innerHTML = `<p style="font-size:0.8rem;color:#64748b;margin-top:6px;"><span class="spinner"></span>確認中...</p>`;

  if (pollingTimers['p' + idx]) { clearTimeout(pollingTimers['p' + idx]); }

  const url = `https://api.calil.jp/check?appkey=${APPKEY}&isbn=${raw}&systemid=${encodeURIComponent(systemid)}&format=json`;
  jsonp(url, d => pollResult(idx, raw, systemid, d, resultEl));
}

function pollResult(idx, isbn, systemid, data, el) {
  if (!data) { el.innerHTML = '<p style="color:#dc2626;font-size:0.8rem;margin-top:6px;">エラーが発生しました</p>'; return; }
  renderBookResult(data, el);
  if (data.continue === 1) {
    pollingTimers['p' + idx] = setTimeout(() => {
      jsonp(
        `https://api.calil.jp/check?appkey=${APPKEY}&isbn=${isbn}&systemid=${encodeURIComponent(systemid)}&session=${data.session}&format=json`,
        d2 => pollResult(idx, isbn, systemid, d2, el),
      );
    }, 2000);
  }
}

function renderBookResult(data, el) {
  const STATUS = {
    OK:        { t: '貸出可',    c: 's-ok'   },
    Running:   { t: '確認中…',  c: 's-check' },
    Rental:    { t: '貸出中',    c: 's-loan'  },
    'On-loan': { t: '貸出中',    c: 's-loan'  },
    Return:    { t: '返却期限前', c: 's-loan'  },
    Preparing: { t: '準備中',    c: 's-loan'  },
    Reserving: { t: '予約中',    c: 's-loan'  },
    No:        { t: '蔵書なし',  c: 's-none'  },
    Error:     { t: 'エラー',    c: 's-unk'   },
  };

  const books = data.books;
  if (!books) { el.innerHTML = '<p style="font-size:0.8rem;color:#64748b;margin-top:6px;">蔵書情報なし</p>'; return; }

  let html = '';
  for (const isbn in books) {
    for (const sysid in books[isbn]) {
      const sys  = books[isbn][sysid];
      const libs = sys.libkey || {};
      const keys = Object.keys(libs);
      if (keys.length === 0) {
        html += `<div class="book-row"><span class="book-row-name">—</span><span class="status-badge s-none">蔵書なし</span></div>`;
      } else {
        keys.forEach(name => {
          const raw  = libs[name];
          const info = STATUS[raw] || { t: raw, c: 's-unk' };
          html += `<div class="book-row">
            <span class="book-row-name">${name}</span>
            <span class="status-badge ${info.c}">${info.t}</span>
          </div>`;
        });
      }
      if (sys.reserveurl) {
        html += `<a class="reserve-link" href="${sys.reserveurl}" target="_blank" rel="noopener">🔗 予約・詳細を見る</a>`;
      }
    }
  }
  el.innerHTML = html || '<p style="font-size:0.8rem;color:#64748b;margin-top:6px;">蔵書情報が見つかりませんでした</p>';
}
