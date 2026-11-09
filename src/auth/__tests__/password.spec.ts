import { beforeAll, describe, expect, it } from "bun:test";
import { comparePassword, hashPassword } from "@/auth/password";

const PASSWORD = "Str0ng#Passw0rd";
let storedHash = "";

beforeAll(async () => {
  storedHash = await hashPassword(PASSWORD);
});

describe("password", () => {
  it("gera hash bcrypt que nunca é a senha em texto puro", async () => {
    expect(storedHash).not.toBe(PASSWORD);
    expect(storedHash.startsWith("$2")).toBe(true);
    expect(storedHash.length).toBeGreaterThan(50);
  });

  it("confirma senha correta e rejeita senha incorreta", async () => {
    await expect(comparePassword(PASSWORD, storedHash)).resolves.toBe(true);
    await expect(comparePassword("senha-errada", storedHash)).resolves.toBe(false);
  });

  it("rejeita senhas acima de 72 bytes (limite efetivo do bcrypt)", async () => {
    await expect(hashPassword("a".repeat(73))).rejects.toThrow();
  });

  it("aceita exatamente 72 bytes", async () => {
    const hash = await hashPassword("a".repeat(72));
    await expect(comparePassword("a".repeat(72), hash)).resolves.toBe(true);
  });

  it("não quebra quando o hash armazenado é inválido (trata como não correspondência)", async () => {
    await expect(comparePassword(PASSWORD, "hash-invalido")).resolves.toBe(false);
  });
});
