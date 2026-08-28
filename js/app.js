/* ============================================================
 * BLE 蓝牙调试助手 - 主逻辑（Web Bluetooth）
 * 移植了桌面版的功能：GATT浏览/读写/定时读/订阅/
 * UART透传/协议解析/分色日志，并适配移动端 Web 蓝牙限制。
 * ============================================================ */
'use strict';

/* ---------- DOM 工具 ---------- */
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));

let toastTimer = null;
function toast(msg, isError = false) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.toggle('error', isError);
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
}

/* ---------- 状态 ---------- */
let device = null;        // BluetoothDevice
let server = null;        // GATT server
let servicesCache = [];   // [{service, uuid, name, chars:[{char,uuid,name,props}]}]
let lastValues = {};      // char uuid -> text  （最近一次值）
let subscribed = new Set();
let noteHandles = new Map(); // uuid -> char（防止重复订阅）
let uart = { txService: '', txChar: '', rxService: '', rxChar: '' };
let rxCharHandle = null;
let connectedName = '';
let connectedId = '';
let pollTimer = null;
let pollTarget = null;

const LOG_COLOR = { rx: '#4ade80', tx: '#38bdf8', sys: '#94a3b8', err: '#f87171' };
const LOG_TAG = { rx: 'RX', tx: 'TX', sys: 'SYS', err: 'ERR' };
const logFilters = { rx: true, tx: true, sys: true, err: true };
let viewFormat = 'hex';
let lastFs = '';
let sendMode = 'text';
let displayHex = true;

/* ============================================================
 * 日志
 * ============================================================ */
function gts() {
  const d = new Date();
  return d.toLocaleTimeString('zh-CN', { hour12: false }) + '.' + String(d.getMilliseconds()).padStart(3, '0');
}
function maybeScroll(el) {
  if (el && $('ckScroll').checked) el.scrollTop = el.scrollHeight;
}
function fmtHex(u8) { return displayHex ? hexBytes(u8) : decodedText(u8); }
function decodedText(u8) { return decodeUtf8(u8) ?? hexBytes(u8); }

// 统一分色日志（RX/TX/SYS/ERR）
function appendLog(kind, text) {
  const el = $('sysLog');
  if (!logFilters[kind]) return;
  el.insertAdjacentHTML('beforeend',
    `<span class="line l-${kind}"><span class="t">[${gts()}] </span><span class="tag">[${LOG_TAG[kind]}]</span> ${esc(text)}</span>`);
  maybeScroll(el);
}
function appendGatt(text, color) {
  const el = $('gattResult');
  el.insertAdjacentHTML('beforeend',
    `<span class="line"><span class="t">[${gts()}] </span><span style="color:${color}">${esc(text)}</span></span>`);
  maybeScroll(el);
}
function appendUartRx(label, u8) {
  const el = $('uartRx');
  el.insertAdjacentHTML('beforeend',
    `<span class="line l-rx"><span class="t">[${gts()}] </span><span class="tag">[RX]</span> ${esc(label)}${esc(fmtHex(u8))}</span>`);
  maybeScroll(el);
}
function exportLog() {
  const text = $('sysLog').textContent;
  downloadFile('ble_log.txt', plainTextify(text));
}
function plainTextify(htmlish) {
  // 简单按下层文本输出（去掉HTML标签由 textContent 已处理）
  return htmlish;
}

/* ============================================================
 * 浏览器支持 & 状态 UI
 * ============================================================ */
function detectSupport() {
  if (!navigator.bluetooth) {
    $('unsupported').classList.remove('hidden');
    $('btnScan').disabled = true;
    return false;
  }
  return true;
}
function setPill(state, text) {
  const p = $('connPill');
  p.className = 'pill ' + state;
  p.textContent = text;
}
function setConnUI(connected) {
  $('deviceSection').classList.toggle('hidden', !connected);
  $('tabs').classList.toggle('hidden', !connected);
  $('connectCard').classList.toggle('hidden', connected);
}
function normUuid(u) {
  const t = String(u || '').trim();
  if (!t) return '';
  try { return BluetoothUUID.canonicalUUID(t); } catch { return t; }
}
function canonicFilter(u) {
  const t = String(u || '').trim();
  if (!t) return '';
  try { return BluetoothUUID.canonicalUUID(t); } catch { return null; }
}

/* ============================================================
 * 连接 / 断开
 * ============================================================ */
let pendingDevice = null;  // 用户从系统列表选中的设备（尚未连接）

