/* ============================================================
 * 情绪胶囊机 · 本地服务器
 * 作用：1) 托管产品原型页面  2) 把 SQLite 数据库直接写入本工作目录
 * 启动：node 本地服务器.js [端口]     端口默认 3000
 * 打开：http://localhost:3000
 * 数据：运行数据保存在同目录 情绪胶囊数据库.sqlite，可用
 *       DB Browser for SQLite / sqlite3 命令直接打开查看
 * ============================================================ */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const PORT = Number(process.argv[2]) || 3000;
const ROOT = __dirname;
const HTML_FILE = path.join(ROOT, '情绪胶囊机_原型.html');
const SHARE_FILE = path.join(ROOT, '情绪胶囊机_分享版.html');
const DASHBOARD_FILE = path.join(ROOT, '游戏看板.html');
const DB_FILE = path.join(ROOT, '情绪胶囊数据库.sqlite');
const TEST_DB_FILE = path.join(ROOT, '测试数据库.sqlite');

/* 读取一个 SQLite 库的全部表 → JSON（只读，看板数据源） */
function readStats(file) {
  if (!fs.existsSync(file)) {
    return { ok: true, exists: false, tables: { capsules: [], draw_records: [], badges: [], gyb_history: [] } };
  }
  const db = new DatabaseSync(file, { readOnly: true });
  const tables = {};
  for (const t of ['capsules', 'draw_records', 'badges', 'gyb_history']) {
    try {
      tables[t] = db.prepare('SELECT * FROM ' + t + ' ORDER BY 1').all();
    } catch (e) { tables[t] = []; }
  }
  db.close();
  return { ok: true, exists: true, tables };
}

function send(res, status, body, type) {
  res.writeHead(status, {
    'Content-Type': type || 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);

  if (req.method === 'OPTIONS') return send(res, 204, '');

  // 托管原型页面
  if (req.method === 'GET' && (url === '/' || url === '/index.html')) {
    try {
      return send(res, 200, fs.readFileSync(HTML_FILE), 'text/html; charset=utf-8');
    } catch (e) {
      return send(res, 500, JSON.stringify({ ok: false, error: '找不到 情绪胶囊机_原型.html' }));
    }
  }

  // 游戏看板（独立页面，不在应用内）
  if (req.method === 'GET' && (url === '/游戏看板' || url === '/dashboard')) {
    try {
      return send(res, 200, fs.readFileSync(DASHBOARD_FILE), 'text/html; charset=utf-8');
    } catch (e) {
      return send(res, 500, JSON.stringify({ ok: false, error: '找不到 游戏看板.html' }));
    }
  }

  // 朋友试玩专用（脱敏分享版：无 API Key，数据只存访客浏览器本地）
  if (req.method === 'GET' && (url === '/play' || url === '/分享版')) {
    try {
      return send(res, 200, fs.readFileSync(SHARE_FILE), 'text/html; charset=utf-8');
    } catch (e) {
      return send(res, 500, JSON.stringify({ ok: false, error: '找不到 情绪胶囊机_分享版.html' }));
    }
  }

  // 看板数据源：正式玩家数据 + 测试数据
  if (req.method === 'GET' && url === '/api/stats') {
    try { return send(res, 200, JSON.stringify(readStats(DB_FILE))); }
    catch (e) { return send(res, 500, JSON.stringify({ ok: false, error: String(e) })); }
  }
  if (req.method === 'GET' && url === '/api/test-stats') {
    try { return send(res, 200, JSON.stringify(readStats(TEST_DB_FILE))); }
    catch (e) { return send(res, 500, JSON.stringify({ ok: false, error: String(e) })); }
  }

  // 探测：页面启动时用它判断本地服务器是否在运行
  if (req.method === 'GET' && url === '/api/health') {
    return send(res, 200, JSON.stringify({ ok: true, dbFile: path.basename(DB_FILE) }));
  }

  // 读取数据库文件
  if (req.method === 'GET' && url === '/api/load-db') {
    if (!fs.existsSync(DB_FILE)) return send(res, 404, JSON.stringify({ ok: false, reason: 'empty' }));
    return send(res, 200, fs.readFileSync(DB_FILE), 'application/octet-stream');
  }

  // 保存数据库文件（先写临时文件再替换；Windows 下文件被占用时重试，绝不崩溃）
  if (req.method === 'POST' && url === '/api/save-db') {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const buf = Buffer.concat(chunks);
    if (!buf.length) return send(res, 400, JSON.stringify({ ok: false, error: '空数据' }));
    const tmp = DB_FILE + '.tmp';
    const trySave = () => {
      fs.writeFileSync(tmp, buf);
      try {
        fs.renameSync(tmp, DB_FILE);
        return true;
      } catch (e) {
        try { fs.unlinkSync(DB_FILE); fs.renameSync(tmp, DB_FILE); return true; }
        catch (e2) { return false; }
      }
    };
    if (trySave() || (await new Promise(r => setTimeout(r, 300)) && trySave())) {
      return send(res, 200, JSON.stringify({ ok: true, size: buf.length, file: path.basename(DB_FILE) }));
    }
    // 两次都失败（文件被占用）：返回 500，页面自动降级存 IndexedDB，不丢数据
    return send(res, 500, JSON.stringify({ ok: false, error: '数据库文件被占用，本次写入降级' }));
  }

  send(res, 404, JSON.stringify({ ok: false, error: 'not found' }));
});

server.listen(PORT, () => {
  console.log('情绪胶囊机 · 本地服务器已启动');
  console.log('  产品原型: http://localhost:' + PORT);
  console.log('  游戏看板: http://localhost:' + PORT + '/游戏看板');
  console.log('  数据库文件: ' + DB_FILE);
  console.log('  停止: Ctrl+C');
});
