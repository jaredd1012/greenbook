import { NextResponse } from "next/server";

import { getDb } from "@/server/db";

type AccountRow = {
  created_at: string;
  id: number;
  name: string;
};

export async function GET() {
  const db = getDb();
  const rows = db
    .prepare(
      [
        "SELECT",
        "  id,",
        "  name,",
        "  created_at",
        "FROM accounts",
        "ORDER BY name ASC, id ASC",
      ].join("\n"),
    )
    .all() as AccountRow[];

  return NextResponse.json({
    accounts: rows.map((r) => ({
      createdAt: r.created_at,
      id: r.id,
      name: r.name,
    })),
  });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as null | { name?: unknown };
  const name = typeof body?.name === "string" ? body.name.trim() : "";

  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });

  const db = getDb();

  try {
    const info = db
      .prepare("INSERT INTO accounts (created_at, name) VALUES (?, ?)")
      .run(new Date().toISOString(), name);

    return NextResponse.json({ accountId: Number(info.lastInsertRowid), created: true, name });
  } catch {
    const existing = db.prepare("SELECT id FROM accounts WHERE name = ?").get(name) as undefined | { id: number };
    return NextResponse.json({ accountId: existing?.id, created: false, name });
  }
}

