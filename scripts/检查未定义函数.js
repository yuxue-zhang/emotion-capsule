// 找出「调用了但没定义」的函数 —— updateASRStatusUI 就是这类漏网之鱼
const fs = require('fs');
const file = process.argv[2] || 'E:/情绪胶囊/情绪胶囊机_原型.html';
const src = fs.readFileSync(file, 'utf8');

const BUILTIN = new Set(('if for while switch catch return typeof function new delete void await async do else try finally throw case '
  + 'document window console Math JSON Object Array String Number Boolean Date Promise Set Map WeakMap WeakSet Symbol BigInt RegExp Error '
  + 'setTimeout setInterval clearTimeout clearInterval requestAnimationFrame cancelAnimationFrame fetch queueMicrotask '
  + 'parseInt parseFloat isNaN isFinite encodeURIComponent decodeURIComponent encodeURI decodeURI atob btoa alert confirm prompt '
  + 'Blob File FormData URL URLSearchParams XMLHttpRequest AudioContext webkitAudioContext MediaRecorder Image TextEncoder TextDecoder '
  + 'navigator location history localStorage sessionStorage screen performance crypto Intl Reflect Proxy '
  + 'require module exports process Buffer globalThis structuredClone').split(/\s+/));

const defined = new Set();
for (const m of src.matchAll(/function\s+([A-Za-z_$][\w$]*)\s*\(/g)) defined.add(m[1]);
for (const m of src.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s+)?(?:function\b|\()/g)) defined.add(m[1]);
for (const m of src.matchAll(/window\.([A-Za-z_$][\w$]*)\s*=/g)) defined.add(m[1]);

const calls = new Map();
const add = (n) => { if (n && !BUILTIN.has(n) && !defined.has(n)) calls.set(n, (calls.get(n) || 0) + 1); };
// 普通调用（排除 obj.method()）
for (const m of src.matchAll(/(^|[^.\w$'"])([A-Za-z_$][\w$]*)\s*\(/gm)) add(m[2]);
// onclick 等内联事件
for (const m of src.matchAll(/on\w+\s*=\s*"([^"]*)"/g)) {
  for (const c of m[1].matchAll(/([A-Za-z_$][\w$]*)\s*\(/g)) add(c[1]);
}

const rows = [...calls.entries()].sort((a, b) => b[1] - a[1]);
if (!rows.length) { console.log('未发现「调用但未定义」的函数'); }
else {
  console.log('调用但未定义（按次数排序，需人工确认是否为漏删的函数）:');
  for (const [n, c] of rows) console.log('  ' + String(c).padStart(3) + ' 次  ' + n);
}
