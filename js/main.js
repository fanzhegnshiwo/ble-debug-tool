/* ============================================================
 * 入口：页面流程编排 + 事件接线
 * main.js 只负责"什么时候调用谁"，业务逻辑在各自模块里。
 * ============================================================ */
'use strict';

import { DeviceFilter } from './device-filter.js';
import { BleService } from './ble-service.js';
import { UartPanel } from './uart-panel.js';
import { ProtocolPanel } from './protocol-panel.js';
import { encodeAuto, formatData } from './codec.js';
import { charLabel } from './names.js';
import { KEYS, loadText, saveText } from './storage.js';
import {
  $, esc, toast, appendLog, appendGatt, setPill, setConnUI, detectSupport,
  renderSvcTree, renderAdvertisement, setCharValue, resetPollButtons,
  formatForView, exportLog, setLogFilter, setDisplayOptions,
} from './ui.js';

const VERSION = 'v20260829-c';
const SCAN_TIMEOUT_MS = 8000;

/* ---------- 页面状态 ---------- */
let searchMode = 'system';   // system=系统选择框 / mini=极简列表（实验扫描）
let pendingDevice = null;    // 搜索选中、尚未连接的设备
let lastKeyword = '';         // 上次搜索用的名称关键字（重连用）
let scanTimer = null;        // 极简列表扫描超时句柄
let sendMode = 'text';       // 发送编码模式（镜像 UartPanel 状态）

/* ---------- 模块实例 ---------- */
const ble = new BleService({
  log: appendLog,
  onValue: handleValue,
  onDisconnected: handleUnexpectedDisconnect,
  onPollStop: resetPollButtons,
});
const uartPanel = new UartPanel(ble);
const protocolPanel = new ProtocolPanel();

/* ============================================================
 * 特征值统一路由：读 / 通知数据都从这里分发
 * ============================================================ */
function handleValue(uuid, u8, source) {
  const label = source === 'read' ? '读取' : '通知';
  setCharValue(uuid, formatForView(u8));
  appendLog('rx', `${label} ${charLabel(uuid)}: ${formatData(u8)}`);
  appendGatt(`${label} ${charLabel(uuid)}: ${formatData(u8)}`, '#4ade80');
  protocolPanel.onData(uuid, u8, source);
  uartPanel.routeValue(uuid, u8);
}

/* ============================================================
 * 搜索流程（两种模式共用 DeviceFilter）
 * ============================================================ */
async function searchDevice() {
  appendLog('sys', '点击搜索：开始查找设备…');
  // 防旧缓存混合页面：关键 DOM 缺失时明确报错，而不是静默崩掉
  if (!$('searchMode') || !$('fName') || !$('fService') || !$('ckNamed')) {
    appendLog('err', '发现页面结构不完整（很可能加载了旧缓存）。请点击浏览器刷新按钮，或清除缓存后重开本页。');
    toast('页面是旧缓存，请刷新后再试', true);
    setPill('', '未连接');
    return;
  }

  let filter;
  try {
    filter = DeviceFilter.fromUserInput({
      name: $('fName').value.trim(),
      serviceText: $('fService').value.trim(),
      namedOnly: $('ckNamed').checked,
    });
  } catch (err) {
    toast(err.message, true);
    return;
  }
  lastKeyword = filter.keyword;

  if (searchMode === 'mini') return scanMini(filter);
  return searchSystem(filter);
}

