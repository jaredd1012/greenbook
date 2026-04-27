import { NextResponse } from "next/server";

import { getDb } from "@/server/db";

type LedgerRow = {
  amount: number;
  created_at: string;
  id: number;
  note: string | null;
  type: string;
};

type AccountRow = {
  created_at: string;
  daily_pnl_goal: number | null;
  id: number;
  monthly_pnl_goal: number | null;
  name: string;
  weekly_pnl_goal: number | null;
  withdraw_balance_threshold: number | null;
  withdraw_min_win_count: number | null;
  withdraw_min_win_pnl: number | null;
};

function parseAccountId(param: string) {
  const id = Number(param);
  if (!Number.isInteger(id) || id <= 0) return null;
  return id;
}

export async function GET(_: Request, context: { params: Promise<{ accountId: string }> }) {
  const { accountId } = await context.params;
  const id = parseAccountId(accountId);
  if (!id) return NextResponse.json({ error: "invalid accountId" }, { status: 400 });

  const db = getDb();
  const account = db
    .prepare(
      [
        "SELECT",
        "  id,",
        "  name,",
        "  created_at,",
        "  daily_pnl_goal,",
        "  weekly_pnl_goal,",
        "  monthly_pnl_goal,",
        "  withdraw_balance_threshold,",
        "  withdraw_min_win_count,",
        "  withdraw_min_win_pnl",
        "FROM accounts",
        "WHERE id = ?",
      ].join("\n"),
    )
    .get(id) as AccountRow | undefined;
  if (!account) return NextResponse.json({ error: "account not found" }, { status: 404 });

  const ledger = db
    .prepare(
      [
        "SELECT",
        "  id,",
        "  account_id,",
        "  amount,",
        "  type,",
        "  note,",
        "  created_at",
        "FROM account_ledger",
        "WHERE account_id = ?",
        "ORDER BY created_at DESC, id DESC",
        "LIMIT 500",
      ].join("\n"),
    )
    .all(id) as (LedgerRow & { account_id: number })[];

  const balanceRow = db
    .prepare("SELECT COALESCE(SUM(amount), 0) AS balance FROM account_ledger WHERE account_id = ?")
    .get(id) as { balance: number };

  const lastWithdrawal = db
    .prepare(
      [
        "SELECT created_at AS createdAt",
        "FROM account_ledger",
        "WHERE account_id = ? AND type = 'WITHDRAWAL'",
        "ORDER BY created_at DESC, id DESC",
        "LIMIT 1",
      ].join("\n"),
    )
    .get(id) as undefined | { createdAt: string };

  const since = lastWithdrawal?.createdAt ?? "1970-01-01T00:00:00.000Z";
  const winMinPnl = account.withdraw_min_win_pnl ?? 150;

  const winsRow = db
    .prepare(
      [
        "SELECT COUNT(*) AS c",
        "FROM trades",
        "WHERE account = ? AND closed_at >= ? AND pnl >= ?",
      ].join("\n"),
    )
    .get(account.name, since, winMinPnl) as { c: number };

  const withdrawEligible =
    account.withdraw_balance_threshold !== null &&
    account.withdraw_min_win_count !== null &&
    balanceRow.balance >= account.withdraw_balance_threshold &&
    winsRow.c >= account.withdraw_min_win_count;

  return NextResponse.json({
    account: {
      createdAt: account.created_at,
      id: account.id,
      dailyPnlGoal: account.daily_pnl_goal,
      monthlyPnlGoal: account.monthly_pnl_goal,
      name: account.name,
      weeklyPnlGoal:
        account.weekly_pnl_goal !== null && Number.isFinite(account.weekly_pnl_goal)
          ? account.weekly_pnl_goal
          : account.monthly_pnl_goal !== null && Number.isFinite(account.monthly_pnl_goal)
            ? account.monthly_pnl_goal / 4
            : null,
      withdrawBalanceThreshold: account.withdraw_balance_threshold,
      withdrawMinWinCount: account.withdraw_min_win_count,
      withdrawMinWinPnl: account.withdraw_min_win_pnl,
    },
    balance: balanceRow.balance,
    withdrawStatus: {
      eligible: withdrawEligible,
      lastWithdrawalAt: lastWithdrawal?.createdAt ?? null,
      since,
      winCountSince: winsRow.c,
    },
    ledger: ledger.map((l) => ({
      amount: l.amount,
      createdAt: l.created_at,
      id: l.id,
      note: l.note,
      type: l.type,
    })),
  });
}

export async function POST(req: Request, context: { params: Promise<{ accountId: string }> }) {
  const { accountId } = await context.params;
  const id = parseAccountId(accountId);
  if (!id) return NextResponse.json({ error: "invalid accountId" }, { status: 400 });

  const body = (await req.json().catch(() => null)) as null | {
    amount?: unknown;
    note?: unknown;
    type?: unknown;
  };

  const type = typeof body?.type === "string" ? body.type.trim().toUpperCase() : "";
  const note = typeof body?.note === "string" ? body.note.trim() : null;
  const amount = typeof body?.amount === "number" ? body.amount : Number(body?.amount);

  if (!Number.isFinite(amount)) return NextResponse.json({ error: "amount is required" }, { status: 400 });

  if (!["DEPOSIT", "WITHDRAWAL"].includes(type)) {
    return NextResponse.json({ error: "type must be DEPOSIT or WITHDRAWAL" }, { status: 400 });
  }

  const signedAmount = type === "WITHDRAWAL" ? -Math.abs(amount) : Math.abs(amount);

  const db = getDb();
  const exists = db.prepare("SELECT 1 FROM accounts WHERE id = ?").get(id) as undefined | { 1: 1 };
  if (!exists) return NextResponse.json({ error: "account not found" }, { status: 404 });

  const info = db
    .prepare("INSERT INTO account_ledger (account_id, amount, created_at, note, type) VALUES (?, ?, ?, ?, ?)")
    .run(id, signedAmount, new Date().toISOString(), note, type);

  return NextResponse.json({ id: Number(info.lastInsertRowid), ok: true });
}

