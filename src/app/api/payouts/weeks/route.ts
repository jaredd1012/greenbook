import { NextResponse } from "next/server";

import { getDb } from "@/server/db";

function startOfLocalDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function startOfTradingWeekSunday(d: Date) {
  const day = d.getDay();
  const start = new Date(d);
  start.setDate(d.getDate() - day);
  return startOfLocalDay(start);
}

type PnlRow = { pnl: number | null };
type SumRow = { total: number | null };

/** First row: Sun Apr 26 – Sat May 2, 2026 (local). Then additional weeks run forward. */
const ANCHOR_LOCAL = { d: 26, m: 3, y: 2026 } as const;

function payoutSeriesFirstSunday() {
  const t = new Date(ANCHOR_LOCAL.y, ANCHOR_LOCAL.m, ANCHOR_LOCAL.d);
  return startOfTradingWeekSunday(t);
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const countRaw = searchParams.get("count");
  const count = Math.min(52, Math.max(1, countRaw ? Number(countRaw) : 8));
  if (!Number.isInteger(count)) {
    return NextResponse.json({ error: "count must be an integer" }, { status: 400 });
  }

  const db = getDb();
  const goalRow = db
    .prepare("SELECT monthly_payout_goal AS m FROM payout_config WHERE id = 1")
    .get() as undefined | { m: number };
  const monthlyPayoutGoal = goalRow?.m ?? 0;
  const weeklyPayoutTarget = monthlyPayoutGoal > 0 ? monthlyPayoutGoal / 4 : 0;

  const firstSunday = payoutSeriesFirstSunday();
  const nowMs = Date.now();

  const weeks: Array<{
    futuresPnl: number;
    met: boolean | null;
    payoutTarget: number;
    shortfall: number;
    weekEnd: string;
    weekLabel: string;
    weekStart: string;
    weekStatus: "complete" | "in_progress" | "upcoming";
    withdrawalTotal: number;
  }> = [];

  const pnlStmt = db.prepare(
    [
      "SELECT COALESCE(SUM(pnl), 0) AS pnl",
      "FROM trades",
      "WHERE account != 'Mortgage'",
      "  AND closed_at >= ?",
      "  AND closed_at < ?",
    ].join("\n"),
  );

  const wStmt = db.prepare(
    [
      "SELECT COALESCE(SUM(ABS(amount)), 0) AS total",
      "FROM account_ledger",
      "WHERE type = 'WITHDRAWAL'",
      "  AND created_at >= ?",
      "  AND created_at < ?",
    ].join("\n"),
  );

  for (let w = 0; w < count; w++) {
    const weekStart = new Date(firstSunday);
    weekStart.setDate(weekStart.getDate() + 7 * w);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);

    const startIso = weekStart.toISOString();
    const endIso = weekEnd.toISOString();

    const pnl = (pnlStmt.get(startIso, endIso) as PnlRow).pnl ?? 0;
    const withdrawalTotal = (wStmt.get(startIso, endIso) as SumRow).total ?? 0;

    const label = `${weekStart.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${new Date(weekEnd.getTime() - 86400000).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;

    const t0 = weekStart.getTime();
    const t1 = weekEnd.getTime();
    let weekStatus: "complete" | "in_progress" | "upcoming";
    if (nowMs < t0) {
      weekStatus = "upcoming";
    } else if (nowMs < t1) {
      weekStatus = "in_progress";
    } else {
      weekStatus = "complete";
    }

    let met: boolean | null = null;
    let shortfall = 0;
    if (weekStatus === "complete" && weeklyPayoutTarget > 0) {
      met = withdrawalTotal >= weeklyPayoutTarget;
      shortfall = met ? 0 : Math.max(0, weeklyPayoutTarget - withdrawalTotal);
    }

    weeks.push({
      futuresPnl: pnl,
      met,
      payoutTarget: weeklyPayoutTarget,
      shortfall,
      weekEnd: endIso,
      weekLabel: label,
      weekStart: startIso,
      weekStatus,
      withdrawalTotal,
    });
  }

  return NextResponse.json({
    monthlyPayoutGoal,
    seriesStartYmd: `${ANCHOR_LOCAL.y}-04-26`,
    weekCount: weeks.length,
    weeks,
    weeklyPayoutTarget,
  });
}
