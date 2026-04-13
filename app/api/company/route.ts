import { NextRequest, NextResponse } from "next/server";
import { db } from "../../lib/db";

// GET /api/company?code=1234 — lookup by invite code
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  if (!code) return NextResponse.json({ error: "Code requis" }, { status: 400 });

  const company = await db.company.findUnique({ where: { invite_code: code } });
  if (!company) return NextResponse.json({ error: "Code entreprise invalide" }, { status: 404 });

  return NextResponse.json({ id: company.id, name: company.name, invite_code: company.invite_code });
}

// POST /api/company — create a new company
export async function POST(request: NextRequest) {
  const body = await request.json() as { name?: string };
  if (!body.name?.trim()) return NextResponse.json({ error: "Nom requis" }, { status: 400 });

  // Generate unique 4-digit invite code
  let invite_code = "";
  let attempts = 0;
  while (attempts < 20) {
    invite_code = String(Math.floor(1000 + Math.random() * 9000));
    const existing = await db.company.findUnique({ where: { invite_code } });
    if (!existing) break;
    attempts++;
  }
  if (!invite_code) return NextResponse.json({ error: "Impossible de générer un code unique" }, { status: 500 });

  const company = await db.company.create({
    data: { name: body.name.trim(), invite_code },
  });

  return NextResponse.json({ id: company.id, name: company.name, invite_code: company.invite_code }, { status: 201 });
}
