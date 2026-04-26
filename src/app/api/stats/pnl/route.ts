import { NextResponse } from "next/server";

import { getDb } from "@/server/db";

function startOfLocalDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function startOfLocalMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}

function startOfTradingWeekSunday(d: Date) {
  const day = d.getDay(); // 0 Sun .. 6 Sat
  const start = new Date(d);
  start.setDate(d.getDate() - day);
  return startOfLocalDay(start);
}

function startOfLocalYear(d: Date) {
  return new Date(d.getFullYear(), 0, 1, 0, 0, 0, 0);
}

type PnlRow = { pnl: number | null };

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const account = searchParams.get("account")?.trim() ?? "";

  const db = getDb();

  const now = new Date();
  const todayStart = startOfLocalDay(now).toISOString();
  const weekStart = startOfTradingWeekSunday(now).toISOString();
  const monthStart = startOfLocalMonth(now).toISOString();
  const yearStart = startOfLocalYear(now).toISOString();

  const where = account
    ? "WHERE account = ? AND closed_at >= ?"
    : "WHERE account != 'Mortgage' AND closed_at >= ?";
  const whereAll = account ? "WHERE account = ?" : "WHERE account != 'Mortgage'";

  const sumSince = db.prepare(
    [
      "SELECT SUM(pnl) AS pnl",
      "FROM trades",
      where,
    ].join("\n"),
  );

  const sumAll = db.prepare(
    [
      "SELECT SUM(pnl) AS pnl",
      "FROM trades",
      whereAll,
    ].join("\n"),
  );

  const today = (account ? (sumSince.get(account, todayStart) as PnlRow) : (sumSince.get(todayStart) as PnlRow)).pnl ?? 0;
  const week = (account ? (sumSince.get(account, weekStart) as PnlRow) : (sumSince.get(weekStart) as PnlRow)).pnl ?? 0;
  const month = (account ? (sumSince.get(account, monthStart) as PnlRow) : (sumSince.get(monthStart) as PnlRow))
    .pnl ?? 0;
  const year = (account ? (sumSince.get(account, yearStart) as PnlRow) : (sumSince.get(yearStart) as PnlRow)).pnl ?? 0;
  const allTime = (account ? (sumAll.get(account) as PnlRow) : (sumAll.get() as PnlRow)).pnl ?? 0;

  const goalRow = account
    ? (db
        .prepare(
          [
            "SELECT",
            "  COALESCE(weekly_pnl_goal, monthly_pnl_goal / 4.0) AS weeklyGoal,",
            "  monthly_pnl_goal AS monthlyGoal",
            "FROM accounts",
            "WHERE name = ?",
          ].join("\n"),
        )
        .get(account) as undefined | { monthlyGoal: number | null; weeklyGoal: number | null })
    : (db
        .prepare(
          [
            "SELECT",
            "  SUM(COALESCE(weekly_pnl_goal, monthly_pnl_goal / 4.0)) AS weeklyGoal,",
            "  SUM(monthly_pnl_goal) AS monthlyGoal",
            "FROM accounts",
            "WHERE name != 'Mortgage' AND (weekly_pnl_goal IS NOT NULL OR monthly_pnl_goal IS NOT NULL)",
          ].join("\n"),
        )
        .get() as { monthlyGoal: number | null; weeklyGoal: number | null });

  return NextResponse.json({
    account: account || null,
    goals: {
      monthly: goalRow?.monthlyGoal ?? null,
      weekly: goalRow?.weeklyGoal ?? null,
    },
    ranges: {
      monthStart,
      todayStart,
      weekStart,
      yearStart,
    },
    totals: {
      allTime,
      month,
      today,
      week,
      year,
    },
  });
}

