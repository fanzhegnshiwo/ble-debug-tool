/* ============================================================
 * BLE 蓝牙调试助手 - 核心逻辑
 * 基于 Web Bluetooth API，需 Android + Chrome/Edge
 * ============================================================ */

'use strict';

/* ---------- 工具 ---------- */
const $ = (id) => document.getElementById(id);
const ESC = { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' };
const esc = (s) => String(s).replace(/[<>&"]/g, (c) => ESC[c]);

let ToastTimer = null;
function toast(msg, isError = false) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.toggle('error', isError);
  el.classList.add('show');
  clearTimeout(ToastTimer);
  ToastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

function sysLog(msg) {
  const pre = $('sysLog');
  const d = new Date();
  const ts = d.toLocaleTimeString('zh-CN', { hour12: false });
  pre.insertAdjacentHTML('beforeend', `<span class="line"><span class="t">[${ts}] </span>${esc(msg)}</span>`);
  maybeScroll(pre);
}

function maybeScroll(el) {
  if ($('ckAutoScroll').checked) el.scrollTop = el.scrollHeight;
}

/* ---------- 显示模式 ---------- */
let displayHex = true;   // ckHex 默认勾选
let currentSendMode = 'text';

function setSendMode(mode) {
  currentSendMode = mode;
  document.querySelectorAll('#modeSeg .seg-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.mode === mode);
  });
  $('sendInput').placeholder = mode === 'hex'
    ? '输入 HEX，如：01 02 A0 FF（空格分隔）'
    : '输入要发送的文本…';
}

/* ---------- 字节<->显示 ---------- */
function bytesToHex(u8) {
  const arr = Array.from(u8);
  return arr.map((b) => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
}

// 根据显示模式格式化收到/发出的数据
function fmtData(u8, prefix) {
  if (displayHex) return bytesToHex(u8);
  // 文本模式：尝试按 UTF-8 解码，失败则退回 HEX
  try {
    const txt = new TextDecoder('utf-8', { fatal: true }).decode(u8);
    return escapedControl(txt);
  } catch {
    return bytesToHex(u8);
  }
}

function escapedControl(s) {
  return s
    .replace(/[^\x20-\x7E\x0A\x0D\t\u4e00-\u9fff]/g, (c) => '\\x' + c.charCodeAt(0).toString(16).padStart(2, '0'))
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function fmtTs() {
  const d = new Date();
  return d.toLocaleTimeString('zh-CN', { hour12: false }) + '.' + String(d.getMilliseconds()).padStart(3, '0');
}

/* ---------- 状态 ---------- */
let device = null;        // BluetoothDevice
let server = null;        // GATTServer
let servicesCache = [];   // {service, uuid, chars:[{char, uuid, name, props}]}
let uart = { txService: '', txChar: '', rxService: '', rxChar: '' };
let rxSubscribed = false;
let rxCharHandle = null;

const BT_SERVICE = BluetoothUUID && BluetoothUUID.canonicalUUID;
function normUuid(u) { return BT_SERVICE ? BluetoothUUID.canonic((u || '').trim()) : ''; }

/* ---------- 浏览器支持检测 ---------- */
function detectSupport() {
  if (!navigator.bluetooth) {
    $('unsupported').classList.remove('hidden');
    $('btnConnect').disabled = true;
    toast('当前浏览器不支持 Web Bluetooth', true);
    return false;
  }
  return true;
}

/* ---------- UI 状态切换 ---------- */
function setConnState(state) {
  const st = $('connStatus');
  st.className = 'conn-status';
  if (state === 'connected') {
    st.textContent = '已连接';
    st.classList.add('connected');
    $('btnConnect').classList.add('hidden');
    $('btnScan').classList.remove('hidden');
    $('btnDisconnect').classList.remove('hidden');
    $('devicePanel').classList.remove('hidden');
    $('tabs').classList.remove('hidden');
    $('deviceName').textContent = device && device.name ? device.name : '(未命名设备)';
  } else if (state === 'connecting') {
    st.textContent = '连接中…';
    st.classList.add('connecting');
  } else {
    st.textContent = '未连接';
    $('btnConnect').classList.remove('hidden');
    $('btnScan').classList.add('hidden');
    $('btnDisconnect').classList.add('hidden');
    $('devicePanel').classList.add('hidden');
    $('tabs').classList.add('hidden');
    ['uart', 'browse', 'notify', 'log'].forEach((t) => switchTab(t, false));
  }
}

/* ---------- Tab 切换 ---------- */
function switchTab(name, opt = true) {
  const navs = document.querySelectorAll('.tab');
  navs.forEach((t) => t.classList.toggle('active', t.dataset.tab === name));
  const contents = document.querySelectorAll('.tab-content');
  contents.forEach((c) => c.classList.toggle('active', c.id === 'tab-' + name));
  if (opt) window.location.hash = name;
}

document.querySelectorAll('.tab').forEach((t) => {
  t.addEventListener('click', () => switchTab(t.dataset.tab));
});

function tabFromHash() {
  const h = window.location.hash.replace('#', '');
  if (['uart', 'browse', 'notify', 'log'].includes(h)) switchTab(h, false);
}

/* ============================================================
 * 扫描与连接
 * ============================================================ */
async function scan() {
  if (!navigator.bluetooth) return;
  const filterUuid = $('filterUuid').value.trim();
  const scanStateEl = $('scanState');
  const listEl = $('deviceList');

  // 构建请求选项
  const opts = { acceptAllDevices: true };
  if (filterUuid) {
    try {
      opts.acceptAllDevices = false;
      opts.filters = [{ services: [BT_SERVICE ? normUuid(filterUuid) : filterUuid] }];
    } catch {
      toast('服务 UUID 格式无效', true);
      return;
    }
  }

  $('scanPanel').classList.remove('hidden');
  scanStateEl.textContent = '扫描中…';
  listEl.innerHTML = '';
  sysLog('开始扫描附近 BLE 设备…');

  try {
    device = await navigator.bluetooth.requestDevice(opts);
    scanStateEl.textContent = '已选择，连接中…';
    await connect();
  } catch (err) {
    if (err.name === 'NotFoundError') {
      scanStateEl.textContent = '未找到设备';
    } else if (err.name === 'SecurityError') {
      scanStateEl.textContent = '未授权 / 需要 HTTPS';
      toast('需要 HTTPS 或授权，请检查', true);
    } else {
      scanStateEl.textContent = '已取消';
    }
    sysLog('扫描结束: ' + err.message);
  }
}

async function connect() {
  setConnState('connecting');
  sysLog('正在连接设备…');
  try {
    server = await device.gatt.connect();
    await discoverServices();
    setConnState('connected');
    sysLog('连接成功');
    toast('连接成功');
    setupUartFallback();
  } catch (err) {
    sysLog('连接失败: ' + err.message);
    toast('连接失败: ' + err.message, true);
    setConnState('disconnected');
    server = null;
  }
}

async function disconnect() {
  if (device && device.gatt.connected) {
    try { await device.gatt.disconnect(); } catch {}
  }
  cleanupSubscriptions();
  server = null;
  device = null;
  servicesCache = [];
  $('servicesTree').innerHTML = '';
  $('rxLog').textContent = '';
  $('notifyLog').textContent = '';
  setConnState('disconnected');
  sysLog('已断开连接');
  toast('已断开');
}

/* ============================================================
 * GATT 服务发现
 * ============================================================ */
async function discoverServices() {
  const tree = $('servicesTree');
  tree.innerHTML = '<div class="empty-tip">正在读取服务…</div>';
  servicesCache = [];

  try {
    const svcs = await server.getPrimaryServices();
    for (const svc of svcs) {
      const chars = await svc.getCharacteristics();
      const charItems = [];
      for (const ch of chars) {
        charItems.push({
          char: ch,
          uuid: ch.uuid,
          name: characteristicName(ch.uuid),
          props: {
            read: ch.properties.read,
            write: ch.properties.write,
            writeWithoutResponse: ch.properties.writeWithoutResponse,
            notify: ch.properties.notify,
            indicate: ch.properties.indicate,
          },
        });
      }
      servicesCache.push({ service: svc, uuid: svc.uuid, name: serviceName(svc.uuid), chars: charItems });
    }
    renderServicesTree();
  } catch (err) {
    tree.innerHTML = `<div class="empty-tip err">读取服务失败: ${esc(err.message)}</div>`;
    sysLog('服务发现失败: ' + err.message);
  }
}

function serviceName(uuid) {
  try { return BluetoothUUID.getService(uuid) || uuid; } catch { return uuid; }
}
function characteristicName(uuid) {
  try { return BluetoothUUID.getCharacteristic(uuid) || uuid; } catch { return uuid; }
}

function renderServicesTree() {
  const tree = $('servicesTree');
  if (!servicesCache.length) { tree.innerHTML = '<div class="empty-tip">未发现服务。</div>'; return; }

  tree.innerHTML = '';
  servicesCache.forEach((svc) => {
    const card = document.createElement('div');
    card.className = 'svc-card';
    card.innerHTML = `
      <div class="svc-head"><span class="svc-name">${esc(svc.name)}</span><span class="char-uuid">${esc(svc.uuid)}</span></div>
      <div class="svc-body"></div>`;
    const body = card.querySelector('.svc-body');
    card.querySelector('.svc-head').addEventListener('click', () => body.classList.toggle('open'));

    svc.chars.forEach((ci) => {
      const props = Object.entries(ci.props).filter(([, v]) => v).map(([k]) => k).join(' | ') || '无属性';
      const row = document.createElement('div');
      row.className = 'char-row';
      let actionsHtml = '';
      if (ci.props.read) actionsHtml += `<button class="btn small ghost" data-act="read">读取</button>`;
      if (ci.props.write || ci.props.writeWithoutResponse) {
        actionsHtml += `<input class="char-write-input mono" placeholder="HEX 或文本" style="width:100%;padding:6px;background:#0e1423;border:1px solid #233049;border-radius:6px;color:#e6ebf5;" data-uuid="${esc(ci.uuid)}">`;
        actionsHtml += `<button class="btn small ghost" data-act="write">写入</button>`;
        if (ci.props.writeWithoutResponse) actionsHtml += `<button class="btn small ghost" data-act="writenoresp">无响应写入</button>`;
      }
      if (ci.props.notify) actionsHtml += `<button class="btn small ghost" data-act="notify">订阅/取消</button>`;
      if (ci.props.indicate) actionsHtml += `<button class="btn small ghost" data-act="indicate">订阅/取消(表)</button>`;
      row.innerHTML = `
        <div class="char-meta"><span class="char-uuid">${esc(ci.name)}</span><span class="char-props">${esc(props)}</span></div>
        <div>${actionsHtml}</div>`;
      row.dataset.uuid = ci.uuid;
      body.appendChild(row);
    });

    tree.appendChild(card);
  });
}

function bindCharActions() {
  $('servicesTree').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const row = btn.closest('.char-row');
    const uuid = row.dataset.uuid;
    const find = findCharByUUID(uuid);
    if (!find) return;
    const act = btn.dataset.act;
    if (act === 'read') readChar(find.ci);
    else if (act === 'write' || act === 'writenoresp') {
      const input = row.querySelector('.char-write-input');
      writeChar(find.ci, input.value, act === 'writenoresp');
    } else if (act === 'notify' || act === 'indicate') toggleNotify(find.ci, act === 'indicate');
  });
}

function findCharByUUID(uuid) {
  for (const svc of servicesCache) {
    const ci = svc.chars.find((c) => c.uuid === uuid);
    if (ci) return { svc, ci };
  }
  return null;
}

async function readChar(ci) {
  try {
    const u8 = new Uint8Array(await ci.char.readValue());
    const hex = bytesToHex(u8);
    appendDataLog('rx-log', fmtTs(), `读取 ${shortUuid(ci.uuid)}: `, hex);
    sysLog(`读取 ${ci.uuid} 成功`);
  } catch (err) {
    toast('读取失败: ' + err.message, true);
    sysLog('读取失败: ' + err.message);
  }
}

async function writeChar(ci, inputValue, noResponse) {
  const u8 = parseInputBytes(inputValue);
  if (!u8) return;
  try {
    if (noResponse) {
      await ci.char.writeValueWithoutResponse(u8);
    } else {
      await ci.char.writeValue(u8);
    }
    appendDataLog('rx-log', fmtTs(), `写入 ${shortUuid(ci.uuid)}: `, displayHex ? bytesToHex(u8) : escapedControl(new TextDecoder().decode(u8)), '');
    sysLog(`写入 ${ci.uuid} 成功`);
  } catch (err) {
    toast('写入失败: ' + err.message, true);
    sysLog('写入失败: ' + err.message);
  }
}

/* ============================================================
 * 通知 / 指示监听
 * ============================================================ */
const notifyHandles = new Map(); // uuid -> {char, type, subscribed}

async function toggleNotify(ci, isIndicate) {
  const key = ci.uuid + (isIndicate ? '_ind' : '_not');
  const existing = notifyHandles.get(key);
  if (existing && existing.subscribed) {
    await unsubNotify(key, existing);
    return;
  }
  try {
    await ci.char.startNotifications();
    ci.char.addEventListener('characteristicvaluechanged', (e) => {
      const u8 = new Uint8Array(e.target.value.buffer);
      appendDataLog('notifyLog', fmtTs(), `[${isIndicate ? '指示' : '通知'}] ${shortUuid(ci.uuid)}: `, displayHex ? bytesToHex(u8) : escapedControl(new TextDecoder().decode(u8)), 'rx');
      // 若是配置的 RX 特征值，同时写入透传接收区
      if (rxCharHandle && e.target === rxCharHandle) {
        appendDataLog('rx-log', fmtTs(), 'RX: ', displayHex ? bytesToHex(u8) : escapedControl(new TextDecoder().decode(u8)), 'rx');
      }
    });
    notifyHandles.set(key, { char: ci.char, type: isIndicate ? 'indicate' : 'notify', subscribed: true });
    toast('已订阅通知');
    sysLog(`已订阅 ${ci.uuid} 的通知${isIndicate ? '（指示）' : ''}`);
  } catch (err) {
    toast('订阅失败: ' + err.message, true);
    sysLog('订阅失败: ' + err.message);
  }
}

async function unsubNotify(key, h) {
  try {
    await h.char.stopNotifications();
  } catch (err) {
    sysLog('取消订阅: ' + err.message);
  }
  h.subscribed = false;
  notifyHandles.delete(key);
  toast('已取消订阅');
  sysLog('已取消订阅通知');
}

function cleanupSubscriptions() {
  for (const [key, h] of notifyHandles) {
    try { h.char.stopNotifications(); } catch {}
  }
  notifyHandles.clear();
  rxCharHandle = null;
  rxSubscribed = false;
}

/* ============================================================
 * UART 透传
 * ============================================================ */
function loadUartConfig() {
  try {
    const s = JSON.parse(localStorage.getItem('ble_uart') || '{}');
    uart = Object.assign(uart, s);
  } catch {}
  $('uartTxService').value = uart.txService;
  $('uartTxChar').value = uart.txChar;
  $('uartRxService').value = uart.rxService;
  $('uartRxChar').value = uart.rxChar;
}

function saveUartConfig() {
  uart = {
    txService: $('uartTxService').value.trim(),
    txChar: $('uartTxChar').value.trim(),
    rxService: $('uartRxService').value.trim(),
    rxChar: $('uartRxChar').value.trim(),
  };
  localStorage.setItem('ble_uart', JSON.stringify(uart));
  toast('UART 配置已保存');
  sysLog('UART 配置已保存');
  setupUartFallback();
}

// 若配置了 RX 特征值且具备 notify，自动订阅并把数据回填到透传接收区
async function setupUartFallback() {
  if (!server || !uart.rxChar) return;
  const find = findCharByUUID(normUuid(uart.rxChar));
  if (!find || !(find.ci.props.notify || find.ci.props.indicate)) return;
  const ci = find.ci;
  try {
    await ci.char.startNotifications();
    rxCharHandle = ci.char;
    rxSubscribed = true;
    ci.char.addEventListener('characteristicvaluechanged', (e) => {
      const u8 = new Uint8Array(e.target.value.buffer);
      appendDataLog('rx-log', fmtTs(), 'RX: ', displayHex ? bytesToHex(u8) : escapedControl(new TextDecoder().decode(u8)), 'rx');
    });
    sysLog(`已自动订阅 RX 特征值 (${uart.rxChar}) 的接收通知`);
  } catch (err) {
    sysLog('自动订阅 RX 失败: ' + err.message);
  }
}

async function sendUart() {
  const raw = $('sendInput').value;
  if (!raw) { toast('请输入内容', true); return; }

  let u8;
  if (currentSendMode === 'hex') {
    u8 = parseHexString(raw);
    if (!u8) { toast('HEX 格式错误', true); return; }
  } else {
    u8 = new TextEncoder().encode(raw);
  }

  // 目标特征值
  let targetUUID = null;
  let targetCI = null;
  const txCharRaw = $('uartTxChar').value.trim();
  if (txCharRaw) {
    targetCI = findCharByUUID(txCharRaw);
    targetUUID = txCharRaw;
  }
  if (!targetCI && servicesCache.length) {
    // 自动找一个可写的特征值
    for (const svc of servicesCache) {
      const ci = svc.chars.find((c) => c.props.write || c.props.writeWithoutResponse);
      if (ci) { targetCI = ci; targetUUID = ci.uuid; break; }
    }
  }
  if (!targetCI) { toast('未找到可写的特征值，请先配置 TX UUID', true); return; }

  try {
    if (targetCI.props.writeWithoutResponse) await targetCI.char.writeValueWithoutResponse(u8);
    else await targetCI.char.writeValue(u8);
    const hex = bytesToHex(u8);
    appendDataLog('rx-log', fmtTs(), `TX ${shortUuid(targetUUID)}: `, displayHex ? hex : escapedControl(new TextDecoder().decode(u8)), 'tx');
  } catch (err) {
    toast('发送失败: ' + err.message, true);
    sysLog('发送失败: ' + err.message);
  }
}

/* ---------- 输入解析 ---------- */
function parseHexString(s) {
  const clean = s.trim().replace(/[\s,]+/g, '');
  if (!clean || clean.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(clean)) return null;
  const arr = [];
  for (let i = 0; i < clean.length; i += 2) arr.push(parseInt(clean.substr(i, 2), 16));
  return new Uint8Array(arr);
}

function parseInputBytes(s) {
  if (!s) { toast('请输入内容', true); return null; }
  const t = s.trim();
  // 纯 HEX（含空格分隔）且成对 => 按 HEX
  const noSpace = t.replace(/[\s,:]+/g, '');
  if (/^[0-9a-fA-F]+$/.test(noSpace) && noSpace.length % 2 === 0) {
    const arr = [];
    for (let i = 0; i < noSpace.length; i += 2) {
      if (/[g-zG-Z]/.test(noSpace)) break;
      arr.push(parseInt(noSpace.substr(i, 2), 16));
    }
    if (arr.length === noSpace.length / 2) return new Uint8Array(arr);
  }
  return new TextEncoder().encode(s);
}

function shortUuid(u) { return (u || '').replace(/-0000-1000-8000-00805f9b34fb$/, '').toUpperCase(); }

/* ---------- 日志追加 ---------- */
// cls: 'rx' 蓝色 | 'tx' 绿色 | '' 默认为信息（跟随主题）
function appendDataLog(logId, ts, label, data, cls = '') {
  const el = $(logId);
  const timeStr = $('ckTime').checked ? `<span class="t">[${ts}] </span>` : '';
  el.insertAdjacentHTML('beforeend',
    `<span class="line">${timeStr}<span class="${cls || 'info'}">${esc(label)}</span>${esc(String(data))}</span>`);
  maybeScroll(el);
}

/* ============================================================
 * 事件绑定
 * ============================================================ */
function init() {
  if (!detectSupport()) return;

  $('btnConnect').addEventListener('click', scan);
  $('btnScan').addEventListener('click', scan);
  $('btnDisconnect').addEventListener('click', disconnect);
  $('btnSaveUart').addEventListener('click', saveUartConfig);
  $('btnSend').addEventListener('click', sendUart);
  $('btnClearRx').addEventListener('click', () => { $('rxLog').textContent = ''; });
  $('btnClearNotify').addEventListener('click', () => { $('notifyLog').textContent = ''; });
  $('btnClearLog').addEventListener('click', () => { $('sysLog').textContent = ''; });
  $('btnRefreshServices').addEventListener('click', () => server && discoverServices());

  $('ckHex').addEventListener('change', (e) => { displayHex = e.target.checked; });

  document.querySelectorAll('#modeSeg .seg-btn').forEach((b) => {
    b.addEventListener('click', () => setSendMode(b.dataset.mode));
  });

  bindCharActions();
  loadUartConfig();
  setSendMode('text');
  setConnState('disconnected');
  tabFromHash();
  sysLog('就绪。请点击“连接设备”扫描附近 BLE 设备。');
}

document.addEventListener('DOMContentLoaded', init);