import { describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import { generateRefreshToken, hashRefreshToken, parseRefreshToken } from "@/auth/refresh-token";

process.env.JWT_SECRET = "test-jwt-secret-0123456789abcdef0123456789abcdef";
process.env.REFRESH_TOKEN_SECRET = "test-refresh-secret-0123456789abcdef0123456789";

describe("refresh-token", () => {
  it("gera token com sessionId, material aleatório e MAC verificável", () => {
    const sessionId = randomUUID();
    const token = generateRefreshToken(sessionId);

    expect(token.split(".")).toHaveLength(3);

    const parsed = parseRefreshToken(token);
    expect(parsed).not.toBeNull();
    expect(parsed?.sessionId).toBe(sessionId);
    expect(parsed?.signatureValid).toBe(true);
  });

  it("gera tokens diferentes para a mesma sessão", () => {
    const sessionId = randomUUID();

    const first = generateRefreshToken(sessionId);
    const second = generateRefreshToken(sessionId);

    expect(first).not.toBe(second);
  });

  it("detecta MAC inválido sem perder o sessionId declarado", () => {
    const sessionId = randomUUID();
    const forged = `${sessionId}.${"a".repeat(43)}.${"b".repeat(43)}`;

    const parsed = parseRefreshToken(forged);

    expect(parsed).not.toBeNull();
    expect(parsed?.sessionId).toBe(sessionId);
    expect(parsed?.signatureValid).toBe(false);
  });

  it("rejeita token estruturalmente inválido", () => {
    expect(parseRefreshToken("sem-formato")).toBeNull();
    expect(parseRefreshToken("nao-e-uuid.abc.def")).toBeNull();
    expect(parseRefreshToken(`${randomUUID()}.curto.curto`)).toBeNull();
  });

  it("hash SHA-256 tem 64 caracteres hexadecimais", () => {
    const hash = hashRefreshToken(generateRefreshToken(randomUUID()));

    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("hash é determinístico para o mesmo token e diferente para tokens distintos", () => {
    const sessionId = randomUUID();
    const token = generateRefreshToken(sessionId);

    expect(hashRefreshToken(token)).toBe(hashRefreshToken(token));
    expect(hashRefreshToken(token)).not.toBe(hashRefreshToken(generateRefreshToken(sessionId)));
  });
});
