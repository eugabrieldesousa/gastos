import { auth } from "@/auth";
import { cloudConfigured } from "@/lib/cloud-config";
import { NeonFinanceStore } from "@/lib/cloud-store";
import { financeApi } from "@/lib/finance-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const handle = financeApi(new NeonFinanceStore(), async () => {
  if (!cloudConfigured()) return null;
  const session = await auth();
  return session?.user?.id ?? null;
});

export const GET = handle;
export const PUT = handle;
