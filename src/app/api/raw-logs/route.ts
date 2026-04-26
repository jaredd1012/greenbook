import { parseRawLog } from "@/lib/parseRawLog";
import { getDb } from "@/server/db";
import { NextResponse } from "next/server";
import crypto from "node:crypto";

function canonicalizeRawText(value: string) {
  return value
    .replaceAll("\r\n", "\n")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .join("\n")
    .trim();
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as null | { account?: unknown; rawText?: unknown };
  const account = typeof body?.account === "string" ? body.account.trim() : "";
  const rawText = typeof body?.rawText === "string" ? body.rawText : "";
  const canonicalRawText = canonicalizeRawText(rawText);

  if (!account) {
    return NextResponse.json({ error: "account is required" }, { status: 400 });
  }

  if (!canonicalRawText) {
    return NextResponse.json({ error: "rawText is required" }, { status: 400 });
  }

  const parsed = parseRawLog(canonicalRawText);

  const db = getDb();
  const nowIso = new Date().toISOString();

  const rawHash = crypto.createHash("sha256").update(`${account}\n${canonicalRawText}`, "utf8").digest("hex");

  const findExistingRaw = db.prepare("SELECT id FROM raw_logs WHERE raw_hash = ?");
  const insertRaw = db.prepare(
    "INSERT INTO raw_logs (account, created_at, raw_hash, raw_text) VALUES (?, ?, ?, ?)",
  );
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
  const insertTrade = db.prepare(
    [
      "INSERT OR IGNORE INTO trades (",
      "  account,",
      "  raw_log_id,",
      "  symbol,",
      "  qty,",
      "  opened_at,",
      "  open_price,",
      "  side,",
      "  duration_seconds,",
      "  closed_at,",
      "  close_price,",
      "  pnl",
      ") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ].join("\n"),
  );

  const result = db.transaction(() => {
    const existing = findExistingRaw.get(rawHash) as undefined | { id: number };
    if (existing) {
      const tradeRequestedCount = parsed.trades.length;
      const tradeInsertedCount = 0;
      const tradeSkippedCount = tradeRequestedCount;

      insertIngestEvent.run(
        account,
        nowIso,
        rawHash,
        existing.id,
        1,
        tradeInsertedCount,
        tradeRequestedCount,
        tradeSkippedCount,
      );

      return { duplicate: true, rawLogId: existing.id, tradeInsertedCount, tradeRequestedCount, tradeSkippedCount };
    }

    const rawInsert = insertRaw.run(account, nowIso, rawHash, canonicalRawText);
    const rawLogId = Number(rawInsert.lastInsertRowid);

    let tradeInsertedCount = 0;
    parsed.trades.forEach((t) => {
      const info = insertTrade.run(
        account,
        rawLogId,
        t.symbol,
        t.qty,
        t.openedAt.toISOString(),
        t.openPrice,
        t.side,
        t.durationSeconds,
        t.closedAt.toISOString(),
        t.closePrice,
        t.pnl,
      );
      if (info.changes > 0) tradeInsertedCount += 1;
    });

    const tradeRequestedCount = parsed.trades.length;
    const tradeSkippedCount = tradeRequestedCount - tradeInsertedCount;

    insertIngestEvent.run(
      account,
      nowIso,
      rawHash,
      rawLogId,
      0,
      tradeInsertedCount,
      tradeRequestedCount,
      tradeSkippedCount,
    );

    return { duplicate: false, rawLogId, tradeInsertedCount, tradeRequestedCount, tradeSkippedCount };
  })();

  return NextResponse.json({
    account,
    duplicate: result.duplicate,
    issues: parsed.issues,
    rawLogId: result.rawLogId,
    tradeInsertedCount: result.tradeInsertedCount,
    tradeRequestedCount: result.tradeRequestedCount,
    tradeSkippedCount: result.tradeSkippedCount,
  });
}

