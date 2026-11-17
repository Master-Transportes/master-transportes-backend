import { describe, expect, it } from "bun:test";
import { validateAuthSecretPair } from "@/config/env";

const JWT = "jwt-secret-0123456789abcdef0123456789";
const REFRESH = "refresh-secret-0123456789abcdef0123456";

describe("validateAuthSecretPair", () => {
  it("aceita segredos longos e distintos", () => {
    expect(() => validateAuthSecretPair(JWT, REFRESH)).not.toThrow();
  });

  it("rejeita segredo curto", () => {
    expect(() => validateAuthSecretPair("curto", REFRESH)).toThrow(/JWT_SECRET/);
    expect(() => validateAuthSecretPair(JWT, "curto")).toThrow(/REFRESH_TOKEN_SECRET/);
  });

  it("rejeita segredos iguais sem expor os valores", () => {
    let message = "";
    try {
      validateAuthSecretPair(JWT, JWT);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toContain("devem ser diferentes");
    expect(message).not.toContain(JWT);
  });
});
