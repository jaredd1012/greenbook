import { NextResponse } from "next/server";

import { getDb } from "@/server/db";

const CONFIG_ID = 1;

export async function GET() {
  const db = getDb();
  const row = db
    .prepare("SELECT monthly_payout_goal AS monthlyPayoutGoal, updated_at AS updatedAt FROM payout_config WHERE id = ?")
    .get(CONFIG_ID) as undefined | { monthlyPayoutGoal: number; updatedAt: string };

  const monthly = row?.monthlyPayoutGoal ?? 0;
  return NextResponse.json({
    monthlyPayoutGoal: monthly,
    updatedAt: row?.updatedAt ?? null,
    weeklyPayoutTarget: monthly > 0 ? monthly / 4 : 0,
  });
}

export async function PUT(req: Request) {
  const body = (await req.json().catch(() => null)) as null | { monthlyPayoutGoal?: unknown };
  const raw = body?.monthlyPayoutGoal;
  const monthlyPayoutGoal = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(monthlyPayoutGoal) || monthlyPayoutGoal < 0) {
    return NextResponse.json({ error: "monthlyPayoutGoal must be a non-negative number" }, { status: 400 });
  }

  const db = getDb();
  db.prepare(
    "UPDATE payout_config SET monthly_payout_goal = ?, updated_at = ? WHERE id = ?",
  ).run(monthlyPayoutGoal, new Date().toISOString(), CONFIG_ID);

  return NextResponse.json({
    monthlyPayoutGoal,
    weeklyPayoutTarget: monthlyPayoutGoal > 0 ? monthlyPayoutGoal / 4 : 0,
  });
}
