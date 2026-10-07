import { Buffer } from "node:buffer";
import { emptyFinanceData, financeSchema, parseFinanceData, type FinanceData } from "./finance";
import { CloudStoreError, type CloudStore } from "./cloud-store";
import { StorageConflictError } from "./repository";
import { financeSnapshotHash } from "./finance-snapshot";

type GitHubConfig = { repository: string; token: string; branch?: string };
type Snapshot = { data: FinanceData; sha?: string; endpoint: string; branch: string };
const unavailable = () => new CloudStoreError("Não foi possível acessar seu repositório de dados no GitHub. Confira a conexão, o token e as permissões do projeto.");

/** Private, owner-only Git storage. The server token never enters the session or client. */
export class GitHubFinanceStore implements CloudStore {
  constructor(
    private readonly configure: () => GitHubConfig = () => ({
      repository: process.env.GITHUB_DATA_REPOSITORY ?? "",
      token: process.env.GITHUB_DATA_TOKEN ?? "",
      branch: process.env.GITHUB_DATA_BRANCH,
    }),
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  private async request(path: string, config: GitHubConfig, init: RequestInit = {}, accept = "application/vnd.github+json") {
    if (!config.token) throw unavailable();
    let response: Response;
    try {
      response = await this.fetcher(`https://api.github.com${path}`, {
        ...init, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10_000),
        headers: {
          Accept: accept, Authorization: `Bearer ${config.token}`,
          "X-GitHub-Api-Version": "2026-03-10", "User-Agent": "mes-finance",
          ...(init.method === "PUT" ? { "Content-Type": "application/json" } : {}),
        },
      });
    } catch { throw unavailable(); }
    if (response.status === 429 || (response.status === 403 &&
      (response.headers.get("x-ratelimit-remaining") === "0" || response.headers.has("retry-after"))))
      throw new CloudStoreError("O GitHub atingiu o limite de solicitações. Aguarde alguns minutos e recarregue; a alteração não foi salva.");
    return response;
  }

  private async snapshot(userId: string, config: GitHubConfig): Promise<Snapshot> {
    if (!/^github:\d+$/.test(userId) || !/^[\w-]+\/[\w.-]+$/.test(config.repository)) throw unavailable();
    const repository = `/repos/${config.repository}`;
    const metadataResponse = await this.request(repository, config);
    if (!metadataResponse.ok) throw unavailable();
    const metadata = await metadataResponse.json();
    if (metadata.private !== true)
      throw new CloudStoreError("Seu repositório de dados precisa ser privado. Nenhum dado financeiro foi gravado.");
    if (metadata.owner?.type !== "User" || `github:${metadata.owner.id}` !== userId)
      throw new CloudStoreError("Este sistema é pessoal. Entre com a conta GitHub proprietária do repositório de dados.", 403);
    const branch = config.branch || metadata.default_branch;
    if (typeof branch !== "string" || !branch) throw unavailable();
    // Resolve a real branch first: a missing branch must never be mistaken for empty data.
    const refResponse = await this.request(`${repository}/git/ref/heads/${encodeURIComponent(branch)}`, config);
    if (!refResponse.ok) throw unavailable();
    const ref = await refResponse.json();
    if (ref.object?.type !== "commit" || !/^[a-f0-9]{40,64}$/.test(ref.object.sha)) throw unavailable();
    const endpoint = `${repository}/contents/data/${userId.slice(7)}/finance.json`;
    // Pin both metadata and raw content to the same commit, including files over 1 MB.
    const readEndpoint = `${endpoint}?ref=${ref.object.sha}`;
    const response = await this.request(readEndpoint, config, {}, "application/vnd.github.object+json");
    if (response.status === 404) return { data: emptyFinanceData(), endpoint, branch };
    if (!response.ok) throw unavailable();
    const file = await response.json();
    if (file.type !== "file" || !/^[a-f0-9]{40,64}$/.test(file.sha)) throw unavailable();
    let raw: string;
    if (file.encoding === "base64" && typeof file.content === "string") {
      raw = Buffer.from(file.content, "base64").toString("utf8");
    } else if (file.encoding === "none") {
      const rawResponse = await this.request(readEndpoint, config, {}, "application/vnd.github.raw+json");
      if (!rawResponse.ok) throw unavailable();
      raw = await rawResponse.text();
    } else { throw unavailable(); }
    try {
      return { data: parseFinanceData(JSON.parse(raw)), sha: file.sha, endpoint, branch };
    } catch {
      throw new CloudStoreError("O arquivo de dados do GitHub está inválido e foi preservado. Recupere uma versão válida no histórico do repositório e recarregue.");
    }
  }

  async read(userId: string) {
    return (await this.snapshot(userId, this.configure())).data;
  }

  async write(userId: string, data: FinanceData, expectedRevision: number, expectedSnapshotHash: string) {
    const config = this.configure();
    const previous = await this.snapshot(userId, config);
    if (previous.data.revision !== expectedRevision || await financeSnapshotHash(previous.data) !== expectedSnapshotHash)
      throw new StorageConflictError();
    const next = financeSchema.parse({ ...data, revision: expectedRevision + 1 });
    const response = await this.request(previous.endpoint, config, {
      method: "PUT",
      body: JSON.stringify({
        message: `mês.: salvar dados financeiros (revisão ${next.revision})`,
        content: Buffer.from(JSON.stringify(next, null, 2) + "\n", "utf8").toString("base64"),
        branch: previous.branch, ...(previous.sha ? { sha: previous.sha } : {}),
      }),
    });
    if (response.status === 409) throw new StorageConflictError();
    if (response.status === 422 && !previous.sha) {
      // GitHub also returns 422 when two devices try to create the first file.
      const latest = await this.snapshot(userId, config);
      if (latest.sha) throw new StorageConflictError();
    }
    if (!response.ok) throw unavailable();
    const confirmation = await response.json();
    if (!confirmation.commit?.sha || !confirmation.content?.sha) throw unavailable();
    return next;
  }
}
