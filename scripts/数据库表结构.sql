-- ============================================================================
-- 情绪胶囊机 · 数据库表结构 (SQLite)
-- ----------------------------------------------------------------------------
-- 版本    : v2.0    日期: 2026-09-24
-- 存储策略: 数据 100% 本地，不上云、不做账号、不做社区
-- 运行时  : 原型内嵌 sql.js (SQLite WASM)；
--           数据库文件通过 本地服务器.js 直接写入工作目录 情绪胶囊数据库.sqlite
-- 数据流  : 录音 → 本地 Whisper 转文字 → AI 分析 → 内存 state → SQLite → 工作目录文件
-- 隐私红线: 原始语音与原始文本（raw）一律不入库，只存打码后文本
-- ============================================================================

PRAGMA foreign_keys = ON;

-- ============================================================================
-- 1. settings —— 用户设置（key-value，便于扩展）
-- ----------------------------------------------------------------------------
-- 现有键: sound(音效) / vibrate(震动) / migrated_from_ls(迁移标记)
-- ============================================================================
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL                      -- JSON 编码存储，兼容布尔/数字/字符串
);

-- ============================================================================
-- 2. capsules —— 胶囊（屁话分析记录，核心业务表）
-- ----------------------------------------------------------------------------
-- 一颗胶囊 = 一句被捕捉并分析过的屁话。
-- 生命周期: 入桶(in_bin=1) → 被扭蛋消耗(in_bin=0，历史保留，仅存档不参与逻辑)
-- ============================================================================
CREATE TABLE IF NOT EXISTS capsules (
  id          INTEGER PRIMARY KEY,         -- 快照ID（Date.now()），前端生成
  category    TEXT    NOT NULL,             -- feihua|huabing|shuaiguo|heihua|dianyan
  masked_text TEXT    NOT NULL,             -- 打码原句（原始文本永不入库）
  human_text  TEXT    NOT NULL,             -- 人话翻译
  diagnosis   TEXT,                        -- 诊断，如"黑话口气污染"
  usage_hint  TEXT,                        -- 用法建议，如"每日一笑"
  score       INTEGER NOT NULL DEFAULT 50,  -- 离谱度 10-99
  source      TEXT    NOT NULL DEFAULT 'voice',  -- voice(语音捕捉) | manual(手动装填)
  ai_powered  INTEGER NOT NULL DEFAULT 0,   -- 1=AI 分析, 0=本地算法
  fart_type   TEXT    NOT NULL DEFAULT '',  -- silent|squeaky|rumble|bass|mega
  sound_word  TEXT    NOT NULL DEFAULT '',  -- 屁拟声词，如"噗~~~"
  in_bin      INTEGER NOT NULL DEFAULT 1,   -- 1=桶内(有效) / 0=已被扭蛋消耗(存档)
  seq         INTEGER NOT NULL DEFAULT 0,   -- 桶内顺序（消耗时从最旧开始）
  created_at  TEXT    NOT NULL              -- ISO8601 时间
);

CREATE INDEX IF NOT EXISTS idx_capsules_cat  ON capsules(category, in_bin);
CREATE INDEX IF NOT EXISTS idx_capsules_bin  ON capsules(in_bin, seq);
CREATE INDEX IF NOT EXISTS idx_capsules_time ON capsules(created_at);

-- ============================================================================
-- 3. draw_records —— 扭蛋抽签记录（只增不改）
-- ----------------------------------------------------------------------------
-- 消耗 N 颗桶内胶囊兑换一次扭蛋，记录抽取结果与消耗数量。
-- ============================================================================
CREATE TABLE IF NOT EXISTS draw_records (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  draw_type  TEXT    NOT NULL,              -- normal(普通5颗) | category(专属3颗) | grand(大满贯15颗)
  rarity     TEXT    NOT NULL,              -- normal(80%) | rare(18%) | easter(2%)
  title      TEXT    NOT NULL,              -- 签语等级，如"上上签/中吉/平签"
  text       TEXT    NOT NULL,              -- 签语正文，如"今日宜摸鱼"
  sub        TEXT,                          -- 签语副文，如"不宜开会超过30分钟"
  is_grand   INTEGER NOT NULL DEFAULT 0,    -- 1=大满贯彩虹蛋
  cost_count INTEGER NOT NULL DEFAULT 5,    -- 本次消耗胶囊数
  created_at TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_draw_time ON draw_records(created_at);

-- ============================================================================
-- 4. badges —— 徽章解锁记录
-- ----------------------------------------------------------------------------
-- 五类集齐3颗解锁对应徽章 + 大满贯徽章。只记录解锁事实，条件实时计算。
-- ============================================================================
CREATE TABLE IF NOT EXISTS badges (
  badge_id    TEXT PRIMARY KEY,             -- feihua|huabing|shuaiguo|heihua|dianyan|grand
  unlocked_at TEXT NOT NULL                 -- 解锁时间（同时用于恢复解锁顺序）
);

-- ============================================================================
-- 5. gyb_history —— "关你屁事"回怼生成历史
-- ----------------------------------------------------------------------------
-- 记录每次 AI 生成的三档回怼话术，保留最近 50 条（滚动清理）。
-- ============================================================================
CREATE TABLE IF NOT EXISTS gyb_history (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  input_text TEXT NOT NULL,                 -- 用户输入的屁话（用户主动键入，允许原样保存）
  gentle     TEXT,                          -- 温和版（怂怂的抗议）
  humor      TEXT,                          -- 幽默版（脱口秀式接梗）
  tough      TEXT,                          -- 强硬版（发疯式硬怼）
  model      TEXT,                          -- 生成模型，如 Qwen/Qwen2.5-7B-Instruct
  created_at TEXT NOT NULL
);

-- ============================================================================
-- 统计视图 —— 每周屁话报告（对应"本周屁况"卡片）
-- ============================================================================
CREATE VIEW IF NOT EXISTS v_weekly_stats AS
SELECT
  category,
  COUNT(*)                          AS cnt,
  ROUND(AVG(score), 1)              AS avg_score,
  SUM(CASE WHEN ai_powered = 1 THEN 1 ELSE 0 END) AS ai_cnt
FROM capsules
WHERE in_bin = 1
  AND created_at >= datetime('now', '-7 day')
GROUP BY category;

-- ============================================================================
-- 常用查询示例
-- ----------------------------------------------------------------------------
-- 各桶当前存量（入桶页格子数字）:
--   SELECT category, COUNT(*) FROM capsules WHERE in_bin=1 GROUP BY category;
--
-- 历史累计（含已消耗，用于"我的"页统计）:
--   SELECT COUNT(*) FROM capsules;
--
-- 大满贯进度判定所需数据:
--   SELECT category, COUNT(*) cnt, MAX(score) max_score
--   FROM capsules WHERE in_bin=1 GROUP BY category;
-- ============================================================================
