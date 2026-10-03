// 生成分享版.js —— 从主原型生成对外版本，并同步到 gh-pages/index.html
//
// 两种模式：
//   1) node 生成分享版.js
//      脱敏版：清空所有 API Key。用于开源、代码托管、发给开发者看。
//
//   2) node 生成分享版.js --public [--key=sk-xxxx]
//      公开体验版：内置语音识别 Key，别人拿到链接打开就能用，不用任何配置。
//      --key 不传时，沿用原型里已有的 Key。
//      ⚠️ 前端页面无法真正隐藏 Key，任何人查看源码都能拿到。
//         建议专门为对外分享申请一个低额度 Key，随时可作废。
//
// 约定（见交接文档 §10）：对外版本永远从原型复制生成，不要直接编辑。

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const SRC = path.join(ROOT, '情绪胶囊机_原型.html');
const DST = path.join(ROOT, '情绪胶囊机_分享版.html');
const PAGES = path.join(ROOT, 'gh-pages', 'index.html');

const PUBLIC = process.argv.includes('--public');
const keyArg = (process.argv.find((a) => a.startsWith('--key=')) || '').slice(6).trim();

if (!fs.existsSync(SRC)) {
  console.error('找不到主原型: ' + SRC);
  process.exit(1);
}

fs.copyFileSync(SRC, DST);
let t = fs.readFileSync(DST, 'utf8');
const before = t;

// 1. 分享版不做本地服务器探测，强制走浏览器本地存储
t = t.replace(/\?\s*location\.origin/, "? 'guest-no-server:'");

if (PUBLIC) {
  // ---- 公开体验版：内置 Key ----
  const srcText = fs.readFileSync(SRC, 'utf8');
  const builtin = keyArg || ((srcText.match(/apiKey:\s*'(sk-[A-Za-z0-9]+)'/) || [])[1] || '');
  if (!builtin) {
    console.error('中止: 没找到可用的 Key。用 --key=sk-xxxx 指定一个，或确认原型 AI_CONFIG.apiKey 里有 Key');
    process.exit(1);
  }
  // 轻量混淆：避免明文 sk- 被扫描器/爬虫直接抓走（对真人无效，但能挡自动扫描）
  const encoded = Buffer.from(builtin, 'utf8').toString('base64');
  const replaced = t.replace(/apiKey:\s*'sk-[A-Za-z0-9]*'/g, "apiKey: atob('" + encoded + "')");
  if (replaced === t) {
    console.error('中止: 原型里没有可替换的 apiKey 字段（可能已被清空）');
    process.exit(1);
  }
  t = replaced;
  const left = (t.match(/sk-[A-Za-z0-9]{16,}/g) || []).length;
  if (left > 0) {
    console.error('中止: 仍有 ' + left + ' 处明文密钥，公开版未生成');
    process.exit(1);
  }
  console.log('模式: 公开体验版（内置 Key，已做 Base64 混淆）');
} else {
  // ---- 脱敏版：清空 Key ----
  t = t.replace(/apiKey:\s*'sk-[A-Za-z0-9]+'/g, "apiKey: ''");
  const left = (t.match(/sk-[A-Za-z0-9]{16,}/g) || []).length;
  if (left > 0) {
    console.error('中止: 仍残留 ' + left + ' 处密钥，分享版未生成');
    process.exit(1);
  }
  console.log('模式: 脱敏版（Key 已清空，线上语音需自行在「我的」页填写）');
}

if (t === before) {
  console.error('警告: 没有任何替换生效，请检查原型里的 Key 字符串是否已变更');
  process.exit(1);
}

fs.writeFileSync(DST, t, 'utf8');
if (fs.existsSync(path.join(ROOT, 'gh-pages'))) {
  fs.writeFileSync(PAGES, t, 'utf8');
}

const kb = (Buffer.byteLength(t, 'utf8') / 1024).toFixed(1);
console.log('完成: ' + kb + ' KB');
console.log('  -> ' + DST);
if (fs.existsSync(path.join(ROOT, 'gh-pages'))) console.log('  -> ' + PAGES);
console.log('提示: gh-pages 需 node 部署Pages.js 才会上线');
