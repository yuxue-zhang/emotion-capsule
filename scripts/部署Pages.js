// 部署Pages.js —— 把 gh-pages/index.html 推到 GitHub Pages
// 用法: GITHUB_TOKEN=<你的token> node 部署Pages.js "提交说明"
//
// Token 只从环境变量读取，不写入任何文件。
// 需要 Token 具备 repo（或 public_repo）权限。推完建议在 GitHub 后台删掉该 Token。

const fs = require('fs');
const path = require('path');

const REPO = 'yuxue-zhang/emotion-capsule';
const FILE_PATH = 'index.html';
const BRANCH = 'main';
const LOCAL = path.join(__dirname, 'gh-pages', 'index.html');
const MESSAGE = process.argv[2] || 'update: 同步最新版本';

const TOKEN = process.env.GITHUB_TOKEN;
if (!TOKEN) {
  console.error('缺少 GITHUB_TOKEN 环境变量');
  console.error('用法: GITHUB_TOKEN=<token> node 部署Pages.js "提交说明"');
  process.exit(1);
}
if (!fs.existsSync(LOCAL)) {
  console.error('找不到 ' + LOCAL + '，请先运行: node 生成分享版.js');
  process.exit(1);
}

const html = fs.readFileSync(LOCAL, 'utf8');

// 出站自检：绝不能把密钥推到 public 仓库
const leaked = html.match(/sk-[A-Za-z0-9]{16,}/g) || [];
if (leaked.length > 0) {
  console.error('中止: 待部署文件里残留 ' + leaked.length + ' 处密钥');
  process.exit(1);
}
if (!html.includes("'guest-no-server:'")) {
  console.error('中止: 这不是脱敏分享版（缺少 guest 标识）');
  process.exit(1);
}

const API = 'https://api.github.com/repos/' + REPO + '/contents/' + FILE_PATH;
const HEADERS = {
  Authorization: 'Bearer ' + TOKEN,
  Accept: 'application/vnd.github+json',
  'User-Agent': 'emotion-capsule-deploy',
  'X-GitHub-Api-Version': '2022-11-28',
};

(async () => {
  console.log('待部署: ' + (Buffer.byteLength(html, 'utf8') / 1024).toFixed(1) + ' KB，明文密钥自检通过');
  if (html.includes("apiKey: atob('")) {
    console.log('注意: 这是「公开体验版」，内置了语音识别 Key（Base64 混淆）');
    console.log('      别人打开即用，但查看源码可提取该 Key。建议用专用小额 Key。');
  } else {
    console.log('      脱敏版：线上语音需使用者自己填 Key');
  }

  // 1. 取当前文件 sha（PUT 必填）
  let sha = null;
  const cur = await fetch(API + '?ref=' + BRANCH, { headers: HEADERS });
  if (cur.status === 200) {
    sha = (await cur.json()).sha;
    console.log('线上已有该文件，sha: ' + sha.slice(0, 8) + '…');
  } else if (cur.status === 404) {
    console.log('线上还没有该文件，将新建');
  } else {
    console.error('读取线上文件失败: HTTP ' + cur.status + ' ' + (await cur.text()).slice(0, 300));
    process.exit(1);
  }

  // 2. PUT 更新
  const body = {
    message: MESSAGE,
    content: Buffer.from(html, 'utf8').toString('base64'),
    branch: BRANCH,
  };
  if (sha) body.sha = sha;

  const res = await fetch(API, {
    method: 'PUT',
    headers: Object.assign({}, HEADERS, { 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  });

  if (res.status !== 200 && res.status !== 201) {
    console.error('推送失败: HTTP ' + res.status);
    console.error((await res.text()).slice(0, 600));
    process.exit(1);
  }

  const json = await res.json();
  console.log('推送成功: ' + json.commit.sha.slice(0, 8));
  console.log('');
  console.log('线上地址: https://yuxue-zhang.github.io/emotion-capsule/');
  console.log('GitHub Pages 通常需要 30 秒 ~ 2 分钟生效，请耐心刷新');
})();
