#!/usr/bin/env node
/**
 * 从麦当劳中国 MCP 拉取真实餐品营养数据，并注入 index.html 的 MCD:START / MCD:END 标记块。
 *
 *   MCD_MCP_TOKEN=xxxx node tools/fetch-mcd.mjs
 *   MCD_MCP_TOKEN=xxxx node tools/fetch-mcd.mjs --dry      只打印，不写文件
 *   MCD_MCP_TOKEN=xxxx node tools/fetch-mcd.mjs --out data.json
 *
 * Token 仅从环境变量读取，绝不写入 index.html。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ENDPOINT = 'https://mcp.mcd.cn';
const TOKEN = process.env.MCD_MCP_TOKEN;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HTML = path.join(ROOT, 'index.html');

if (!TOKEN) {
  console.error('缺少 MCD_MCP_TOKEN 环境变量。申请地址: https://open.mcd.cn/mcp');
  process.exit(1);
}

let sessionId = null;

async function rpc(body, { notify = false } = {}) {
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
    Authorization: 'Bearer ' + TOKEN
  };
  if (sessionId) headers['Mcp-Session-Id'] = sessionId;

  const res = await fetch(ENDPOINT, { method: 'POST', headers, body: JSON.stringify(body) });
  const sid = res.headers.get('mcp-session-id');
  if (sid) sessionId = sid;

  const text = await res.text();
  if (res.status === 401) throw new Error('401 MCP Token 无效或已过期');
  if (res.status === 429) throw new Error('429 触发限流（600 次/分钟），请稍后重试');
  if (notify) return null;

  // 兼容纯 JSON 与 SSE 两种响应
  try {
    return JSON.parse(text);
  } catch {
    let last = null;
    for (const line of text.split(/\r?\n/)) {
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      try { last = JSON.parse(payload); } catch { /* 忽略心跳 */ }
    }
    if (!last) throw new Error('无法解析 MCP 响应: ' + text.slice(0, 200));
    return last;
  }
}

function parseTable(raw) {
  // data 字段是多行 CSV: productName,desc,energyKj,energyKcal,protein,fat,carbohydrate,sodium,calcium
  const rows = [];
  for (const line of String(raw).split(/\r?\n/)) {
    const cells = line.split(',').map(s => s.trim());
    if (cells.length < 9) continue;
    const kcal = Number(cells[3]);
    if (!Number.isFinite(kcal)) continue;
    const name = cells[0].replace(/^\d+\s*/, '').trim();
    if (!name) continue;
    rows.push({
      n: name,
      kcal,
      p: Number(cells[4]) || 0,
      f: Number(cells[5]) || 0,
      c: Number(cells[6]) || 0,
      na: Number(cells[7]) || 0,
      ca: Number(cells[8]) || 0
    });
  }
  return rows;
}

function serialise(rows) {
  const body = rows.map(r =>
    `  { n: '${r.n.replace(/'/g, "\\'")}', kcal: ${r.kcal}, p: ${r.p}, f: ${r.f}, c: ${r.c}, na: ${r.na}, ca: ${r.ca} }`
  ).join(',\n');
  return `/*MCD:START*/\nconst MCD = [\n${body}\n];\n/*MCD:END*/`;
}

(async () => {
  const init = await rpc({
    jsonrpc: '2.0', id: 1, method: 'initialize',
    params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'burger-arena', version: '1.0.0' } }
  });
  const server = init?.result?.serverInfo?.name || 'mcd-mcp';
  await rpc({ jsonrpc: '2.0', method: 'notifications/initialized' }, { notify: true });

  const call = await rpc({
    jsonrpc: '2.0', id: 2, method: 'tools/call',
    params: { name: 'list-nutrition-foods', arguments: {} }
  });

  const parts = call?.result?.content || [];
  const text = parts.map(p => p.text || '').join('\n');
  const start = text.indexOf('{"success"');
  if (start < 0) throw new Error('未找到营养数据 JSON: ' + text.slice(0, 200));
  const payload = JSON.parse(text.slice(start));
  if (!payload.success) throw new Error('接口返回失败: ' + (payload.message || payload.code));

  const rows = parseTable(payload.data);
  if (!rows.length) throw new Error('解析到 0 条餐品数据');

  const named = ['巨无霸', '大薯条', '麦乐鸡5块', '麦辣鸡腿汉堡', '香芋派', '麦香鱼'];
  const missing = named.filter(n => !rows.find(r => r.n === n));

  console.log(`${server} 返回 ${rows.length} 条餐品`);
  console.log(`示例: ${rows.slice(0, 3).map(r => `${r.n} ${r.kcal}kcal`).join(' / ')}`);
  if (missing.length) console.warn('警告: 卡池所需餐品缺失 -> ' + missing.join(', '));

  const args = process.argv.slice(2);
  if (args.includes('--dry')) {
    console.log('--dry：不写入文件');
    return;
  }
  const outIdx = args.indexOf('--out');
  if (outIdx >= 0) {
    const out = path.resolve(ROOT, args[outIdx + 1]);
    fs.writeFileSync(out, JSON.stringify(rows, null, 2));
    console.log('已写出 ' + out);
    return;
  }

  const html = fs.readFileSync(HTML, 'utf8');
  const re = /\/\*MCD:START\*\/[\s\S]*?\/\*MCD:END\*\//;
  if (!re.test(html)) throw new Error('index.html 中未找到 MCD:START / MCD:END 标记');
  fs.writeFileSync(HTML, html.replace(re, serialise(rows)));
  console.log(`已注入 index.html（${rows.length} 条真实营养数据）`);
})().catch(err => {
  console.error('失败: ' + err.message);
  process.exit(1);
});