// 第一步：搜索设备。Web Bluetooth 不允许网页自行列出附近设备，
// 只能通过 requestDevice 弹出系统蓝牙列表，由用户点选。
async function searchDevice() {
  const name = $('fName').value.trim();
  const svc = $('fService').value.trim();
  const namedOnly = $('ckNamed').checked;

  // 「只看已知设备」：要让系统列表把未知/无名设备收进「其它设备」折叠区，
  // 必须带名称关键字（namePrefix）。没有关键字的话，浏览器无法按"有没有名字"过滤。
  if (namedOnly && !name) {
    toast('已勾选「只看已知设备」：请在上方「设备名称包含」填入关键字以过滤未知设备', true);
    setPill('', '未连接');
    return;
  }

  const opts = { acceptAllDevices: true };
  const filter = {};
  if (name) filter.namePrefix = name;
  if (svc) {
    const c = canonicFilter(svc);
    if (!c) { toast('服务 UUID 格式无效', true); return; }
    filter.services = [c];
  }
  if (name || svc) {
    opts.acceptAllDevices = false;
    opts.filters = [filter];
  }

  setPill('connecting', '搜索中…');
  try {
    const dev = await navigator.bluetooth.requestDevice(opts);
    // 「只看已知设备」兜底：系统列表无法主动过滤无名设备，选中后再次校验
    if (namedOnly && !dev.name) {
      $('selectedCard').classList.add('hidden');
      setPill('', '未连接');
      toast('该设备未命名，已按「只看已知设备」过滤', true);
      appendLog('sys', '所选设备没有名称，被「只看已知设备」过滤。如需连接，请取消勾选后再搜索。');
      return;
    }
    pendingDevice = dev;
    connectedName = dev.name || '(未命名)';
    connectedId = dev.id;
    lastFs = name;
    // 选出后先显示已选设备，等用户点「连接」
    $('selectedName').textContent = connectedName;
    $('selectedMeta').textContent = `id: ${connectedId.slice(0, 12)}…`;
    $('selectedCard').classList.remove('hidden');
    setPill('', '已选设备');
    appendLog('sys', `已选择设备：${connectedName}，请点击「连接」`);
  } catch (err) {
    if (err.name === 'SecurityError') {
      toast('需要 HTTPS 或授权', true);
      setPill('', '未连接');
      return;
    }
    if (err.name !== 'NotFoundError') appendLog('err', '搜索失败/取消：' + (err.message || err.name));
    setPill('', '未连接');
  }
}

// 第二步：真正建立连接
async function connectSelected() {
  if (!pendingDevice) { toast('请先搜索并选择设备', true); return; }
  const dev = pendingDevice;
  setPill('connecting', '连接中…');
  try {
    device = dev;
    server = await dev.gatt.connect();
    device = dev;
    const svcCount = await discoverServices();
    // 没有任何 GATT 服务 -> 视为不可用/不支持
    if (svcCount === 0) {
      await dev.gatt.disconnect().catch(() => {});
      throw new Error('该设备无可用的 GATT 服务');
    }
    setPill('connected', '已连接');
    renderAdvertisement(dev);
    $('deviceInfo').textContent = `${connectedName}  ·  id:${connectedId.slice(0, 8)}`;
    $('deviceLabel').textContent = `已连接 ${connectedName}`;
    $('metaLabel').textContent = '浏览器负责 MTU 协商';
    setConnUI(true);
    appendLog('sys', `连接成功：${connectedName} (${connectedId.slice(0, 12)}…)`);
    dev.addEventListener('gattserverdisconnected', onDisconnected);
  } catch (err) {
    // 连接失败 -> 视为未知/不支持的设备，自动过滤
    pendingDevice = null;
    $('selectedCard').classList.add('hidden');
    setPill('', '未连接');
    appendLog('err', '所选设备不可用（未知或不支持），已过滤：' + (err.message || err.name));
    toast('设备不可用，已过滤', true);
  }
}

async function reconnectDevice() {
  const name = lastFs || $('fName').value.trim();
  try {
    const opts = {};
    if (name) { opts.acceptAllDevices = false; opts.filters = [{ namePrefix: name }]; }
    else opts.acceptAllDevices = true;
    const dev = await navigator.bluetooth.requestDevice(opts);
    device = dev;
    connectedName = dev.name || '(未命名)';
    connectedId = dev.id;
    server = await dev.gatt.connect();
    setPill('connected', '已连接');
    $('deviceInfo').textContent = `${connectedName}  ·  id:${connectedId.slice(0, 8)}`;
    setConnUI(true);
    $('btnReconnect').classList.add('hidden');
    appendLog('sys', `重新连接成功：${connectedName}`);
    await discoverServices();
    dev.addEventListener('gattserverdisconnected', onDisconnected);
  } catch (err) {
    appendLog('err', '重新连接失败：' + (err.message || err.name));
    setPill('', '未连接');
  }
}

