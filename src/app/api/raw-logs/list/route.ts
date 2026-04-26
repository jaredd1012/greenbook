import { NextResponse } from "next/server";

import { getDb } from "@/server/db";

type RawLogRow = {
  account: string;
  created_at: string;
  id: number;
  trade_count: number;
};

export async function GET() {
  const db = getDb();
  const rows = db
    .prepare(
      [
        "SELECT",
        "  rl.id AS id,",
        "  rl.account AS account,",
        "  rl.created_at AS created_at,",
        "  COUNT(t.id) AS trade_count",
        "FROM raw_logs rl",
        "LEFT JOIN trades t ON t.raw_log_id = rl.id",
        "GROUP BY rl.id",
        "ORDER BY rl.created_at DESC, rl.id DESC",
        "LIMIT 200",
      ].join("\n"),
    )
    .all() as RawLogRow[];

  return NextResponse.json({
    logs: rows.map((r) => ({
      account: r.account,
      createdAt: r.created_at,
      id: r.id,
      tradeCount: r.trade_count,
    })),
  });
}

