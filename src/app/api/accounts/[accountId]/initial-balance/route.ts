import { NextResponse } from "next/server";

import { getDb } from "@/server/db";

function parseAccountId(param: string) {
  const id = Number(param);
  if (!Number.isInteger(id) || id <= 0) return null;
  return id;
}

export async function POST(req: Request, context: { params: Promise<{ accountId: string }> }) {
  const { accountId } = await context.params;
  const id = parseAccountId(accountId);
  if (!id) return NextResponse.json({ error: "invalid accountId" }, { status: 400 });

  const body = (await req.json().catch(() => null)) as null | { amount?: unknown; note?: unknown };
  const amount = typeof body?.amount === "number" ? body.amount : Number(body?.amount);
  const note = typeof body?.note === "string" ? body.note.trim() : null;

  if (!Number.isFinite(amount)) return NextResponse.json({ error: "amount is required" }, { status: 400 });

  const db = getDb();
  const exists = db.prepare("SELECT 1 FROM accounts WHERE id = ?").get(id) as undefined | { 1: 1 };
  if (!exists) return NextResponse.json({ error: "account not found" }, { status: 404 });

  db.transaction(() => {
    db.prepare("DELETE FROM account_ledger WHERE account_id = ? AND type = 'INITIAL'").run(id);
    db.prepare("INSERT INTO account_ledger (account_id, amount, created_at, note, type) VALUES (?, ?, ?, ?, ?)")
      .run(id, amount, new Date().toISOString(), note, "INITIAL");
  })();

  return NextResponse.json({ ok: true });
}