function onDisconnected(e) {
  stopPoll();
  subscribed.clear();
  noteHandles.clear();
  rxCharHandle = null;
  if (device && e.target === device) {
    setPill('', '已断开');
    setConnUI(false);
    $('btnReconnect').classList.remove('hidden');
    appendLog('sys', '连接已断开（设备端断开或信号丢失），可点击「重新连接」');
  }
}

async function disconnectDevice() {
  stopPoll();
  if (device && device.gatt.connected) {
    try { await device.gatt.disconnect(); } catch {}
  }
  device = null; server = null; servicesCache = [];
  $('svcTree').innerHTML = '';
  $('advView').textContent = '（连接后自动解析该设备的广播数据）';
  setPill('', '未连接');
  setConnUI(false);
  appendLog('sys', '已断开连接');
}

/* ============================================================
 * 广播数据解析（Web 版：基于 device.adData）
 * ============================================================ */
function renderAdvertisement(dev) {
  const el = $('advView');
  const ad = dev.adData;
  const lines = [];
  lines.push(`设备名称 : ${dev.name || '(未命名)'}`);
  lines.push(`设备 ID  : ${dev.id}`);
  if (!ad) {
    lines.push('（无可用的广播数据）');
    el.innerHTML = renderKV(lines);
    return;
  }
  lines.push(`可连接 : ${ad.connected === false ? '否' : '是'}`);
  if (ad.rssi != null) lines.push(`RSSI : ${ad.rssi} dBm`);
  if (ad.txPower != null) lines.push(`TX 功率 : ${ad.txPower} dBm`);
  if (ad.appearance != null) lines.push(`外观 : 0x${ad.appearance.toString(16).padStart(4, '0')} (${appearanceName(ad.appearance)})`);
  if (ad.serviceUUIDs && ad.serviceUUIDs.size) {
    lines.push('服务 UUID:');
    for (const u of ad.serviceUUIDs) {
      const n = serviceName(u);
      lines.push(`  ${shortUuid(u)}${n ? ' - ' + n : ''}`);
    }
  } else {
    lines.push('服务 UUID: （无）');
  }
  if (ad.manufacturerData && ad.manufacturerData.size) {
    lines.push('厂商数据:');
    for (const [id, data] of ad.manufacturerData) {
      const dv = new DataView(data.buffer, data.byteOffset || 0, data.byteLength || 0);
      const company = dv.byteLength >= 2 ? dv.getUint16(0, true) : id;
      const rest = new Uint8Array(data.buffer, (data.byteOffset || 0) + (dv.byteLength >= 2 ? 2 : 0), data.byteLength - (dv.byteLength >= 2 ? 2 : 0));
      lines.push(`  ${companyName(company)} (0x${company.toString(16).padStart(4, '0')}): ${hexBytes(rest)}`);
    }
  }
  if (ad.serviceData && ad.serviceData.size) {
    lines.push('服务数据:');
    for (const [u, data] of ad.serviceData) {
      lines.push(`  ${shortUuid(u)}: ${hexBytes(new Uint8Array(data.buffer, data.byteOffset || 0, data.byteLength || 0))}`);
    }
  }
  el.innerHTML = renderKV(lines);
}
function renderKV(lines) {
  return lines.map((l) => `<div>${esc(l)}</div>`).join('');
}

/* ============================================================
 * GATT 服务浏览
 * ============================================================ */
async function discoverServices() {
  const tree = $('svcTree');
  tree.innerHTML = '<div class="placeholder">正在读取服务…</div>';
  servicesCache = [];
  try {
    const svcs = await server.getPrimaryServices();
    for (const svc of svcs) {
      const chars = [];
      let chs = [];
      try { chs = await svc.getCharacteristics(); } catch {}
      for (const ch of chs) {
        chars.push({ char: ch, uuid: ch.uuid, name: characteristicName(ch.uuid), props: ch.properties });
      }
      servicesCache.push({ service: svc, uuid: svc.uuid, name: serviceName(svc.uuid), chars });
    }
    renderSvcTree();
    fillProtoCharSelect();
    appendLog('sys', `已发现 ${servicesCache.length} 个服务`);
    return servicesCache.length;
  } catch (err) {
    tree.innerHTML = `<div class="placeholder err">读取服务失败：${esc(err.message)}</div>`;
    appendLog('err', '读取 GATT 服务失败：' + err.message);
    return 0;
  }
}

