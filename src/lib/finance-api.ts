import { z } from "zod";
import { financeSchema } from "./finance";
import { CloudStoreError, type CloudStore } from "./cloud-store";
import { StorageConflictError } from "./repository";

const MAX_BYTES = 4 * 1024 * 1024;
const writeSchema = z.object({
  data: financeSchema,
  expectedRevision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER - 1),
  expectedSnapshotHash: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };

/** Identity comes exclusively from the verified session, never the request body. */
export function financeApi(store: CloudStore, identify: () => Promise<string | null>) {
  return async (request: Request): Promise<Response> => {
    const reply = (body: unknown, status = 200) => Response.json(body, { status, headers });
    const userId = await identify();
    if (!userId) return reply({ error: "Sua sessão expirou. Entre novamente com o GitHub." }, 401);
    try {
      if (request.method === "GET") return reply(await store.read(userId));
      if (request.method !== "PUT") return reply({ error: "Método não permitido." }, 405);
      if (request.headers.get("origin") !== new URL(request.url).origin)
        return reply({ error: "Origem da solicitação inválida." }, 403);
      if (!request.headers.get("content-type")?.startsWith("application/json"))
        return reply({ error: "Envie os dados em JSON." }, 415);
      if (Number(request.headers.get("content-length")) > MAX_BYTES)
        return reply({ error: "Os dados excedem o limite de 4 MB para sincronização." }, 413);
      const raw = await request.text();
      if (new TextEncoder().encode(raw).length > MAX_BYTES)
        return reply({ error: "Os dados excedem o limite de 4 MB para sincronização." }, 413);
      let parsed: unknown;
      try { parsed = JSON.parse(raw); } catch { return reply({ error: "JSON inválido." }, 400); }
      const result = writeSchema.safeParse(parsed);
      if (!result.success) return reply({ error: "Os dados enviados são inválidos." }, 400);
      const { data, expectedRevision, expectedSnapshotHash } = result.data;
      if (data.revision !== expectedRevision)
        return reply({ error: "A revisão dos dados é inválida." }, 400);
      return reply(await store.write(userId, data, expectedRevision, expectedSnapshotHash));
    } catch (cause) {
      if (cause instanceof StorageConflictError) return reply({ error: cause.message }, 409);
      if (cause instanceof CloudStoreError) return reply({ error: cause.message }, cause.status);
      // Do not expose upstream errors, URLs, or access tokens.
      return reply({ error: "Não foi possível acessar os dados da sua conta. Tente recarregar." }, 503);
    }
  };
}
