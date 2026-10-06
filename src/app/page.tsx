import { Dashboard } from "@/components/dashboard";
import { auth } from "@/auth";
import { cloudConfigured } from "@/lib/cloud-config";

export const dynamic = "force-dynamic";

export default async function Home() {
  const cloudEnabled = cloudConfigured();
  const session = cloudEnabled ? await auth() : null;
  const account = session?.user?.id ? { id: session.user.id, name: session.user.name ?? "Sua conta" } : undefined;
  return <Dashboard key={account?.id ?? "local"} account={account} cloudEnabled={cloudEnabled} />;
}