function renderSvcTree() {
  const tree = $('svcTree');
  if (!servicesCache.length) { tree.innerHTML = '<div class="placeholder">未发现服务。</div>'; return; }
  tree.innerHTML = '';
  servicesCache.forEach((svc) => {
    const card = document.createElement('div');
    card.className = 'svc';
    card.innerHTML = `
      <div class="svc-head"><span class="svc-name">${esc(svc.name || '服务')}</span>
        <span class="mono dim">${esc(shortUuid(svc.uuid))}</span></div>
      <div class="svc-body"></div>`;
    const body = card.querySelector('.svc-body');
    card.querySelector('.svc-head').addEventListener('click', () => body.classList.toggle('open'));

    if (!svc.chars.length) {
      body.insertAdjacentHTML('beforeend', '<div class="dim" style="padding:6px 0">（无特征）</div>');
    }
    svc.chars.forEach((ci) => {
      const props = Object.keys(ci.props).filter((k) => ci.props[k]);
      const propsText = props.join(' ') || '无属性';
      const row = document.createElement('div');
      row.className = 'char';
      row.dataset.uuid = ci.uuid;
      row.innerHTML = `
        <div class="char-head">
          <span class="char-title">${esc(ci.name || '特征')}</span>
          <span class="dim mono">${esc(shortUuid(ci.uuid))}</span>
        </div>
        <div class="char-props">${esc(propsText)}</div>
        <div class="char-actions"></div>
        <div class="char-value" data-out>值：<span class="dim">—</span></div>`;
      const acts = row.querySelector('.char-actions');
      const btn = (label, cls) => { const b = document.createElement('button'); b.className = 'btn ' + cls; b.textContent = label; return b; };

      if (ci.props.read) {
        const r = btn('读取', 'ghost small'); acts.appendChild(r);
        const p = btn('定读', 'ghost small'); p.textContent = '定读'; acts.appendChild(p);
        p.addEventListener('click', () => togglePoll(ci, p));
        r.addEventListener('click', () => readChar(ci));
      }
      if (ci.props.notify || ci.props.indicate) {
        const n = btn(ci.props.notify ? '订阅' : '订阅(表)', 'ghost small accent');
        acts.appendChild(n);
        n.dataset.uuid = ci.uuid;
        n.addEventListener('click', () => toggleNotify(ci, n));
      }
      if (ci.props.write || ci.props.writeWithoutResponse) {
        const inp = document.createElement('input');
        inp.className = 'text mono write-in';
        inp.placeholder = '写入内容（HEX 或文本）';
        inp.dataset.uuid = ci.uuid;
        acts.appendChild(inp);
        if (ci.props.write) { const w = btn('写', 'ghost small'); w.addEventListener('click', () => writeChar(ci, inp, false)); acts.appendChild(w); }
        if (ci.props.writeWithoutResponse) { const w = btn('无响应', 'ghost small'); w.addEventListener('click', () => writeChar(ci, inp, true)); acts.appendChild(w); }
      }

      body.appendChild(row);
    });
    tree.appendChild(card);
  });
}

function findChar(ciUuid) {
  for (const svc of servicesCache) {
    const found = svc.chars.find((c) => c.uuid === ciUuid);
    if (found) return { svc, ci: found };
  }
  return null;
}

function setCharValue(uuid, text) {
  lastValues[uuid] = text;
  const row = document.querySelector(`.char[data-uuid="${uuid}"]`);
  if (row) {
    const v = row.querySelector('.char-value span');
    if (v) { v.textContent = text; v.classList.remove('dim'); }
  }
}

async function readChar(ci) {
  try {
    const u8 = new Uint8Array(await ci.char.readValue());
    const text = formatForView(u8);
    setCharValue(ci.uuid, text);
    appendLog('rx', `读取 ${charLabel(ci.uuid)}: ${formatData(u8)}`);
    appendGatt(`读取 ${charLabel(ci.uuid)}: ${formatData(u8)}`, '#4ade80');
    protoOnData(ci.uuid, u8, 'read');
  } catch (err) {
    appendLog('err', `读取 ${charLabel(ci.uuid)} 失败：${err.message}`);
    toast('读取失败', true);
  }
}

async function writeChar(ci, inp, noResp) {
  const text = inp.value;
  if (!text.trim()) { toast('请输入内容', true); return; }
  let u8;
  try { u8 = encodeAuto(text); } catch (err) { toast(err.message, true); return; }
  if (!u8.length) { toast('没有可发送的数据', true); return; }
  try {
    if (noResp) await ci.char.writeValueWithoutResponse(u8);
    else await ci.char.writeValue(u8);
    const mode = noResp ? '写入(无响应)' : '写入';
    appendLog('tx', `${mode} ${charLabel(ci.uuid)}: ${formatData(u8)}`);
    appendGatt(`${mode} ${charLabel(ci.uuid)}: ${formatData(u8)}`, '#38bdf8');
    setCharValue(ci.uuid, formatForView(u8));
  } catch (err) {
    appendLog('err', `${noResp ? '无响应写入' : '写入'} ${charLabel(ci.uuid)} 失败：${err.message}`);
    toast('写入失败', true);
  }
}

