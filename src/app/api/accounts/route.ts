import { getDb } from "@/server/db";
import type { Database } from "better-sqlite3";
import { NextResponse } from "next/server";

type AccountRow = {
  created_at: string;
  id: number;
  name: string;
};

function isSqliteUniqueConstraintError(e: unknown) {
  if (e && typeof e === "object" && "code" in e) {
    const code = (e as { code: unknown }).code;
    if (code === "SQLITE_CONSTRAINT_UNIQUE") {
      return true;
    }
    if (typeof code === "string" && code.startsWith("SQLITE_CONSTRAINT")) {
      return true;
    }
  }
  return e instanceof Error && e.message.includes("UNIQUE");
}

export async function GET() {
  try {
    return getAccountsResponse();
  } catch (e) {
    console.error("GET /api/accounts", e);
    return NextResponse.json(
      { error: "Failed to list accounts" },
      { status: 500 },
    );
  }
}

function getAccountsResponse() {
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

  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  let db: Database;
  try {
    db = getDb();
  } catch (e) {
    console.error("POST /api/accounts (getDb)", e);
    return NextResponse.json({ error: "Database unavailable" }, { status: 500 });
  }

  try {
    const info = db
      .prepare("INSERT INTO accounts (created_at, name) VALUES (?, ?)")
      .run(new Date().toISOString(), name);

    return NextResponse.json({ accountId: Number(info.lastInsertRowid), created: true, name });
  } catch (e) {
    if (isSqliteUniqueConstraintError(e)) {
      const existing = db.prepare("SELECT id FROM accounts WHERE name = ?").get(name) as
        | undefined
        | { id: number };
      return NextResponse.json({ accountId: existing?.id, created: false, name });
    }
    console.error("POST /api/accounts (insert)", e);
    return NextResponse.json({ error: "Failed to create account" }, { status: 500 });
  }
}

