import { auth } from "@/auth";
import { cloudConfigured } from "@/lib/cloud-config";
import { GitHubFinanceStore } from "@/lib/github-store";
import { financeApi } from "@/lib/finance-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const handle = financeApi(new GitHubFinanceStore(), async () => {
  if (!cloudConfigured()) return null;
  const session = await auth();
  return session?.user?.id ?? null;
});

export const GET = handle;
export const PUT = handle;