async function toggleNotify(ci, btn) {
  if (subscribed.has(ci.uuid)) {
    try { await ci.char.stopNotifications(); } catch {}
    subscribed.delete(ci.uuid);
    noteHandles.delete(ci.uuid);
    if (rxCharHandle === ci.char) rxCharHandle = null;
    btn.textContent = ci.props.notify ? '订阅' : '订阅(表)';
    btn.classList.remove('on');
    appendLog('sys', `已取消订阅：${charLabel(ci.uuid)}`);
    return;
  }
  try {
    await ci.char.startNotifications();
    ci.char.addEventListener('characteristicvaluechanged', (e) => {
      const u8 = new Uint8Array(e.target.value.buffer.slice(0));
      const text = formatForView(u8);
      setCharValue(ci.uuid, text);
      appendLog('rx', `通知 ${charLabel(ci.uuid)}: ${formatData(u8)}`);
      appendGatt(`通知 ${charLabel(ci.uuid)}: ${formatData(u8)}`, '#4ade80');
      protoOnData(ci.uuid, u8, 'notify');
      if (rxCharHandle && e.target === rxCharHandle) {
        appendUartRx('', u8);
      }
    });
    subscribed.add(ci.uuid);
    noteHandles.set(ci.uuid, ci.char);
    btn.textContent = '取消订阅';
    btn.classList.add('on');
    appendLog('sys', `已订阅通知：${charLabel(ci.uuid)}`);
  } catch (err) {
    appendLog('err', `订阅失败：${err.message}`);
    toast('订阅失败', true);
  }
}

// 定时读取（全局一组）
function togglePoll(ci, btn) {
  if (pollTimer) { stopPoll(); toast('已停止定读'); return; }
  pollTarget = ci.uuid;
  const sec = Math.max(1, parseInt($('pollInterval').value, 10) || 1);
  readChar(ci);
  pollTimer = setInterval(() => { if (device && device.gatt.connected) readChar(findChar(pollTarget).ci); else stopPoll(); }, sec * 1000);
  btn.textContent = '停止定读';
  btn.classList.add('on');
  appendLog('sys', `开始定时读取 ${charLabel(ci.uuid)}, 每 ${sec} 秒`);
  toast('开始定读');
}
function stopPoll() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; pollTarget = null; }
  document.querySelectorAll('.char button').forEach((b) => { if (b.textContent === '停止定读') { b.textContent = '定读'; b.classList.remove('on'); } });
}

function formatForView(u8) {
  if (viewFormat === 'ascii') return asciiBytes(u8) || '(空)';
  if (viewFormat === 'both') return formatData(u8);
  return hexBytes(u8) || '(空)';
}

/* ============================================================
 * UART 透传
 * ============================================================ */
function loadUart() {
  try { const s = JSON.parse(localStorage.getItem('ble_uart') || 'null'); if (s) uart = Object.assign(uart, s); } catch {}
  $('uartTxSvc').value = uart.txService; $('uartTxChar').value = uart.txChar;
  $('uartRxSvc').value = uart.rxService; $('uartRxChar').value = uart.rxChar;
}
function saveUart() {
  uart = {
    txService: $('uartTxSvc').value.trim(), txChar: $('uartTxChar').value.trim(),
    rxService: $('uartRxSvc').value.trim(), rxChar: $('uartRxChar').value.trim(),
  };
  localStorage.setItem('ble_uart', JSON.stringify(uart));
  autoSubRx();
  toast('UART 配置已保存'); appendLog('sys', 'UART 配置已保存');
}
async function autoSubRx() {
  if (!server || !uart.rxChar) return;
  const canon = canonicFilter(uart.rxChar);
  if (!canon) return;
  const find = findChar(canon);
  if (!find || !(find.ci.props.notify || find.ci.props.indicate)) return;
  if (subscribed.has(canon)) return;
  try {
    await find.ci.char.startNotifications();
    find.ci.char.addEventListener('characteristicvaluechanged', (e) => {
      const u8 = new Uint8Array(e.target.value.buffer.slice(0));
      appendUartRx('', u8);
      protoOnData(canon, u8, 'notify');
    });
    rxCharHandle = find.ci.char;
    subscribed.add(canon);
    appendLog('sys', `已自动订阅 RX 特征值(${shortUuid(canon)})`);
  } catch (err) { appendLog('err', '自动订阅 RX 失败：' + err.message); }
}

