import { NextResponse } from "next/server";
import crypto from "node:crypto";

import { DEFAULT_DOLLARS_PER_POINT, futuresPnlFromPrices } from "@/lib/futuresPnl";
import { getDb } from "@/server/db";

type TradeRow = {
  account: string;
  close_price: number;
  closed_at: string;
  duration_seconds: number;
  id: number;
  open_price: number;
  opened_at: string;
  pnl: number;
  qty: number;
  raw_log_id: number;
  side: string;
  symbol: string;
};

export async function GET(req: Request) {
  const db = getDb();
  const { searchParams } = new URL(req.url);
  const rawLogIdParam = searchParams.get("rawLogId");
  const rawLogId = rawLogIdParam ? Number(rawLogIdParam) : null;
  const accountFilter = searchParams.get("account")?.trim() ?? "";

  const whereClauses: string[] = [];
  const params: Array<number | string> = [];

  if (rawLogId !== null && Number.isFinite(rawLogId)) {
    whereClauses.push("raw_log_id = ?");
    params.push(rawLogId);
  }

  if (accountFilter) {
    whereClauses.push("account = ?");
    params.push(accountFilter);
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

  const rows = db
    .prepare(
      [
        "SELECT",
        "  account,",
        "  id,",
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
        "FROM trades",
        whereSql,
        "ORDER BY opened_at DESC, id DESC",
        "LIMIT 500",
      ].join("\n"),
    )
    .all(...params) as TradeRow[];

  return NextResponse.json({
    trades: rows.map((r) => ({
      account: r.account,
      closePrice: r.close_price,
      closedAt: r.closed_at,
      durationSeconds: r.duration_seconds,
      id: r.id,
      openPrice: r.open_price,
      openedAt: r.opened_at,
      pnl: r.pnl,
      qty: r.qty,
      rawLogId: r.raw_log_id,
      side: r.side,
      symbol: r.symbol,
    })),
  });
}

const SIDES = new Set(["LONG", "SHORT"]);

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as null | {
    account?: unknown;
    closePrice?: unknown;
    closedAt?: unknown;
    dollarsPerPoint?: unknown;
    openPrice?: unknown;
    openedAt?: unknown;
    qty?: unknown;
    side?: unknown;
    symbol?: unknown;
  };

  const account = typeof body?.account === "string" ? body.account.trim() : "";
  if (!account) {
    return NextResponse.json({ error: "account is required" }, { status: 400 });
  }
  if (account === "Mortgage") {
    return NextResponse.json({ error: "use the options form for the Mortgage account" }, { status: 400 });
  }

  const symbol = typeof body?.symbol === "string" ? body.symbol.trim() : "";
  if (!symbol) {
    return NextResponse.json({ error: "symbol is required" }, { status: 400 });
  }

  const side = typeof body?.side === "string" ? body.side.trim().toUpperCase() : "";
  if (!SIDES.has(side)) {
    return NextResponse.json({ error: "side must be LONG or SHORT" }, { status: 400 });
  }

  const qty = typeof body?.qty === "number" ? body.qty : Number(body?.qty);
  if (!Number.isFinite(qty) || !Number.isInteger(qty) || qty <= 0) {
    return NextResponse.json({ error: "qty must be a positive integer" }, { status: 400 });
  }

  const openPrice = typeof body?.openPrice === "number" ? body.openPrice : Number(body?.openPrice);
  const closePrice = typeof body?.closePrice === "number" ? body.closePrice : Number(body?.closePrice);
  if (!Number.isFinite(openPrice) || !Number.isFinite(closePrice)) {
    return NextResponse.json({ error: "openPrice and closePrice must be numbers" }, { status: 400 });
  }

  const dollarsPerPoint =
    body?.dollarsPerPoint === null || body?.dollarsPerPoint === undefined
      ? DEFAULT_DOLLARS_PER_POINT
      : typeof body.dollarsPerPoint === "number"
        ? body.dollarsPerPoint
        : Number(body.dollarsPerPoint);
  if (!Number.isFinite(dollarsPerPoint) || dollarsPerPoint <= 0) {
    return NextResponse.json({ error: "dollarsPerPoint must be a positive number" }, { status: 400 });
  }

  const pnl = futuresPnlFromPrices(side as "LONG" | "SHORT", openPrice, closePrice, qty, dollarsPerPoint);

  const openedAt = typeof body?.openedAt === "string" ? body.openedAt.trim() : "";
  const closedAt = typeof body?.closedAt === "string" ? body.closedAt.trim() : "";
  if (!openedAt || !closedAt) {
    return NextResponse.json({ error: "openedAt and closedAt are required (ISO-8601)" }, { status: 400 });
  }

  const opened = new Date(openedAt);
  const closed = new Date(closedAt);
  if (Number.isNaN(opened.getTime()) || Number.isNaN(closed.getTime())) {
    return NextResponse.json({ error: "openedAt and closedAt must be valid datetimes" }, { status: 400 });
  }
  if (closed.getTime() < opened.getTime()) {
    return NextResponse.json({ error: "closedAt must be on or after openedAt" }, { status: 400 });
  }

  const durationSeconds = Math.max(0, Math.floor((closed.getTime() - opened.getTime()) / 1000));
  const nowIso = new Date().toISOString();
  const rawText = `[Manual entry] ${nowIso} ${crypto.randomUUID()}`;
  const rawHash = crypto.createHash("sha256").update(`${account}\n${rawText}`, "utf8").digest("hex");

  const db = getDb();
  const insertRaw = db.prepare(
    "INSERT INTO raw_logs (account, created_at, raw_hash, raw_text) VALUES (?, ?, ?, ?)",
  );
  const insertIngest = db.prepare(
    [
      "INSERT INTO ingest_events (",
      "  account, created_at, raw_hash, raw_log_id, duplicate_raw_log,",
      "  trade_inserted_count, trade_requested_count, trade_skipped_count",
      ") VALUES (?, ?, ?, ?, 0, ?, ?, ?)",
    ].join("\n"),
  );
  const insertTrade = db.prepare(
    [
      "INSERT INTO trades (",
      "  account, raw_log_id, symbol, qty, opened_at, open_price, side,",
      "  duration_seconds, closed_at, close_price, pnl",
      ") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ].join("\n"),
  );

  const result = db.transaction(() => {
    const raw = insertRaw.run(account, nowIso, rawHash, rawText);
    const rawLogId = Number(raw.lastInsertRowid);
    const trade = insertTrade.run(
      account,
      rawLogId,
      symbol,
      qty,
      opened.toISOString(),
      openPrice,
      side,
      durationSeconds,
      closed.toISOString(),
      closePrice,
      pnl,
    );
    const tradeId = Number(trade.lastInsertRowid);
    insertIngest.run(account, nowIso, rawHash, rawLogId, 1, 1, 0);
    return { rawLogId, tradeId };
  })();

  return NextResponse.json({ ...result, ok: true });
}