/* ---- 系统选择框模式 ---- */
async function searchSystem(filter) {
  appendLog('sys', `当前模式：系统列表（${filter.describe()}）`);
  setPill('connecting', '搜索中…');
  try {
    const { ok, device, rejected } = await ble.requestSystemDevice(filter);
    if (rejected) {
      // 兜底拦截：选中的设备没过筛选（典型：无名称 + 只看已知设备）
      $('selectedCard').classList.add('hidden');
      setPill('', '未连接');
      toast('该设备未命名，已按「只看已知设备」过滤', true);
      appendLog('sys', '所选设备没有名称，被「只看已知设备」过滤。如需连接，请取消勾选后再搜索。');
      return;
    }
    pendingDevice = device;
    // 选出后先显示已选设备，等用户点「连接」
    $('selectedName').textContent = device.name || '(未命名)';
    $('selectedMeta').textContent = `id: ${device.id.slice(0, 12)}…`;
    $('selectedCard').classList.remove('hidden');
    setPill('', '已选设备');
    appendLog('sys', `已选择设备：${device.name || '(未命名)'}，请点击「连接」`);
  } catch (err) {
    if (err.name === 'SecurityError') {
      appendLog('err', '搜索失败：请确认页面以 https:// 或 localhost 打开（当前非安全上下文），并开启蓝牙权限。');
      toast('需要 https 或 localhost 打开', true);
      setPill('', '未连接');
      return;
    }
    if (err.name !== 'NotFoundError') appendLog('err', '搜索失败/取消：' + (err.message || err.name));
    setPill('', '未连接');
  }
}

/* ---- 极简列表模式（requestLEScan 实验 API） ---- */
async function scanMini(filter) {
  const list = $('miniList');
  let found = 0;
  const seen = new Set();

  // 每条匹配广告渲染一行（去重靠 seen；匹配判定在 BleService 内统一走 filter.matches）
  const onAdvertisement = (device, event) => {
    if (seen.has(device.id)) return;
    seen.add(device.id);
    found++;
    const name = device.name || '(未命名)';
    const row = document.createElement('div');
    row.className = 'mini-item';
    row.innerHTML =
      `<span class="mini-name">${esc(name)}</span>` +
      `<span class="mini-meta">${esc(device.id.slice(0, 8))} · ${event.rssi} dBm</span>`;
    row.addEventListener('click', () => {
      clearTimeout(scanTimer);
      ble.stopScan();
      connectMiniDevice(device);
    });
    list.insertBefore(row, list.firstChild);
  };

  try {
    const res = await ble.startMiniScan(filter, onAdvertisement);
    if (!res.ok) {
      // 浏览器未开实验开关：切回系统模式并明确引导（不能链式代发搜索，
      // requestDevice 必须由真实用户手势触发，代发不弹框也不报错）
      searchMode = 'system';
      syncSearchModeUI();
      saveSearchMode();
      list.classList.add('hidden');
      setPill('', '未连接');
      toast('已切回系统列表，请再次点击「搜索设备」', true);
      appendLog('err', '本浏览器未启用实验扫描接口（requestLEScan），已自动切回「系统列表」模式。');
      appendLog('err', '如需用极简列表隐藏未知设备：地址栏输入 edge://flags/#enable-experimental-web-platform-features（Chrome 用 chrome://flags/#enable-…）→ 选 Enabled → 重启浏览器 → 再切「极简列表」。');
      appendLog('sys', '提示：在「设备名称包含」填入关键字（如 JNB），系统选择框也只会显示匹配的设备，可同样过滤未知设备。');
      appendLog('sys', '已切回系统列表模式，请再次点击「搜索设备」按钮打开系统选择框。');
      return;
    }

    list.classList.remove('hidden');
    list.innerHTML = '<div class="mini-item dim">正在扫描（仅显示匹配设备）…</div>';
    setPill('connecting', '扫描中…');
    appendLog('sys', `当前模式：极简列表（${filter.describe()}）`);

    clearTimeout(scanTimer);
    scanTimer = setTimeout(() => {
      ble.stopScan();
      setPill('', found ? '扫描完成' : '未连接');
      if (!found) list.innerHTML = '<div class="mini-item dim">未找到匹配设备，请确认设备已开机且在附近，再次搜索</div>';
    }, SCAN_TIMEOUT_MS);
  } catch (err) {
    setPill('', '未连接');
    appendLog('err', '极简列表扫描失败：' + (err.message || err.name));
    if (/flag|Permission|NotAllowed|scan/i.test(err.name + err.message)) {
      list.innerHTML = '<div class="mini-item dim">实验扫描不可用：Chrome/Edge 需打开 chrome://flags/#enable-experimental-web-platform-features 并重启，或改回「系统列表」模式</div>';
    } else {
      list.innerHTML = `<div class="mini-item dim">扫描失败：${esc(err.message)}</div>`;
    }
  }
}

