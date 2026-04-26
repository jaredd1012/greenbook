import { NextResponse } from "next/server";

import { getDb } from "@/server/db";

type IngestEventRow = {
  account: string;
  created_at: string;
  duplicate_raw_log: number;
  id: number;
  raw_log_id: number | null;
  trade_inserted_count: number;
  trade_requested_count: number;
  trade_skipped_count: number;
};

type AddedLogRow = {
  account: string;
  created_at: string;
  raw_log_id: number;
  trade_inserted_count: number;
  trade_requested_count: number;
  trade_skipped_count: number;
};

export async function GET() {
  const db = getDb();

  const addedLogs = db
    .prepare(
      [
        "SELECT",
        "  ie.account AS account,",
        "  MAX(ie.created_at) AS created_at,",
        "  ie.raw_log_id AS raw_log_id,",
        "  ie.trade_inserted_count AS trade_inserted_count,",
        "  ie.trade_requested_count AS trade_requested_count,",
        "  ie.trade_skipped_count AS trade_skipped_count",
        "FROM ingest_events ie",
        "WHERE ie.duplicate_raw_log = 0 AND ie.raw_log_id IS NOT NULL",
        "GROUP BY ie.raw_log_id",
        "ORDER BY created_at DESC, raw_log_id DESC",
        "LIMIT 200",
      ].join("\n"),
    )
    .all() as AddedLogRow[];

  const rows = db
    .prepare(
      [
        "SELECT",
        "  id,",
        "  account,",
        "  created_at,",
        "  raw_log_id,",
        "  duplicate_raw_log,",
        "  trade_inserted_count,",
        "  trade_requested_count,",
        "  trade_skipped_count",
        "FROM ingest_events",
        "ORDER BY created_at DESC, id DESC",
        "LIMIT 200",
      ].join("\n"),
    )
    .all() as IngestEventRow[];

  return NextResponse.json({
    addedLogs: addedLogs.map((r) => ({
      account: r.account,
      createdAt: r.created_at,
      rawLogId: r.raw_log_id,
      tradeInsertedCount: r.trade_inserted_count,
      tradeRequestedCount: r.trade_requested_count,
      tradeSkippedCount: r.trade_skipped_count,
    })),
    events: rows.map((r) => ({
      account: r.account,
      createdAt: r.created_at,
      duplicateRawLog: Boolean(r.duplicate_raw_log),
      id: r.id,
      rawLogId: r.raw_log_id,
      tradeInsertedCount: r.trade_inserted_count,
      tradeRequestedCount: r.trade_requested_count,
      tradeSkippedCount: r.trade_skipped_count,
    })),
  });
}

