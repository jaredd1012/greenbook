import type { default as SqliteDatabaseCtor } from "better-sqlite3";
import crypto from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

/** Load at runtime from `node_modules` so Next’s server bundler (Turbopack) does not N‑API‑break the addon. */
const requireFromAppRoot = createRequire(path.join(process.cwd(), "package.json"));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Database = requireFromAppRoot("better-sqlite3") as typeof SqliteDatabaseCtor;

type SqliteDatabase = InstanceType<typeof SqliteDatabaseCtor>;

let dbSingleton: SqliteDatabase | undefined;

function getDbFilePath() {
  const fromEnv = process.env.GREENBOOK_DATA_DIR?.trim() || process.env.DATA_DIR?.trim();
  const dataDir = fromEnv ? fromEnv : path.join(process.cwd(), "data");
  const dbFilePath = path.join(dataDir, "greenbook.sqlite");

  fs.mkdirSync(dataDir, { recursive: true });

  return dbFilePath;
}

function hasColumn(db: SqliteDatabase, table: string, column: string) {
  const columns = db
    .prepare("SELECT name FROM pragma_table_info(?)")
    .all(table) as Array<{ name: string }>;

  return columns.some((c) => c.name === column);
}

function ensureSchema(db: SqliteDatabase) {
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL,
      name TEXT NOT NULL,
      daily_pnl_goal REAL,
      monthly_pnl_goal REAL,
      withdraw_balance_threshold REAL,
      weekly_pnl_goal REAL,
      withdraw_min_win_count INTEGER,
      withdraw_min_win_pnl REAL
    );

    CREATE TABLE IF NOT EXISTS account_ledger (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      created_at TEXT NOT NULL,
      note TEXT,
      type TEXT NOT NULL,
      FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS options_trades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account TEXT NOT NULL,
      created_at TEXT NOT NULL,
      trade_date TEXT NOT NULL,
      contract TEXT NOT NULL,
      beg_balance REAL,
      avg_buy_price REAL,
      contracts_yes_no TEXT,
      bought_count INTEGER,
      avg_sell_price REAL,
      trading_grade TEXT
    );

    CREATE TABLE IF NOT EXISTS raw_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account TEXT NOT NULL,
      created_at TEXT NOT NULL,
      raw_hash TEXT,
      raw_text TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS trades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account TEXT NOT NULL,
      raw_log_id INTEGER NOT NULL,
      symbol TEXT NOT NULL,
      qty INTEGER NOT NULL,
      opened_at TEXT NOT NULL,
      open_price REAL NOT NULL,
      side TEXT NOT NULL,
      duration_seconds INTEGER NOT NULL,
      closed_at TEXT NOT NULL,
      close_price REAL NOT NULL,
      pnl REAL NOT NULL,
      FOREIGN KEY(raw_log_id) REFERENCES raw_logs(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS ingest_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account TEXT NOT NULL,
      created_at TEXT NOT NULL,
      raw_hash TEXT NOT NULL,
      raw_log_id INTEGER,
      duplicate_raw_log INTEGER NOT NULL,
      trade_inserted_count INTEGER NOT NULL,
      trade_requested_count INTEGER NOT NULL,
      trade_skipped_count INTEGER NOT NULL,
      FOREIGN KEY(raw_log_id) REFERENCES raw_logs(id) ON DELETE SET NULL
    );
  `);

  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS accounts_name_unique ON accounts(name)");
  db.exec("CREATE INDEX IF NOT EXISTS account_ledger_account_id_created_at_idx ON account_ledger(account_id, created_at)");
  db.exec("CREATE INDEX IF NOT EXISTS options_trades_account_trade_date_idx ON options_trades(account, trade_date)");

  if (!hasColumn(db, "accounts", "withdraw_balance_threshold")) {
    db.exec("ALTER TABLE accounts ADD COLUMN withdraw_balance_threshold REAL");
  }
  if (!hasColumn(db, "accounts", "daily_pnl_goal")) {
    db.exec("ALTER TABLE accounts ADD COLUMN daily_pnl_goal REAL");
  }
  if (!hasColumn(db, "accounts", "weekly_pnl_goal")) {
    db.exec("ALTER TABLE accounts ADD COLUMN weekly_pnl_goal REAL");
  }
  if (!hasColumn(db, "accounts", "monthly_pnl_goal")) {
    db.exec("ALTER TABLE accounts ADD COLUMN monthly_pnl_goal REAL");
  }
  if (!hasColumn(db, "accounts", "withdraw_min_win_count")) {
    db.exec("ALTER TABLE accounts ADD COLUMN withdraw_min_win_count INTEGER");
  }
  if (!hasColumn(db, "accounts", "withdraw_min_win_pnl")) {
    db.exec("ALTER TABLE accounts ADD COLUMN withdraw_min_win_pnl REAL");
  }

  // Ensure a dedicated account for options/mortgage tracking exists.
  db.prepare(
    [
      "INSERT OR IGNORE INTO accounts (created_at, name, monthly_pnl_goal)",
      "VALUES (?, ?, ?)",
    ].join("\n"),
  ).run(new Date().toISOString(), "Mortgage", 3000);

  if (!hasColumn(db, "raw_logs", "account")) {
    db.exec("ALTER TABLE raw_logs ADD COLUMN account TEXT NOT NULL DEFAULT 'default'");
  }

  if (!hasColumn(db, "raw_logs", "raw_hash")) {
    db.exec("ALTER TABLE raw_logs ADD COLUMN raw_hash TEXT");
  }

  if (!hasColumn(db, "trades", "account")) {
    db.exec("ALTER TABLE trades ADD COLUMN account TEXT NOT NULL DEFAULT 'default'");
  }

  if (!hasColumn(db, "options_trades", "exit_trade_date")) {
    db.exec("ALTER TABLE options_trades ADD COLUMN exit_trade_date TEXT");
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS payout_config (
      id INTEGER PRIMARY KEY,
      monthly_payout_goal REAL NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );
  `);
  db.prepare("INSERT OR IGNORE INTO payout_config (id, monthly_payout_goal, updated_at) VALUES (1, 0, ?)").run(
    new Date().toISOString(),
  );

  // Backfill raw_hash for existing rows (and canonicalize text for stable hashing).
  const rowsToBackfill = db
    .prepare("SELECT account, id, raw_text FROM raw_logs WHERE raw_hash IS NULL OR raw_hash = ''")
    .all() as Array<{ account: string; id: number; raw_text: string }>;

  const updateHash = db.prepare("UPDATE raw_logs SET raw_hash = ?, raw_text = ? WHERE id = ?");

  rowsToBackfill.forEach((r) => {
    const canonical = r.raw_text
      .replaceAll("\r\n", "\n")
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
      .join("\n")
      .trim();

    const hash = crypto
      .createHash("sha256")
      .update(`${r.account}\n${canonical}`, "utf8")
      .digest("hex");
    updateHash.run(hash, canonical, r.id);
  });

  // Remove any already-duplicated raw logs, keeping the earliest id per hash.
  const duplicates = db
    .prepare(
      [
        "SELECT raw_hash AS rawHash, MIN(id) AS keepId",
        "FROM raw_logs",
        "WHERE raw_hash IS NOT NULL AND raw_hash != ''",
        "GROUP BY raw_hash",
        "HAVING COUNT(*) > 1",
      ].join("\n"),
    )
    .all() as Array<{ keepId: number; rawHash: string }>;

  const findIdsToDelete = db.prepare(
    "SELECT id FROM raw_logs WHERE raw_hash = ? AND id != ? ORDER BY id DESC",
  );
  const deleteRawLog = db.prepare("DELETE FROM raw_logs WHERE id = ?");

  db.transaction(() => {
    duplicates.forEach((d) => {
      const ids = findIdsToDelete.all(d.rawHash, d.keepId) as Array<{ id: number }>;
      ids.forEach((row) => deleteRawLog.run(row.id));
    });
  })();

  // Enforce uniqueness going forward (note: UNIQUE allows multiple NULLs; we always write a hash in code).
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS raw_logs_raw_hash_unique ON raw_logs(raw_hash)");

  // If duplicates already exist, SQLite will refuse to create a UNIQUE index.
  // So we delete duplicate trades first (keep earliest id for each fingerprint).
  db.exec(
    [
      "DELETE FROM trades",
      "WHERE id IN (",
      "  SELECT id",
      "  FROM (",
      "    SELECT",
      "      id,",
      "      ROW_NUMBER() OVER (",
      "        PARTITION BY",
      "          account,",
      "          symbol,",
      "          qty,",
      "          opened_at,",
      "          open_price,",
      "          side,",
      "          closed_at,",
      "          close_price,",
      "          pnl",
      "        ORDER BY id ASC",
      "      ) AS rn",
      "    FROM trades",
      "  )",
      "  WHERE rn > 1",
      ")",
    ].join("\n"),
  );

  // Trade-level safety net: prevents duplicate trades even if a raw log slips through.
  db.exec(
    [
      "CREATE UNIQUE INDEX IF NOT EXISTS trades_trade_fingerprint_unique ON trades(",
      "  account,",
      "  symbol,",
      "  qty,",
      "  opened_at,",
      "  open_price,",
      "  side,",
      "  closed_at,",
      "  close_price,",
      "  pnl",
      ")",
    ].join("\n"),
  );

  db.exec("CREATE INDEX IF NOT EXISTS ingest_events_created_at_idx ON ingest_events(created_at)");

  // Backfill ingest_events for previously saved raw logs (so the trade log on the dashboard can show history even before this table existed).
  const ingestEventCount = (db.prepare("SELECT COUNT(*) AS c FROM ingest_events").get() as { c: number }).c;
  if (ingestEventCount === 0) {
    const rawLogs = db
      .prepare("SELECT id, account, created_at, raw_hash FROM raw_logs ORDER BY created_at ASC, id ASC")
      .all() as Array<{ account: string; created_at: string; id: number; raw_hash: string | null }>;

    const tradeCounts = db
      .prepare(
        [
          "SELECT raw_log_id AS rawLogId, COUNT(*) AS tradeCount",
          "FROM trades",
          "GROUP BY raw_log_id",
        ].join("\n"),
      )
      .all() as Array<{ rawLogId: number; tradeCount: number }>;

    const tradeCountByRawLogId = new Map<number, number>();
    tradeCounts.forEach((t) => tradeCountByRawLogId.set(t.rawLogId, t.tradeCount));

    const insertIngestEvent = db.prepare(
      [
        "INSERT INTO ingest_events (",
        "  account,",
        "  created_at,",
        "  raw_hash,",
        "  raw_log_id,",
        "  duplicate_raw_log,",
        "  trade_inserted_count,",
        "  trade_requested_count,",
        "  trade_skipped_count",
        ") VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      ].join("\n"),
    );

    db.transaction(() => {
      rawLogs.forEach((rl) => {
        const tradeCount = tradeCountByRawLogId.get(rl.id) ?? 0;
        insertIngestEvent.run(
          rl.account,
          rl.created_at,
          rl.raw_hash ?? "",
          rl.id,
          0,
          tradeCount,
          tradeCount,
          0,
        );
      });
    })();
  }
}

export function getDb() {
  if (!dbSingleton) {
    const dbFilePath = getDbFilePath();
    try {
      const db = new Database(dbFilePath);
      ensureSchema(db);
      dbSingleton = db;
    } catch (e) {
      console.error(
        "[greenbook] Failed to open SQLite. Check GREENBOOK_DATA_DIR, disk mount, and permissions. Path:",
        dbFilePath,
        e,
      );
      throw e;
    }
  }

  return dbSingleton;
}

