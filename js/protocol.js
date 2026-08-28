/* ============================================================
 * 数据编解码 + 协议解析规则引擎（移植自桌面版 core.py / protocol_panel.py）
 * ============================================================ */
'use strict';

/* ---------- 数据格式工具 ---------- */

function hexBytes(u8) {
  return Array.from(u8 || []).map((b) => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
}

function asciiBytes(u8) {
  let s = '';
  for (const b of u8) s += b >= 32 && b < 127 ? String.fromCharCode(b) : '.';
  return s;
}

function formatData(u8) {
  if (!u8 || !u8.length) return '(空)';
  return `${hexBytes(u8)}  |  ${asciiBytes(u8)}`;
}

// 解析 HEX 输入，容忍空格 / 冒号 / 逗号 / 0x 前缀
function parseHex(text) {
  let cleaned = String(text || '').replace(/0[xX]/g, '');
  cleaned = cleaned.replace(/[^0-9a-fA-F]/g, '');
  if (!cleaned) return new Uint8Array(0);
  if (cleaned.length % 2 !== 0) throw new Error('HEX 长度必须为偶数（每字节两位十六进制）');
  const out = new Uint8Array(cleaned.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(cleaned.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function encodeData(text, fmt) {
  if (fmt === 'HEX') return parseHex(text);
  if (fmt === 'ASCII') {
    if (!/^[\x00-\x7F]*$/.test(String(text))) throw new Error('ASCII 模式只能包含英文字符，中文请改用 UTF-8');
    return new TextEncoder().encode(String(text));
  }
  if (fmt === 'UTF-8') return new TextEncoder().encode(String(text));
  throw new Error(`未知格式: ${fmt}`);
}

// 判断一段输入是否可被当作 HEX 解析（成对十六进制）
function isHexLike(text) {
  const clean = String(text || '').replace(/0[xX]/g, '').replace(/[\s:,]+/g, '');
  return /^[0-9a-fA-F]+$/.test(clean) && clean.length > 0 && clean.length % 2 === 0;
}

// 自动确定发送内容（HEX 或文本）
function encodeAuto(text) {
  if (isHexLike(text)) return parseHex(text);
  return new TextEncoder().encode(String(text));
}

function decodeUtf8(u8) {
  try {
    return new TextDecoder('utf-8').decode(u8);
  } catch {
    return null;
  }
}

/* ---------- 协议解析规则引擎 ---------- */

const TYPE_SIZES = {
  uint8: 1, int8: 1, uint16: 2, int16: 2, uint24: 3, int24: 3,
  uint32: 4, int32: 4, uint64: 8, int64: 8, float32: 4, float64: 8,
};
const TYPE_ORDER = Object.keys(TYPE_SIZES);
const DEFAULT_TYPE_BY_LEN = { 1: 'uint8', 2: 'uint16', 3: 'uint24', 4: 'uint32', 8: 'uint64' };

function parseEnumText(text) {
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
function parseProtocol(payload, rule) {
  const size = TYPE_SIZES[rule.type];
  if (size == null) return { text: '', error: `未知类型：${rule.type}` };
  if (rule.offset < 0 || rule.offset + size > payload.length) {
    return { text: '', error: `偏移 ${rule.offset} 长度 ${size} 超出数据范围（共 ${payload.length} 字节）` };
  }
  const little = rule.endian === 'little';
  const chunk = payload.slice(rule.offset, rule.offset + size);

  let value;
  if (rule.type.startsWith('float')) {
    const dv = little ? new DataView(chunk.buffer, chunk.byteOffset, chunk.byteLength) : new DataView(chunk.buffer, chunk.byteOffset, chunk.byteLength);
    value = rule.type === 'float32' ? dv.getFloat32(0, little) : dv.getFloat64(0, little);
  } else {
    const signed = rule.type.startsWith('int');
    for (const b of chunk) {} // noop
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