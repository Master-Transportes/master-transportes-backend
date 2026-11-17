import { describe, expect, it } from "bun:test";
import { redactRedisUrl } from "@/infra/cache/redis-url";

describe("redactRedisUrl", () => {
  it("remove usuário e senha da URL", () => {
    const redacted = redactRedisUrl("redis://usuario:senha-secreta@127.0.0.1:6379/0");

    expect(redacted).not.toContain("senha-secreta");
    expect(redacted).not.toContain("usuario");
    expect(redacted).toContain("127.0.0.1:6379");
  });

  it("remove senha em query string", () => {
    const redacted = redactRedisUrl("redis://127.0.0.1:6379?password=segredo&auth=outro");

    expect(redacted).not.toContain("segredo");
    expect(redacted).not.toContain("outro");
    expect(redacted).toContain("password=***");
  });

  it("não quebra com URL inválida", () => {
    expect(redactRedisUrl("nao-e-url")).toBe("[redis-url]");
  });
});