/* ---- 极简列表设备的连接（含授权补登） ---- */
async function connectMiniDevice(dev) {
  setPill('connecting', '连接中…');
  try {
    let target = dev;
    // 扫描到的设备可能还没有访问权限：先尝试直接连接，无权限则借系统框补一次授权
    try {
      await target.gatt.connect();
      await target.gatt.disconnect();
    } catch (e) {
      if (e.name !== 'NotAllowedError' && e.name !== 'SecurityError') throw e;
      target = await ble.requestAuthorization(dev);
    }
    await establishConnection(target);
  } catch (err) {
    setPill('', '未连接');
    appendLog('err', '连接失败：' + (err.message || err.name));
    toast('连接失败，已过滤', true);
  }
}

/* ============================================================
 * 连接流程（系统/极简列表共用）
 * ============================================================ */
async function connectSelected() {
  if (!pendingDevice) { toast('请先搜索并选择设备', true); return; }
  setPill('connecting', '连接中…');
  try {
    await establishConnection(pendingDevice);
  } catch (err) {
    // 连接失败 -> 视为未知/不支持的设备，自动过滤
    pendingDevice = null;
    $('selectedCard').classList.add('hidden');
    setPill('', '未连接');
    appendLog('err', '所选设备不可用（未知或不支持），已过滤：' + (err.message || err.name));
    toast('设备不可用，已过滤', true);
  }
}

async function establishConnection(dev) {
  $('svcTree').innerHTML = '<div class="placeholder">正在读取服务…</div>';
  try {
    const svcCount = await ble.connect(dev);
    renderSvcTree(ble.servicesCache);
    protocolPanel.fillCharSelect(ble.servicesCache);
    const name = dev.name || '(未命名)';
    setPill('connected', '已连接');
    renderAdvertisement(dev);
    $('deviceInfo').textContent = `${name}  ·  id:${dev.id.slice(0, 8)}`;
    $('deviceLabel').textContent = `已连接 ${name}`;
    $('metaLabel').textContent = '浏览器负责 MTU 协商';
    setConnUI(true);
    $('btnReconnect').classList.add('hidden');
    appendLog('sys', `连接成功：${name} (${dev.id.slice(0, 12)}…)`);
    // 连接后自动按已保存的 UART 配置订阅 RX
    await uartPanel.autoSubscribeRx();
    return svcCount;
  } catch (err) {
    $('svcTree').innerHTML = `<div class="placeholder err">连接/读取服务失败：${esc(err.message)}</div>`;
    appendLog('err', '连接/读取服务失败：' + err.message);
    if (/not allowed to access/i.test(err.message)) {
      appendLog('sys', '提示：请在「服务 UUID 过滤」填入设备的主服务 UUID 后重新搜索连接；或用「极简列表」模式（会自动从广播包带上服务授权）。');
    }
    throw err;
  }
}

async function reconnectDevice() {
  const name = lastKeyword || $('fName').value.trim();
  try {
    // 与搜索一致：名称前缀 + 服务 UUID 过滤（含连接授权）
    const filter = DeviceFilter.fromUserInput({ name, serviceText: $('fService').value.trim() });
    const opts = filter.toRequestOptions();
    setPill('connecting', '选择设备…');
    const dev = await navigator.bluetooth.requestDevice(opts);
    setPill('connecting', '连接中…');
    // 走统一收尾：校验服务、刷新 UI、渲染广播数据、自动订阅 RX
    await establishConnection(dev);
    appendLog('sys', `重新连接成功：${dev.name || '(未命名)'}`);
  } catch (err) {
    appendLog('err', '重新连接失败：' + (err.message || err.name));
    setPill('', '未连接');
  }
}

function handleUnexpectedDisconnect() {
  setPill('', '已断开');
  setConnUI(false);
  // 意外断开时保留「已连接设备」卡片，否则「重新连接」按钮会被一起隐藏而无法点击
  $('deviceSection').classList.remove('hidden');
  appendLog('sys', '连接已断开（设备端断开或信号丢失），可点击「重新连接」或重新搜索设备');
}

