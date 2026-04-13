import { NextRequest, NextResponse } from "next/server";
import { db } from "../../lib/db";

// POST /api/worker — register a worker via company invite code
export async function POST(request: NextRequest) {
  const body = await request.json() as { name?: string; invite_code?: string; device_id?: string };

  if (!body.name?.trim()) return NextResponse.json({ error: "Prénom requis" }, { status: 400 });
  if (!body.invite_code?.trim()) return NextResponse.json({ error: "Code entreprise requis" }, { status: 400 });

  const company = await db.company.findUnique({ where: { invite_code: body.invite_code.trim() } });
  if (!company) return NextResponse.json({ error: "Code entreprise invalide. Vérifiez auprès de votre patron." }, { status: 404 });

  const device_id = body.device_id ?? (Date.now().toString(36) + Math.random().toString(36).slice(2, 10));

  const worker = await db.worker.create({
    data: {
      device_id,
      name: body.name.trim(),
      company_id: company.id,
    },
  });

  return NextResponse.json({
    device_id: worker.device_id,
    name: worker.name,
    company_id: company.id,
    company_name: company.name,
    invite_code: company.invite_code,
  }, { status: 201 });
}
