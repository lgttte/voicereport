import { NextRequest, NextResponse } from "next/server";
import { db } from "../../lib/db";

// GET /api/company?code=1234 — lookup by invite code
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  if (!code) return NextResponse.json({ error: "Code requis" }, { status: 400 });

  try {
    const company = await db.company.findUnique({ where: { invite_code: code } });
    if (!company) return NextResponse.json({ error: "Code entreprise invalide" }, { status: 404 });
    return NextResponse.json({ id: company.id, name: company.name, invite_code: company.invite_code });
  } catch (err) {
    console.error("[GET /api/company] Erreur DB:", err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Erreur base de données : ${message}` }, { status: 500 });
  }
}

// POST /api/company — create a new company
export async function POST(request: NextRequest) {
  let body: { name?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps de requête JSON invalide" }, { status: 400 });
  }

  if (!body.name?.trim()) {
    return NextResponse.json({ error: "Nom requis" }, { status: 400 });
  }

  try {
    // Generate unique 4-digit invite code
    let invite_code = "";
    for (let attempts = 0; attempts < 20; attempts++) {
      const candidate = String(Math.floor(1000 + Math.random() * 9000));
      const existing = await db.company.findUnique({ where: { invite_code: candidate } });
      if (!existing) { invite_code = candidate; break; }
    }

    if (!invite_code) {
      return NextResponse.json({ error: "Impossible de générer un code unique. Réessayez." }, { status: 500 });
    }

    console.log(`[POST /api/company] Création : "${body.name.trim()}" avec code ${invite_code}`);

    const company = await db.company.create({
      data: { name: body.name.trim(), invite_code },
    });

    console.log(`[POST /api/company] Succès — id: ${company.id}`);
    return NextResponse.json(
      { id: company.id, name: company.name, invite_code: company.invite_code },
      { status: 201 }
    );
  } catch (err) {
    console.error("[POST /api/company] Erreur DB:", err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Erreur base de données : ${message}` }, { status: 500 });
  }
}
