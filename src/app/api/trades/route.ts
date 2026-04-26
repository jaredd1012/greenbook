import { NextResponse } from "next/server";

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