async function disconnectDevice() {
  await ble.disconnect();
  $('svcTree').innerHTML = '';
  $('advView').textContent = '（连接后自动解析该设备的广播数据）';
  setPill('', '未连接');
  setConnUI(false);
  appendLog('sys', '已断开连接');
}

/* ============================================================
 * GATT 服务树操作（事件委托）
 * ============================================================ */
function handleSvcTreeClick(e) {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const uuid = btn.dataset.uuid;
  const action = btn.dataset.action;
  const ci = ble.findChar(uuid);
  if (!ci) { toast('特征不存在，请刷新服务', true); return; }

  switch (action) {
    case 'read': doRead(uuid); break;
    case 'poll': doPoll(uuid, btn); break;
    case 'notify': doNotify(uuid, btn, ci); break;
    case 'write': doWrite(uuid, btn, false); break;
    case 'writeNR': doWrite(uuid, btn, true); break;
  }
}

async function doRead(uuid) {
  try {
    await ble.readCharacteristic(uuid);
  } catch (err) {
    appendLog('err', `读取 ${charLabel(uuid)} 失败：${err.message}`);
    toast('读取失败', true);
  }
}

function doPoll(uuid, btn) {
  if (ble.pollTimer) { ble.stopPoll(); toast('已停止定读'); return; }
  const sec = Math.max(1, parseInt($('pollInterval').value, 10) || 1);
  ble.startPoll(uuid, sec);
  btn.textContent = '停止定读';
  btn.classList.add('on');
  appendLog('sys', `开始定时读取 ${charLabel(uuid)}, 每 ${sec} 秒`);
  toast('开始定读');
}

async function doNotify(uuid, btn, ci) {
  try {
    const on = await ble.toggleNotify(uuid);
    btn.textContent = on ? '取消订阅' : (ci.props.notify ? '订阅' : '订阅(表)');
    btn.classList.toggle('on', on);
    appendLog('sys', on ? `已订阅通知：${charLabel(uuid)}` : `已取消订阅：${charLabel(uuid)}`);
  } catch (err) {
    appendLog('err', `订阅失败：${err.message}`);
    toast('订阅失败', true);
  }
}

async function doWrite(uuid, btn, noResp) {
  const row = btn.closest('.char');
  const inp = row && row.querySelector('input.write-in');
  if (!inp) return;
  const text = inp.value;
  if (!text.trim()) { toast('请输入内容', true); return; }
  let u8;
  try { u8 = encodeAuto(text); } catch (err) { toast(err.message, true); return; }
  if (!u8.length) { toast('没有可发送的数据', true); return; }
  try {
    await ble.writeCharacteristic(uuid, u8, noResp);
    const mode = noResp ? '写入(无响应)' : '写入';
    appendLog('tx', `${mode} ${charLabel(uuid)}: ${formatData(u8)}`);
    appendGatt(`${mode} ${charLabel(uuid)}: ${formatData(u8)}`, '#38bdf8');
    setCharValue(uuid, formatForView(u8));
  } catch (err) {
    appendLog('err', `${noResp ? '无响应写入' : '写入'} ${charLabel(uuid)} 失败：${err.message}`);
    toast('写入失败', true);
  }
}

/* ============================================================
 * 页签 / 搜索模式
 * ============================================================ */
function switchTab(name) {
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === name));
  document.querySelectorAll('.tab-body').forEach((b) => b.classList.toggle('active', b.id === 'tab-' + name));
}

function syncSearchModeUI() {
  document.querySelectorAll('#searchMode .seg-btn').forEach((b) => b.classList.toggle('active', b.dataset.mode === searchMode));
}

// 记住用户选择的搜索模式：避免每次刷新都重置成「系统列表」，
// 换了支持/不支持实验接口的浏览器也能自动纠正（扫描时还会再校验一次）
function saveSearchMode() { saveText(KEYS.SEARCH_MODE, searchMode); }
function loadSearchMode() {
  const m = loadText(KEYS.SEARCH_MODE);
  if (m === 'system' || m === 'mini') searchMode = m;
  syncSearchModeUI();
}