async function sendUart() {
  const raw = $('sendInput').value;
  if (!raw.trim()) { toast('请输入内容', true); return; }
  let u8;
  if (sendMode === 'hex') { try { u8 = parseHex(raw); } catch (err) { toast(err.message, true); return; } if (!u8.length) { toast('HEX 无效', true); return; } }
  else u8 = encodeAuto(raw);

  let target;
  if (uart.txChar) {
    const canon = canonicFilter(uart.txChar);
    const find = canon ? findChar(canon) : null;
    if (find) target = find.ci;
    else { toast('未找到配置的 TX 特征', true); return; }
  } else {
    for (const svc of servicesCache) {
      const ci = svc.chars.find((c) => c.props.write || c.props.writeWithoutResponse);
      if (ci) { target = ci; break; }
    }
    if (!target) { toast('设备没有可写特征，请配置 TX UUID', true); return; }
  }
  try {
    if (target.props.writeWithoutResponse) await target.char.writeValueWithoutResponse(u8);
    else await target.char.writeValue(u8);
    appendUartTx(u8);
    appendLog('tx', `TX -> ${charLabel(target.uuid)}: ${formatData(u8)}`);
  } catch (err) {
    appendLog('err', '发送失败：' + err.message); toast('发送失败', true);
  }
}
function appendUartTx(u8) {
  const el = $('uartRx');
  el.insertAdjacentHTML('beforeend',
    `<span class="line l-tx"><span class="t">[${gts()}] </span><span class="tag">[TX]</span> ${esc(fmtHex(u8))}</span>`);
  maybeScroll(el);
}

/* ============================================================
 * 协议解析 UI
 * ============================================================ */
let protoRules = [];      // {uuid,name,offset,type,endian,unit,enum_text}
let protoBytes = null;    // 当前字节视图 Uint8Array
let selectedRange = [];   // [start,end]
let resultColumns = [];

function ptypeSize(t) { return TYPE_SIZES[t]; }

function loadProtocols() {
  try { protoRules = JSON.parse(localStorage.getItem('ble_protocols') || '[]'); } catch { protoRules = []; }
  renderRules();
}
function saveProtocols() { localStorage.setItem('ble_protocols', JSON.stringify(protoRules)); }

function fillProtoCharSelect() {
  const sel = $('protoChar');
  const cur = sel.value;
  sel.innerHTML = '';
  const seen = {};
  for (const svc of servicesCache) for (const ci of svc.chars) {
    if (seen[ci.uuid]) continue; seen[ci.uuid] = 1;
    const o = document.createElement('option');
    o.value = ci.uuid; o.textContent = `${ci.name || '特征'} (${shortUuid(ci.uuid)})`;
    sel.appendChild(o);
  }
  if (cur && seen[cur]) sel.value = cur;
}

function protoOnData(uuid, u8, kind) {
  if (kind !== 'read' && kind !== 'notify') return;
  // 更新字节视图（若选择了对应特征或未选择时自动切换）
  const sel = $('protoChar');
  const canon = normUuid(uuid);
  if (sel.options.length && $('protoHex').value.trim() === '') {
    // 自动把当前所选特征数据填进来
    const opt = Array.from(sel.options).find((o) => o.value === canon);
    if (!opt && !sel.value) sel.value = canon;
  }
  protoShowBytes(canon, u8);
  const rules = protoRules.filter((r) => normUuid(r.uuid) === canon && r.name);
  if (!rules.length) return;
  addResultRow(canon, u8, rules);
}

function protoShowBytes(uuid, u8) {
  protoBytes = u8;
  selectedRange = [];
  const sel = $('protoChar');
  if (uuid) {
    const exists = Array.from(sel.options).find((o) => o.value === uuid);
    if (exists) sel.value = uuid;
  }
  renderByteView();
}

