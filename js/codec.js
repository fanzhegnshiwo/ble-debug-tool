/* ============================================================
 * 编解码层：HEX / ASCII / UTF-8 数据格式转换（纯函数，无状态）
 * ============================================================ */
'use strict';

export function hexBytes(u8) {
  return Array.from(u8 || []).map((b) => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
}

export function asciiBytes(u8) {
  let s = '';
  for (const b of u8 || []) s += b >= 32 && b < 127 ? String.fromCharCode(b) : '.';
  return s;
}

export function formatData(u8) {
  if (!u8 || !u8.length) return '(空)';
  return `${hexBytes(u8)}  |  ${asciiBytes(u8)}`;
}

// 解析 HEX 输入，容忍空格 / 冒号 / 逗号 / 0x 前缀
export function parseHex(text) {
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

export function encodeData(text, fmt) {
  if (fmt === 'HEX') return parseHex(text);
  if (fmt === 'ASCII') {
    if (!/^[\x00-\x7F]*$/.test(String(text))) throw new Error('ASCII 模式只能包含英文字符，中文请改用 UTF-8');
    return new TextEncoder().encode(String(text));
  }
  if (fmt === 'UTF-8') return new TextEncoder().encode(String(text));
  throw new Error(`未知格式: ${fmt}`);
}

// 判断一段输入是否可被当作 HEX 解析（成对十六进制）
export function isHexLike(text) {
  const clean = String(text || '').replace(/0[xX]/g, '').replace(/[\s:,]+/g, '');
  return /^[0-9a-fA-F]+$/.test(clean) && clean.length > 0 && clean.length % 2 === 0;
}

// 自动确定发送内容（HEX 或文本）
export function encodeAuto(text) {
  if (isHexLike(text)) return parseHex(text);
  return new TextEncoder().encode(String(text));
}

export function decodeUtf8(u8) {
  try {
    return new TextDecoder('utf-8').decode(u8);
  } catch {
    return null;
  }
}
