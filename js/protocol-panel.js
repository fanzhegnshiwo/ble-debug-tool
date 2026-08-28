/* ============================================================
 * 协议解析面板：字节视图 / 规则表 / 解析结果 / CSV 导出
 * ============================================================ */
'use strict';

import { parseHex, hexBytes } from './codec.js';
import { charLabel, shortUuid } from './names.js';
import { canonicalUuid } from './device-filter.js';
import { parseProtocol, TYPE_ORDER, DEFAULT_TYPE_BY_LEN } from './protocol.js';
import { KEYS, loadJson, saveJson } from './storage.js';
import { $, esc, toast, gts, downloadFile } from './ui.js';

export class ProtocolPanel {
  constructor() {
    this.rules = [];        // {uuid,name,offset,type,endian,unit,enum_text}
    this.bytes = null;      // 当前字节视图数据
    this.selectedRange = []; // [start,end]
    this.resultColumns = [];
  }

  load() {
    this.rules = loadJson(KEYS.PROTOCOLS, []);
    this.renderRules();
  }

  save() { saveJson(KEYS.PROTOCOLS, this.rules); }

  /** 用当前连接的服务特征填充特征下拉框 */
  fillCharSelect(servicesCache) {
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

  /** 读/通知数据入口：更新字节视图并按规则出解析结果 */
  onData(uuid, u8, kind) {
    if (kind !== 'read' && kind !== 'notify') return;
    const sel = $('protoChar');
    const canon = canonicalUuid(uuid);
    if (sel.options.length && $('protoHex').value.trim() === '') {
      const opt = Array.from(sel.options).find((o) => o.value === canon);
      if (!opt && !sel.value) sel.value = canon;
    }
    this.showBytes(canon, u8);
    const rules = this.rules.filter((r) => canonicalUuid(r.uuid) === canon && r.name);
    if (!rules.length) return;
    this.addResultRow(canon, u8, rules);
  }

  /** 载入 HEX 输入框内容到字节视图 */
  loadFromInput() {
    try {
      const u8 = parseHex($('protoHex').value);
      if (!u8.length) { toast('HEX 无效', true); return; }
      this.showBytes($('protoChar').value, u8);
    } catch (err) { toast(err.message, true); }
  }

  showBytes(uuid, u8) {
    this.bytes = u8;
    this.selectedRange = [];
    const sel = $('protoChar');
    if (uuid) {
      const exists = Array.from(sel.options).find((o) => o.value === uuid);
      if (exists) sel.value = uuid;
    }
    this.renderByteView();
  }

  renderByteView() {
    const el = $('byteView');
    if (!this.bytes || !this.bytes.length) {
      el.innerHTML = '<div class="dim">无数据</div>';
      $('byteHint').textContent = '读取或通知的数据会自动显示（HEX 在上，序号在表头）。';
      return;
    }
    let head = '', hex = '', ascii = '';
    for (let i = 0; i < this.bytes.length; i++) {
      const sel = i >= this.selectedRange[0] && i <= this.selectedRange[1];
      head += `<span class="b-i ${sel ? 'sel' : ''}" data-i="${i}">${i}</span>`;
      hex += `<span class="b-f ${sel ? 'sel' : ''}" data-i="${i}">${this.bytes[i].toString(16).padStart(2, '0').toUpperCase()}</span>`;
      ascii += `<span class="b-a ${sel ? 'sel' : ''}" data-i="${i}">${this.bytes[i] >= 32 && this.bytes[i] < 127 ? String.fromCharCode(this.bytes[i]) : '.'}</span>`;
    }
    el.innerHTML = `
      <div class="bv-row"><span class="bv-lab">#</span>${head}</div>
      <div class="bv-row"><span class="bv-lab">H</span>${hex}</div>
      <div class="bv-row"><span class="bv-lab">A</span>${ascii}</div>`;
    $('byteHint').textContent = `${this.bytes.length} 字节；点选字节，再点「选中字节 → 添加字段」。`;
  }

  /** 字节视图点击选择（事件委托，由 main.js 绑定后转发到这里） */
  handleByteClick(e) {
    const s = e.target.closest('.b-f');
    if (!s) return;
    const i = Number(s.dataset.i);
    if (e.shiftKey && this.selectedRange.length) {
      this.selectedRange = [Math.min(this.selectedRange[0], i), Math.max(this.selectedRange[0], i)];
    } else {
      this.selectedRange = [i, i];
    }
    this.renderByteView();
  }

  addFieldFromSelection() {
    if (!this.selectedRange.length) { toast('请先点选一段字节', true); return; }
    const uuid = $('protoChar').value;
    if (!uuid) { toast('请先选择特征', true); return; }
    const start = this.selectedRange[0];
    const len = this.selectedRange[1] - start + 1;
    const max = this.bytes ? this.bytes.length : 0;
    if (start + len > (max || Infinity)) { toast('偏移超出数据范围', true); return; }
    const type = DEFAULT_TYPE_BY_LEN[len] || 'uint8';
    this.rules.push({ uuid: canonicalUuid(uuid), name: `字段${start}`, offset: start, type, endian: 'big', unit: '', enum_text: '' });
    this.save();
    this.renderRules();
    toast(`已添加字段：偏移 ${start}, 长度 ${len}(${type})`);
  }

  renderRules() {
    const wrap = $('ruleTable');
    wrap.innerHTML = '';
    if (!this.rules.length) {
      wrap.innerHTML = '<div class="dim">尚无规则。读取/粘贴数据后在字节视图点选，再点「选中字节 → 添加字段」。</div>';
      return;
    }
    this.rules.forEach((r) => {
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
        r.uuid = canonicalUuid(ur); r.name = row.querySelector('[data-f="name"]').value;
        r.offset = parseInt(o, 10) || 0; r.type = ty; r.endian = en;
        r.unit = row.querySelector('[data-f="unit"]').value;
        r.enum_text = row.querySelector('[data-f="enum_text"]').value;
        this.save();
      });
    });
  }

  addEmptyRule() {
    const uuid = $('protoChar').value || '';
    this.rules.push({ uuid: canonicalUuid(uuid), name: '', offset: 0, type: 'uint16', endian: 'big', unit: '', enum_text: '' });
    this.save();
    this.renderRules();
  }

  delRule() {
    // 简单实现：删除最后一个（移动端免选择）
    if (!this.rules.length) return;
    this.rules.pop();
    this.save();
    this.renderRules();
  }

  addResultRow(uuid, u8, rules) {
    if (!rules.length) return;
    const fields = rules.map((r) => r.name || charLabel(r.uuid));
    const headers = ['时间'].concat(fields, ['原始HEX']);
    const table = $('resultTable');
    if (this.resultColumns.join('\u0001') !== headers.join('\u0001')) {
      this.resultColumns = headers;
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

  clearResults() { $('resultTable').innerHTML = ''; this.resultColumns = []; }

  exportCsv() {
    const table = $('resultTable');
    const first = table.querySelector('.res-row');
    if (!first) { toast('暂无解析结果'); return; }
    // 注意：querySelector 返回单个元素，Array.from(元素) 会得到 []，表头必须用 querySelectorAll 取
    const headers = Array.from(first.querySelectorAll('.res-c')).map((s) => s.dataset.h);
    const lines = [headers.join(',')];
    table.querySelectorAll('.res-row').forEach((r) => {
      lines.push(Array.from(r.querySelectorAll('.res-c')).map(csvCell).join(','));
    });
    downloadFile('protocol_result.csv', '\uFEFF' + lines.join('\r\n'));
  }
}

function csvCell(s) { const t = s.textContent; return '"' + t.replace(/"/g, '""') + '"'; }
