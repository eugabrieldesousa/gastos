/** Server-only configuration. Never expose credentials to client components. */
export function cloudConfigured() {
  return Boolean(
    process.env.AUTH_SECRET && process.env.AUTH_GITHUB_ID &&
    process.env.AUTH_GITHUB_SECRET && process.env.DATABASE_URL,
  );
}