export async function PUT(req: Request, context: { params: Promise<{ accountId: string }> }) {
  const { accountId } = await context.params;
  const id = parseAccountId(accountId);
  if (!id) return NextResponse.json({ error: "invalid accountId" }, { status: 400 });

  const body = (await req.json().catch(() => null)) as null | {
    dailyPnlGoal?: unknown;
    monthlyPnlGoal?: unknown;
    weeklyPnlGoal?: unknown;
    withdrawBalanceThreshold?: unknown;
    withdrawMinWinCount?: unknown;
    withdrawMinWinPnl?: unknown;
  };

  const dailyPnlGoal =
    body?.dailyPnlGoal === null || body?.dailyPnlGoal === undefined ? null : Number(body.dailyPnlGoal);
  const monthlyPnlGoal =
    body?.monthlyPnlGoal === null || body?.monthlyPnlGoal === undefined ? null : Number(body.monthlyPnlGoal);
  const weeklyPnlGoal =
    body?.weeklyPnlGoal === null || body?.weeklyPnlGoal === undefined ? null : Number(body.weeklyPnlGoal);
  const withdrawBalanceThreshold =
    body?.withdrawBalanceThreshold === null || body?.withdrawBalanceThreshold === undefined
      ? null
      : Number(body.withdrawBalanceThreshold);
  const withdrawMinWinCount =
    body?.withdrawMinWinCount === null || body?.withdrawMinWinCount === undefined
      ? null
      : Number(body.withdrawMinWinCount);
  const withdrawMinWinPnl =
    body?.withdrawMinWinPnl === null || body?.withdrawMinWinPnl === undefined ? null : Number(body.withdrawMinWinPnl);

  if (dailyPnlGoal !== null && !Number.isFinite(dailyPnlGoal)) {
    return NextResponse.json({ error: "dailyPnlGoal must be a number" }, { status: 400 });
  }
  if (weeklyPnlGoal !== null && !Number.isFinite(weeklyPnlGoal)) {
    return NextResponse.json({ error: "weeklyPnlGoal must be a number" }, { status: 400 });
  }
  if (monthlyPnlGoal !== null && !Number.isFinite(monthlyPnlGoal)) {
    return NextResponse.json({ error: "monthlyPnlGoal must be a number" }, { status: 400 });
  }
  if (withdrawBalanceThreshold !== null && !Number.isFinite(withdrawBalanceThreshold)) {
    return NextResponse.json({ error: "withdrawBalanceThreshold must be a number" }, { status: 400 });
  }
  if (withdrawMinWinCount !== null && (!Number.isFinite(withdrawMinWinCount) || withdrawMinWinCount < 0)) {
    return NextResponse.json({ error: "withdrawMinWinCount must be a non-negative number" }, { status: 400 });
  }
  if (withdrawMinWinPnl !== null && !Number.isFinite(withdrawMinWinPnl)) {
    return NextResponse.json({ error: "withdrawMinWinPnl must be a number" }, { status: 400 });
  }

  const db = getDb();
  const exists = db.prepare("SELECT 1 FROM accounts WHERE id = ?").get(id) as undefined | { 1: 1 };
  if (!exists) return NextResponse.json({ error: "account not found" }, { status: 404 });

  db.prepare(
    [
      "UPDATE accounts",
      "SET",
      "  daily_pnl_goal = ?,",
      "  weekly_pnl_goal = ?,",
      "  monthly_pnl_goal = ?,",
      "  withdraw_balance_threshold = ?,",
      "  withdraw_min_win_count = ?,",
      "  withdraw_min_win_pnl = ?",
      "WHERE id = ?",
    ].join("\n"),
  ).run(dailyPnlGoal, weeklyPnlGoal, monthlyPnlGoal, withdrawBalanceThreshold, withdrawMinWinCount, withdrawMinWinPnl, id);

  return NextResponse.json({ ok: true });
}

export async function DELETE(_: Request, context: { params: Promise<{ accountId: string }> }) {
  const { accountId } = await context.params;
  const id = parseAccountId(accountId);
  if (!id) {
    return NextResponse.json({ error: "invalid accountId" }, { status: 400 });
  }

  let db: ReturnType<typeof getDb>;
  try {
    db = getDb();
  } catch (e) {
    console.error("DELETE /api/accounts/[id] (getDb)", e);
    return NextResponse.json({ error: "Database unavailable" }, { status: 500 });
  }

  const row = db
    .prepare("SELECT id, name FROM accounts WHERE id = ?")
    .get(id) as { id: number; name: string } | undefined;

  if (!row) {
    return NextResponse.json({ error: "account not found" }, { status: 404 });
  }
  if (row.name === "Mortgage") {
    return NextResponse.json({ error: "the Mortgage account cannot be deleted" }, { status: 400 });
  }

  const name = row.name;
  try {
    const run = db.transaction(() => {
      db.prepare("DELETE FROM ingest_events WHERE account = ?").run(name);
      db.prepare("DELETE FROM raw_logs WHERE account = ?").run(name);
      db.prepare("DELETE FROM options_trades WHERE account = ?").run(name);
      db.prepare("DELETE FROM accounts WHERE id = ?").run(id);
    });
    run();
  } catch (e) {
    console.error("DELETE /api/accounts/[id] (transaction)", e);
    return NextResponse.json({ error: "Failed to delete account" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