/* ============================================================
 * 初始化
 * ============================================================ */
function init() {
  if (!detectSupport()) return;

  // 连接卡片
  $('btnScan').addEventListener('click', searchDevice);
  $('btnConnectSel').addEventListener('click', connectSelected);
  $('btnDisconnect').addEventListener('click', disconnectDevice);
  $('btnReconnect').addEventListener('click', reconnectDevice);

  // GATT 服务树：事件委托（读/写/订阅/定读）
  $('svcTree').addEventListener('click', handleSvcTreeClick);
  $('btnRefreshSvc').addEventListener('click', async () => {
    if (!ble.server) return;
    $('svcTree').innerHTML = '<div class="placeholder">正在读取服务…</div>';
    try {
      const n = await ble.discoverServices();
      renderSvcTree(ble.servicesCache);
      protocolPanel.fillCharSelect(ble.servicesCache);
      appendLog('sys', `已发现 ${n} 个服务`);
    } catch (err) {
      $('svcTree').innerHTML = `<div class="placeholder err">读取服务失败：${esc(err.message)}</div>`;
      appendLog('err', '读取 GATT 服务失败：' + err.message);
    }
  });

  // UART 面板
  $('btnSaveUart').addEventListener('click', () => uartPanel.save());
  $('btnSend').addEventListener('click', () => uartPanel.send());
  $('btnClearUartRx').addEventListener('click', () => { $('uartRx').textContent = ''; });
  $('sendMode').addEventListener('click', (e) => {
    const b = e.target.closest('.seg-btn'); if (!b) return;
    sendMode = b.dataset.mode;
    uartPanel.setSendMode(sendMode);
    document.querySelectorAll('#sendMode .seg-btn').forEach((x) => x.classList.toggle('active', x === b));
    $('sendInput').placeholder = sendMode === 'hex' ? '输入 HEX，如 01 02 A0 FF' : '输入文本…';
  });

  // 日志
  $('btnClearLog').addEventListener('click', () => { $('sysLog').textContent = ''; });
  $('btnExportLog').addEventListener('click', exportLog);
  document.querySelectorAll('input[data-filter]').forEach((chk) => {
    chk.addEventListener('change', () => setLogFilter(chk.dataset.filter, chk.checked));
  });

  // 显示选项
  $('viewFormat').addEventListener('change', (e) => setDisplayOptions({ format: e.target.value }));
  $('ckHex').addEventListener('change', (e) => setDisplayOptions({ hex: e.target.checked }));

  // 协议面板
  $('btnClearRes').addEventListener('click', () => protocolPanel.clearResults());
  $('btnExportCsv').addEventListener('click', () => protocolPanel.exportCsv());
  $('btnAddRule').addEventListener('click', () => protocolPanel.addEmptyRule());
  $('btnDelRule').addEventListener('click', () => protocolPanel.delRule());
  $('btnAddField').addEventListener('click', () => protocolPanel.addFieldFromSelection());
  $('btnProtoLoad').addEventListener('click', () => protocolPanel.loadFromInput());
  $('byteView').addEventListener('click', (e) => protocolPanel.handleByteClick(e));

  // 搜索模式切换
  $('searchMode').addEventListener('click', (e) => {
    const b = e.target.closest('.seg-btn'); if (!b) return;
    searchMode = b.dataset.mode;
    syncSearchModeUI();
    saveSearchMode();
    $('miniList').classList.add('hidden');
    toast(searchMode === 'mini' ? '已切换极简列表：点「搜索设备」在页面内扫描' : '已切换系统列表', false);
  });

  // 页签
  document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => switchTab(t.dataset.tab)));

  // 载入持久化配置
  uartPanel.load();
  protocolPanel.load();
  loadSearchMode();

  setConnUI(false);
  setPill('', '未连接');
  appendLog('sys', '就绪。请点击「搜索设备」，在弹出的系统选择框中选择你的 BLE 设备。');
  appendLog('sys', `页面版本 ${VERSION}；如非最新请刷新（清缓存）后重试。`);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
