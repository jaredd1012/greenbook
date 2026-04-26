import { NextResponse } from "next/server";

import { getDb } from "@/server/db";

type OptionsTradeRow = {
  account: string;
  avg_sell_price: number | null;
  id: number;
  trading_grade: string | null;
};

function localYmd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseId(param: string) {
  const id = Number(param);
  if (!Number.isInteger(id) || id <= 0) {
    return null;
  }
  return id;
}

function isYyyyMmDd(s: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id: idParam } = await context.params;
  const id = parseId(idParam);
  if (!id) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  const body = (await req.json().catch(() => null)) as null | {
    avgSellPrice?: unknown;
    exitTradeDate?: unknown;
    tradingGrade?: unknown;
  };

  const avgSellPrice = body?.avgSellPrice === null || body?.avgSellPrice === undefined ? null : Number(body.avgSellPrice);
  if (avgSellPrice === null || !Number.isFinite(avgSellPrice)) {
    return NextResponse.json({ error: "avgSellPrice is required and must be a number" }, { status: 400 });
  }

  const exitRaw = typeof body?.exitTradeDate === "string" ? body.exitTradeDate.trim() : "";
  const exitTradeDate = exitRaw || localYmd(new Date());
  if (!isYyyyMmDd(exitTradeDate)) {
    return NextResponse.json({ error: "exitTradeDate must be YYYY-MM-DD" }, { status: 400 });
  }

  const db = getDb();
  const row = db
    .prepare("SELECT id, account, avg_sell_price, trading_grade FROM options_trades WHERE id = ?")
    .get(id) as undefined | OptionsTradeRow;

  if (!row) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (row.account !== "Mortgage") {
    return NextResponse.json({ error: "only the Mortgage options account is supported" }, { status: 400 });
  }
  if (row.avg_sell_price !== null) {
    return NextResponse.json({ error: "this position is already closed" }, { status: 400 });
  }

  let finalGrade = row.trading_grade;
  if (body && Object.hasOwn(body, "tradingGrade")) {
    finalGrade =
      body.tradingGrade === null || body.tradingGrade === undefined
        ? null
        : typeof body.tradingGrade === "string"
          ? body.tradingGrade.trim()
          : String(body.tradingGrade);
  }

  db.prepare("UPDATE options_trades SET avg_sell_price = ?, exit_trade_date = ?, trading_grade = ? WHERE id = ?").run(
    avgSellPrice,
    exitTradeDate,
    finalGrade,
    id,
  );

  return NextResponse.json({ ok: true });
}
