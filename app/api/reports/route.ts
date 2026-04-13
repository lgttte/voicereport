import { NextRequest, NextResponse } from "next/server";
import { db } from "../../lib/db";

// GET /api/reports?company_id=XXX — list reports for a company
export async function GET(request: NextRequest) {
  const company_id = request.nextUrl.searchParams.get("company_id");
  if (!company_id) return NextResponse.json({ error: "company_id requis" }, { status: 400 });

  const reports = await db.report.findMany({
    where: { company_id },
    include: { worker: { select: { name: true, device_id: true } } },
    orderBy: { date: "desc" },
    take: 100,
  });

  return NextResponse.json(reports);
}

// POST /api/reports — save a report linked to a worker
export async function POST(request: NextRequest) {
  const body = await request.json() as {
    worker_device_id?: string;
    data?: string;
    score?: number;
    chantier?: string;
  };

  if (!body.worker_device_id) return NextResponse.json({ error: "worker_device_id requis" }, { status: 400 });
  if (!body.data) return NextResponse.json({ error: "data requis" }, { status: 400 });

  const worker = await db.worker.findUnique({ where: { device_id: body.worker_device_id } });
  if (!worker) return NextResponse.json({ error: "Worker introuvable" }, { status: 404 });

  const score = body.score ?? null;
  let status: string | null = null;
  if (score !== null) {
    if (score >= 7) status = "green";
    else if (score >= 4) status = "orange";
    else status = "red";
  }

  const report = await db.report.create({
    data: {
      company_id: worker.company_id,
      worker_id: worker.device_id,
      data: body.data,
      score: score !== null ? Math.round(score) : null,
      status,
      chantier: body.chantier ?? null,
    },
  });

  return NextResponse.json({ id: report.id }, { status: 201 });
}
