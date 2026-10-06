import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

const path = new URL("../.env.local", import.meta.url);
const existing = await readFile(path, "utf8").catch((cause) => {
  if (cause.code === "ENOENT") return "";
  throw cause;
});
if (/^AUTH_SECRET=.+/m.test(existing)) {
  console.log("AUTH_SECRET já existe; mantido sem alterações.");
} else {
  const secret = randomBytes(32).toString("base64url");
  const content = existing.replace(/^AUTH_SECRET=.*(?:\r?\n|$)/m, "");
  await writeFile(path, `${content}${content && !content.endsWith("\n") ? "\n" : ""}AUTH_SECRET=${secret}\n`, { mode: 0o600 });
  console.log("AUTH_SECRET criado em .env.local (ignorado pelo Git). O valor não foi exibido.");
}