function renderByteView() {
  const el = $('byteView');
  if (!protoBytes || !protoBytes.length) { el.innerHTML = '<div class="dim">无数据</div>'; $('byteHint').textContent = '读取或通知的数据会自动显示（HEX 在上，序号在表头）。'; return; }
  let head = '', hex = '', ascii = '';
  for (let i = 0; i < protoBytes.length; i++) {
    const sel = i >= selectedRange[0] && i <= selectedRange[1];
    head += `<span class="b-i ${sel ? 'sel' : ''}" data-i="${i}">${i}</span>`;
    hex += `<span class="b-f ${sel ? 'sel' : ''}" data-i="${i}">${protoBytes[i].toString(16).padStart(2, '0').toUpperCase()}</span>`;
    ascii += `<span class="b-a ${sel ? 'sel' : ''}" data-i="${i}">${protoBytes[i] >= 32 && protoBytes[i] < 127 ? String.fromCharCode(protoBytes[i]) : '.'}</span>`;
  }
  el.innerHTML = `
    <div class="bv-row"><span class="bv-lab">#</span>${head}</div>
    <div class="bv-row"><span class="bv-lab">H</span>${hex}</div>
    <div class="bv-row"><span class="bv-lab">A</span>${ascii}</div>`;
  $('byteHint').textContent = `${protoBytes.length} 字节；点选字节，再点「选中字节 → 添加字段」。`;
}

// 字节选择：用事件委托处理点击
function bindByteSelect() {
  $('byteView').addEventListener('click', (e) => {
    const s = e.target.closest('.b-f');
    if (!s) return;
    const i = Number(s.dataset.i);
    if (e.shiftKey && selectedRange.length) {
      selectedRange = [Math.min(selectedRange[0], i), Math.max(selectedRange[0], i)];
    } else {
      selectedRange = [i, i];
    }
    renderByteView();
  });
  $('byteView').addEventListener('dblclick', (e) => {
    const s = e.target.closest('.b-f');
    if (!s) { /* noop */ }
  });
}

function addFieldFromSelection() {
  if (!selectedRange.length) { toast('请先点选一段字节', true); return; }
  const uuid = $('protoChar').value;
  if (!uuid) { toast('请先选择特征', true); return; }
  const start = selectedRange[0];
  const len = selectedRange[1] - start + 1;
  const max = protoBytes ? protoBytes.length : 0;
  if (start + len > (max || Infinity)) { toast('偏移超出数据范围', true); return; }
  const type = DEFAULT_TYPE_BY_LEN[len] || 'uint8';
  protoRules.push({ uuid: normUuid(uuid), name: `字段${start}`, offset: start, type, endian: 'big', unit: '', enum_text: '' });
  saveProtocols(); renderRules();
  toast(`已添加字段：偏移 ${start}, 长度 ${len}(${type})`);
}

