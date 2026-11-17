import { describe, expect, it } from "bun:test";
import { passwordCreationSchema, passwordLoginSchema } from "@/validations/password.schema";

describe("passwordCreationSchema", () => {
  it("aceita senha com pelo menos 8 caracteres e até 72 bytes", () => {
    expect(passwordCreationSchema.safeParse("12345678").success).toBe(true);
    expect(passwordCreationSchema.safeParse("a".repeat(72)).success).toBe(true);
  });

  it("rejeita senha curta", () => {
    expect(passwordCreationSchema.safeParse("1234567").success).toBe(false);
  });

  it("rejeita mais de 72 bytes, inclusive multibyte", () => {
    expect(passwordCreationSchema.safeParse("a".repeat(73)).success).toBe(false);
    expect(passwordCreationSchema.safeParse("😀".repeat(19)).success).toBe(false);
  });
});

describe("passwordLoginSchema", () => {
  it("não impõe o mínimo de 8 caracteres do cadastro", () => {
    expect(passwordLoginSchema.safeParse("1").success).toBe(true);
  });

  it("aceita exatamente 72 bytes e rejeita acima", () => {
    expect(passwordLoginSchema.safeParse("a".repeat(72)).success).toBe(true);
    expect(passwordLoginSchema.safeParse("a".repeat(73)).success).toBe(false);
  });

  it("rejeita multibyte acima de 72 bytes", () => {
    // 18 emojis = 72 bytes; 19 = 76 bytes.
    expect(passwordLoginSchema.safeParse("😀".repeat(18)).success).toBe(true);
    expect(passwordLoginSchema.safeParse("😀".repeat(19)).success).toBe(false);
  });
});
