import { NextResponse } from "next/server";

import { getDb } from "@/server/db";

type OptionsTradeRow = {
  account: string;
  avg_buy_price: number | null;
  avg_sell_price: number | null;
  beg_balance: number | null;
  bought_count: number | null;
  contract: string;
  contracts_yes_no: string | null;
  created_at: string;
  exit_trade_date: string | null;
  id: number;
  trade_date: string;
  trading_grade: string | null;
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const account = searchParams.get("account")?.trim() || "Mortgage";

  const db = getDb();
  const rows = db
    .prepare(
      [
        "SELECT",
        "  id,",
        "  account,",
        "  created_at,",
        "  trade_date,",
        "  contract,",
        "  beg_balance,",
        "  avg_buy_price,",
        "  contracts_yes_no,",
        "  bought_count,",
        "  avg_sell_price,",
        "  exit_trade_date,",
        "  trading_grade",
        "FROM options_trades",
        "WHERE account = ?",
        "ORDER BY trade_date DESC, id DESC",
        "LIMIT 1000",
      ].join("\n"),
    )
    .all(account) as OptionsTradeRow[];

  return NextResponse.json({
    account,
    trades: rows.map((r) => ({
      account: r.account,
      avgBuyPrice: r.avg_buy_price,
      avgSellPrice: r.avg_sell_price,
      begBalance: r.beg_balance,
      boughtCount: r.bought_count,
      contract: r.contract,
      contractsYesNo: r.contracts_yes_no,
      createdAt: r.created_at,
      exitTradeDate: r.exit_trade_date,
      id: r.id,
      tradeDate: r.trade_date,
      tradingGrade: r.trading_grade,
    })),
  });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as null | {
    account?: unknown;
    avgBuyPrice?: unknown;
    avgSellPrice?: unknown;
    boughtCount?: unknown;
    contract?: unknown;
    contractsYesNo?: unknown;
    exitTradeDate?: unknown;
    tradeDate?: unknown;
    tradingGrade?: unknown;
  };

  const account = typeof body?.account === "string" && body.account.trim() ? body.account.trim() : "Mortgage";
  if (account !== "Mortgage") {
    return NextResponse.json({ error: "only the Mortgage options account is supported" }, { status: 400 });
  }

  const tradeDate = typeof body?.tradeDate === "string" ? body.tradeDate.trim() : "";
  const contract = typeof body?.contract === "string" ? body.contract.trim() : "";
  const contractsYesNo =
    body?.contractsYesNo === null || body?.contractsYesNo === undefined
      ? null
      : typeof body.contractsYesNo === "string"
        ? body.contractsYesNo.trim()
        : String(body.contractsYesNo);
  const tradingGrade =
    body?.tradingGrade === null || body?.tradingGrade === undefined
      ? null
      : typeof body.tradingGrade === "string"
        ? body.tradingGrade.trim()
        : String(body.tradingGrade);

  const avgBuyPrice =
    body?.avgBuyPrice === null || body?.avgBuyPrice === undefined ? null : Number(body.avgBuyPrice);
  const avgSellPrice =
    body?.avgSellPrice === null || body?.avgSellPrice === undefined ? null : Number(body.avgSellPrice);
  const boughtCount =
    body?.boughtCount === null || body?.boughtCount === undefined ? null : Number(body.boughtCount);
  const exitTradeDateIn =
    typeof body?.exitTradeDate === "string" && body.exitTradeDate.trim() ? body.exitTradeDate.trim() : null;

  if (!tradeDate) {
    return NextResponse.json({ error: "tradeDate is required" }, { status: 400 });
  }
  if (!contract) {
    return NextResponse.json({ error: "contract is required" }, { status: 400 });
  }
  if (avgBuyPrice === null || !Number.isFinite(avgBuyPrice)) {
    return NextResponse.json({ error: "avgBuyPrice is required and must be a number" }, { status: 400 });
  }
  if (boughtCount === null || !Number.isFinite(boughtCount) || boughtCount <= 0) {
    return NextResponse.json({ error: "boughtCount is required and must be a positive number" }, { status: 400 });
  }
  if (avgSellPrice !== null && !Number.isFinite(avgSellPrice)) {
    return NextResponse.json({ error: "avgSellPrice must be a number" }, { status: 400 });
  }
  if (exitTradeDateIn && !/^\d{4}-\d{2}-\d{2}$/.test(exitTradeDateIn)) {
    return NextResponse.json({ error: "exitTradeDate must be YYYY-MM-DD" }, { status: 400 });
  }

  const exitTradeDate =
    avgSellPrice === null
      ? null
      : exitTradeDateIn ?? tradeDate;

  const db = getDb();
  const info = db
    .prepare(
      [
        "INSERT INTO options_trades (",
        "  account,",
        "  avg_buy_price,",
        "  avg_sell_price,",
        "  beg_balance,",
        "  bought_count,",
        "  contract,",
        "  contracts_yes_no,",
        "  created_at,",
        "  exit_trade_date,",
        "  trade_date,",
        "  trading_grade",
        ") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      ].join("\n"),
    )
    .run(
      account,
      avgBuyPrice,
      avgSellPrice,
      null,
      boughtCount,
      contract,
      contractsYesNo,
      new Date().toISOString(),
      exitTradeDate,
      tradeDate,
      tradingGrade,
    );

  return NextResponse.json({ id: Number(info.lastInsertRowid), ok: true });
}