function renderRules() {
  const wrap = $('ruleTable');
  wrap.innerHTML = '';
  if (!protoRules.length) {
    wrap.innerHTML = '<div class="dim">尚无规则。读取/粘贴数据后在字节视图点选，再点「选中字节 → 添加字段」。</div>';
    return;
  }
  protoRules.forEach((r, idx) => {
    const row = document.createElement('div');
    row.className = 'rule-row';
    row.innerHTML = `
      <div class="rr-field">特征
        <input class="text mono" data-f="uuid" value="${esc(r.uuid)}" placeholder="特征UUID">
      </div>
      <div class="rr-grid">
        <label>字段名<input class="text" data-f="name" value="${esc(r.name)}"></label>
        <label>偏移<input class="text mono" data-f="offset" type="number" value="${esc(r.offset)}"></label>
        <label>类型<select class="text" data-f="type">${TYPE_ORDER.map((t) => `<option ${t === r.type ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
        <label>字节序<select class="text" data-f="endian"><option ${r.endian === 'little' ? 'selected' : ''}>little</option><option ${r.endian === 'big' ? 'selected' : ''}>big</option></select></label>
        <label>单位<input class="text" data-f="unit" value="${esc(r.unit)}"></label>
        <label>枚举(值=文本,分号分隔)<input class="text mono" data-f="enum_text" value="${esc(r.enum_text)}"></label>
      </div>`;
    wrap.appendChild(row);
    row.addEventListener('input', () => {
      const ur = row.querySelector('[data-f="uuid"]').value;
      const o = row.querySelector('[data-f="offset"]').value;
      const ty = row.querySelector('[data-f="type"]').value;
      const en = row.querySelector('[data-f="endian"]').value;
      r.uuid = normUuid(ur); r.name = row.querySelector('[data-f="name"]').value;
      r.offset = parseInt(o, 10) || 0; r.type = ty; r.endian = en;
      r.unit = row.querySelector('[data-f="unit"]').value;
      r.enum_text = row.querySelector('[data-f="enum_text"]').value;
      saveProtocols();
    });
  });
}

function addEmptyRule() {
  const uuid = $('protoChar').value || '';
  protoRules.push({ uuid: normUuid(uuid), name: '', offset: 0, type: 'uint16', endian: 'big', unit: '', enum_text: '' });
  saveProtocols(); renderRules();
}
function delRule() {
  // 简单实现：删除最后一个（移动端免选择）
  if (!protoRules.length) return;
  protoRules.pop(); saveProtocols(); renderRules();
}

let resultRows = [];
function addResultRow(uuid, u8, rules) {
  if (!rules.length) return;
  const fields = rules.map((r) => r.name || charLabel(r.uuid));
  const headers = ['时间'].concat(fields, ['原始HEX']);
  const table = $('resultTable');
  if (resultColumns.join('\u0001') !== headers.join('\u0001')) {
    resultColumns = headers;
    table.innerHTML = '';
  }
  const vals = rules.map((r) => { const { text, error } = parseProtocol(u8, r); return error ? `ERR ${error}` : text; });
  const row = document.createElement('div');
  row.className = 'res-row';
  row.innerHTML = headers.map((h, i) => {
    const val = i === 0 ? gts() : (i === headers.length - 1 ? hexBytes(u8) : vals[i - 1]);
    return `<span class="res-c" data-h="${esc(h)}">${esc(val)}</span>`;
  }).join('');
  table.appendChild(row);
  table.scrollTop = table.scrollHeight;
}
function clearResults() { $('resultTable').innerHTML = ''; resultColumns = []; }
function exportCsv() {
  const table = $('resultTable');
  if (!table.children.length) { toast('暂无解析结果'); return; }
  const headers = Array.from(table.querySelector('.res-row span')).map((s) => s.dataset.h);
  const lines = [headers.join(',')];
  table.querySelectorAll('.res-row').forEach((r) => {
    lines.push(Array.from(r.querySelectorAll('.res-c')).map(csvCell).join(','));
  });
  const bom = '\uFEFF';
  downloadFile('protocol_result.csv', bom + lines.join('\r\n'));
}
function csvCell(s) { const t = s.textContent; return '"' + t.replace(/"/g, '""') + '"'; }

function downloadFile(name, text) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = name;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 100);
}

/* ============================================================
 * 页签切换
 * ============================================================ */
function switchTab(name) {
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === name));
  document.querySelectorAll('.tab-body').forEach((b) => b.classList.toggle('active', b.id === 'tab-' + name));
}

/* ============================================================
 * 初始化
 * ============================================================ */
function init() {
  if (!detectSupport()) return;

  $('btnScan').addEventListener('click', searchDevice);
  $('btnConnectSel').addEventListener('click', connectSelected);
  $('btnDisconnect').addEventListener('click', disconnectDevice);
  $('btnReconnect').addEventListener('click', reconnectDevice);
  $('btnRefreshSvc').addEventListener('click', () => server && discoverServices());
  $('btnSaveUart').addEventListener('click', saveUart);
  $('btnSend').addEventListener('click', sendUart);
  $('btnClearUartRx').addEventListener('click', () => { $('uartRx').textContent = ''; });
  $('btnClearLog').addEventListener('click', () => { $('sysLog').textContent = ''; });
  $('btnExportLog').addEventListener('click', exportLog);
  $('btnClearRes').addEventListener('click', clearResults);
  $('btnExportCsv').addEventListener('click', exportCsv);
  $('btnAddRule').addEventListener('click', addEmptyRule);
  $('btnDelRule').addEventListener('click', delRule);
  $('btnAddField').addEventListener('click', addFieldFromSelection);
  $('btnProtoLoad').addEventListener('click', () => {
    try { const u8 = parseHex($('protoHex').value); if (!u8.length) { toast('HEX 无效', true); return; } protoShowBytes($('protoChar').value, u8); }
    catch (err) { toast(err.message, true); }
  });
  $('viewFormat').addEventListener('change', (e) => { viewFormat = e.target.value; });
  $('ckHex').addEventListener('change', (e) => { displayHex = e.target.checked; });
  $('sendMode').addEventListener('click', (e) => {
    const b = e.target.closest('.seg-btn'); if (!b) return;
    sendMode = b.dataset.mode;
    document.querySelectorAll('#sendMode .seg-btn').forEach((x) => x.classList.toggle('active', x === b));
    $('sendInput').placeholder = sendMode === 'hex' ? '输入 HEX，如 01 02 A0 FF' : '输入文本…';
  });
  document.querySelectorAll('input[data-filter]').forEach((chk) => {
    chk.addEventListener('change', () => { logFilters[chk.dataset.filter] = chk.checked; });
  });
  document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => switchTab(t.dataset.tab)));

  bindByteSelect();
  loadUart();
  loadProtocols();

  setPill('', '未连接');
  appendLog('sys', '就绪。请点击「连接设备」，在弹出的系统选择框中选择你的 BLE 设备。');
}

document.addEventListener('DOMContentLoaded', init);