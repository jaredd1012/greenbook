import { NextResponse } from "next/server";

import { getDb } from "@/server/db";

function localYmd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startOfLocalMonthYmd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function startOfTradingWeekSunday(d: Date) {
  const start = new Date(d);
  start.setDate(d.getDate() - d.getDay());
  return new Date(start.getFullYear(), start.getMonth(), start.getDate(), 0, 0, 0, 0);
}

type PnlRow = { pnl: number | null };

const PNL_EXPR = "SUM((avg_sell_price - avg_buy_price) * 100.0 * bought_count) AS pnl";
const BASE_WHERE = [
  "FROM options_trades",
  "WHERE account = 'Mortgage'",
  "  AND avg_buy_price IS NOT NULL",
  "  AND avg_sell_price IS NOT NULL",
  "  AND bought_count IS NOT NULL",
].join("\n");

export async function GET() {
  const db = getDb();
  const now = new Date();
  const todayYmd = localYmd(now);
  const weekStartYmd = localYmd(startOfTradingWeekSunday(now));
  const monthStartYmd = startOfLocalMonthYmd(now);

  const sumPnl = (extraWhere: string, ...params: string[]) => {
    const row = db
      .prepare(
        [
          "SELECT",
          `  ${PNL_EXPR}`,
          BASE_WHERE,
          extraWhere,
        ].join("\n"),
      )
      .get(...params) as PnlRow;
    return row?.pnl ?? 0;
  };

  const pnlDayCol = "COALESCE(exit_trade_date, trade_date)";

  const pnlToday = sumPnl(`AND ${pnlDayCol} = ?`, todayYmd);
  const pnlWeek = sumPnl(`AND ${pnlDayCol} >= ?`, weekStartYmd);
  const pnlMonthly = sumPnl(`AND ${pnlDayCol} >= ?`, monthStartYmd);

  const goalRow = db
    .prepare("SELECT monthly_pnl_goal AS monthlyGoal FROM accounts WHERE name = 'Mortgage'")
    .get() as undefined | { monthlyGoal: number | null };

  return NextResponse.json({
    goalMonthly: goalRow?.monthlyGoal ?? 3000,
    monthKey: monthStartYmd.slice(0, 7),
    pnlMonthly,
    pnlToday,
    pnlWeek,
    ranges: {
      monthStartYmd,
      todayYmd,
      weekStartYmd,
    },
  });
}
