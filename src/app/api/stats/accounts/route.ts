import { NextResponse } from "next/server";

import { getDb } from "@/server/db";

type AccountRow = {
  created_at: string;
  id: number;
  monthly_pnl_goal: number | null;
  name: string;
  weekly_pnl_goal: number | null;
  withdraw_balance_threshold: number | null;
  withdraw_min_win_count: number | null;
  withdraw_min_win_pnl: number | null;
};

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

export async function GET() {
  const db = getDb();

  const accounts = db
    .prepare(
      [
        "SELECT",
        "  id,",
        "  name,",
        "  created_at,",
        "  weekly_pnl_goal,",
        "  monthly_pnl_goal,",
        "  withdraw_balance_threshold,",
        "  withdraw_min_win_count,",
        "  withdraw_min_win_pnl",
        "FROM accounts",
        "WHERE name != 'Mortgage'",
        "ORDER BY name ASC, id ASC",
      ].join("\n"),
    )
    .all() as AccountRow[];

  const now = new Date();
  const weekStart = startOfTradingWeekSunday(now).toISOString();
  const monthStart = startOfLocalMonth(now).toISOString();

  const pnlSinceRows = db
    .prepare(
      [
        "SELECT",
        "  account AS accountName,",
        "  SUM(CASE WHEN closed_at >= ? THEN pnl ELSE 0 END) AS pnlWeek,",
        "  SUM(CASE WHEN closed_at >= ? THEN pnl ELSE 0 END) AS pnlMonth",
        "FROM trades",
        "GROUP BY accountName",
      ].join("\n"),
    )
    .all(weekStart, monthStart) as Array<{ accountName: string; pnlMonth: number | null; pnlWeek: number | null }>;

  const pnlByAccountName = new Map<string, { pnlMonth: number; pnlWeek: number }>();
  pnlSinceRows.forEach((r) =>
    pnlByAccountName.set(r.accountName, { pnlMonth: r.pnlMonth ?? 0, pnlWeek: r.pnlWeek ?? 0 }),
  );

  const balanceByAccountId = new Map<number, number>();
  (
    db
      .prepare(
        [
          "SELECT account_id AS accountId, COALESCE(SUM(amount), 0) AS balance",
          "FROM account_ledger",
          "GROUP BY account_id",
        ].join("\n"),
      )
      .all() as Array<{ accountId: number; balance: number }>
  ).forEach((r) => balanceByAccountId.set(r.accountId, r.balance));

  const lastWithdrawalByAccountId = new Map<number, string>();
  (
    db
      .prepare(
        [
          "SELECT account_id AS accountId, MAX(created_at) AS lastWithdrawalAt",
          "FROM account_ledger",
          "WHERE type = 'WITHDRAWAL'",
          "GROUP BY account_id",
        ].join("\n"),
      )
      .all() as Array<{ accountId: number; lastWithdrawalAt: string | null }>
  ).forEach((r) => {
    if (r.lastWithdrawalAt) lastWithdrawalByAccountId.set(r.accountId, r.lastWithdrawalAt);
  });

  const tradeCounts = db
    .prepare(
      [
        "SELECT",
        "  account AS accountName,",
        "  SUM(CASE WHEN pnl >= win_min_pnl THEN 1 ELSE 0 END) AS totalWins,",
        "  SUM(CASE WHEN closed_at >= since_ts AND pnl >= win_min_pnl THEN 1 ELSE 0 END) AS winsSince",
        "FROM (",
        "  SELECT",
        "    t.account AS account,",
        "    t.closed_at AS closed_at,",
        "    t.pnl AS pnl,",
        "    COALESCE(a.withdraw_min_win_pnl, 150) AS win_min_pnl,",
        "    COALESCE(lw.lastWithdrawalAt, '1970-01-01T00:00:00.000Z') AS since_ts",
        "  FROM trades t",
        "  JOIN accounts a ON a.name = t.account",
        "  LEFT JOIN (",
        "    SELECT account_id, MAX(created_at) AS lastWithdrawalAt",
        "    FROM account_ledger",
        "    WHERE type = 'WITHDRAWAL'",
        "    GROUP BY account_id",
        "  ) lw ON lw.account_id = a.id",
        ")",
        "GROUP BY accountName",
      ].join("\n"),
    )
    .all() as Array<{ accountName: string; totalWins: number | null; winsSince: number | null }>;

  const winsByAccountName = new Map<string, { totalWins: number; winsSince: number }>();
  tradeCounts.forEach((r) =>
    winsByAccountName.set(r.accountName, {
      totalWins: r.totalWins ?? 0,
      winsSince: r.winsSince ?? 0,
    }),
  );

  return NextResponse.json({
    accounts: accounts.map((a) => {
      const weeklyGoalDerived =
        a.weekly_pnl_goal !== null && Number.isFinite(a.weekly_pnl_goal)
          ? a.weekly_pnl_goal
          : a.monthly_pnl_goal !== null && Number.isFinite(a.monthly_pnl_goal)
            ? a.monthly_pnl_goal / 4
            : null;

      const balance = balanceByAccountId.get(a.id) ?? 0;
      const lastWithdrawalAt = lastWithdrawalByAccountId.get(a.id) ?? null;
      const wins = winsByAccountName.get(a.name) ?? { totalWins: 0, winsSince: 0 };

      const eligible =
        a.withdraw_balance_threshold !== null &&
        a.withdraw_min_win_count !== null &&
        balance >= a.withdraw_balance_threshold &&
        wins.winsSince >= a.withdraw_min_win_count;

      const pnl = pnlByAccountName.get(a.name) ?? { pnlMonth: 0, pnlWeek: 0 };

      return {
        accountId: a.id,
        balance,
        createdAt: a.created_at,
        eligible,
        lastWithdrawalAt,
        monthlyPnlGoal: a.monthly_pnl_goal,
        name: a.name,
        pnlMonth: pnl.pnlMonth,
        pnlWeek: pnl.pnlWeek,
        totalWins: wins.totalWins,
        winMinPnl: a.withdraw_min_win_pnl ?? 150,
        weeklyPnlGoal: weeklyGoalDerived,
        winsSinceLastWithdrawal: wins.winsSince,
        withdrawBalanceThreshold: a.withdraw_balance_threshold,
        withdrawMinWinCount: a.withdraw_min_win_count,
      };
    }),
  });
}

