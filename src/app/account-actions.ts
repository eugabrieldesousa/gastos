"use server";

import { signIn, signOut } from "@/auth";
import { cloudConfigured } from "@/lib/cloud-config";

export async function loginWithGitHub() {
  if (!cloudConfigured()) throw new Error("O login ainda não foi configurado.");
  await signIn("github", { redirectTo: "/" });
}

export async function logout() {
  await signOut({ redirectTo: "/" });
}
