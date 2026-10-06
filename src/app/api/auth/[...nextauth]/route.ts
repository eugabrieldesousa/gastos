import { handlers } from "@/auth";
import { cloudConfigured } from "@/lib/cloud-config";
import type { NextRequest } from "next/server";

function unavailable() {
  return Response.json({ error: "O login ainda não foi configurado." }, { status: 503 });
}

export const GET = (request: NextRequest) => cloudConfigured() ? handlers.GET(request) : unavailable();
export const POST = (request: NextRequest) => cloudConfigured() ? handlers.POST(request) : unavailable();
