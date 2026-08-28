/* ============================================================
 * 协议解析引擎：按规则从字节流中提取字段（纯函数，无 DOM/状态）
 * ============================================================ */
'use strict';

export const TYPE_SIZES = {
  uint8: 1, int8: 1, uint16: 2, int16: 2, uint24: 3, int24: 3,
  uint32: 4, int32: 4, uint64: 8, int64: 8, float32: 4, float64: 8,
};
export const TYPE_ORDER = Object.keys(TYPE_SIZES);
export const DEFAULT_TYPE_BY_LEN = { 1: 'uint8', 2: 'uint16', 3: 'uint24', 4: 'uint32', 8: 'uint64' };

export function parseEnumText(text) {
  const out = {};
  for (let part of String(text || '').split(';')) {
    part = part.trim();
    if (!part) continue;
    let key, label;
    if (part.includes('=')) [key, label] = part.split('=', 1).concat(part.split('=').slice(1).join('='));
    else if (part.includes(':')) [key, label] = part.split(':', 1).concat(part.split(':').slice(1).join(':'));
    else continue;
    const v = parseInt(key.trim(), 0);
    if (!isNaN(v)) out[v] = label.trim();
  }
  return out;
}

// 按规则解析一段字节，返回 { text, error }
export function parseProtocol(payload, rule) {
  const size = TYPE_SIZES[rule.type];
  if (size == null) return { text: '', error: `未知类型：${rule.type}` };
  if (rule.offset < 0 || rule.offset + size > payload.length) {
    return { text: '', error: `偏移 ${rule.offset} 长度 ${size} 超出数据范围（共 ${payload.length} 字节）` };
  }
  const little = rule.endian === 'little';
  const chunk = payload.slice(rule.offset, rule.offset + size);

  let value;
  if (rule.type.startsWith('float')) {
    const dv = new DataView(chunk.buffer, chunk.byteOffset, chunk.byteLength);
    value = rule.type === 'float32' ? dv.getFloat32(0, little) : dv.getFloat64(0, little);
  } else {
    const signed = rule.type.startsWith('int');
    const bytes = Array.from(chunk);
    let v = 0;
    if (little) { for (let i = bytes.length - 1; i >= 0; i--) v = v * 256 + bytes[i]; }
    else { for (let i = 0; i < bytes.length; i++) v = v * 256 + bytes[i]; }
    if (signed && v >= Math.pow(2, size * 8 - 1)) v -= Math.pow(2, size * 8);
    value = v;
  }

  const enumMap = parseEnumText(rule.enum_text);
  if (enumMap && value in enumMap) return { text: `${enumMap[value]}`, error: '' };
  const unit = rule.unit ? ` ${rule.unit}` : '';
  if (typeof value === 'number' && !Number.isInteger(value)) return { text: `${value}${unit}`, error: '' };
  return { text: `${Math.round(value)}${unit}`, error: '' };
}
