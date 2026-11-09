import { describe, expect, it } from "bun:test";
import {
  isValidBrazilianPhone,
  isValidCpf,
  normalizeCpf,
  normalizeEmail,
  normalizeFullName,
  normalizePhone,
} from "@/domain/identity/identity.utils";

describe("normalização", () => {
  it("normaliza e-mail com trim e minúsculas", () => {
    expect(normalizeEmail("  Maria@Example.COM ")).toBe("maria@example.com");
  });

  it("colapsa espaços do nome completo", () => {
    expect(normalizeFullName("  Maria   da   Silva ")).toBe("Maria da Silva");
  });

  it("remove máscara de CPF e telefone", () => {
    expect(normalizeCpf("529.982.247-25")).toBe("52998224725");
    expect(normalizePhone("(92) 99999-0000")).toBe("92999990000");
  });

  it("remove o código do país +55 do telefone", () => {
    expect(normalizePhone("+5592992414567")).toBe("92992414567");
    expect(normalizePhone("+55 (92) 99241-4567")).toBe("92992414567");
    expect(normalizePhone("+55 (92) 3322-4455")).toBe("9233224455");
  });
});

describe("isValidCpf", () => {
  it("aceita CPFs com dígitos verificadores válidos", () => {
    expect(isValidCpf("52998224725")).toBe(true);
    expect(isValidCpf("529.982.247-25")).toBe(true);
    expect(isValidCpf("11144477735")).toBe(true);
  });

  it("rejeita sequências repetidas", () => {
    expect(isValidCpf("11111111111")).toBe(false);
    expect(isValidCpf("00000000000")).toBe(false);
  });

  it("rejeita dígitos verificadores incorretos e tamanhos inválidos", () => {
    expect(isValidCpf("12345678900")).toBe(false);
    expect(isValidCpf("5299822472")).toBe(false);
    expect(isValidCpf("")).toBe(false);
  });
});

describe("isValidBrazilianPhone", () => {
  it("aceita fixo (10) e celular (11 iniciando em 9) com DDD válido", () => {
    expect(isValidBrazilianPhone("92999990000")).toBe(true);
    expect(isValidBrazilianPhone("9233334444")).toBe(true);
    expect(isValidBrazilianPhone("(92) 98888-7777")).toBe(true);
    expect(isValidBrazilianPhone("+5592992414567")).toBe(true);
  });

  it("rejeita DDD inválido, tamanho errado e celular fora do padrão", () => {
    expect(isValidBrazilianPhone("01999990000")).toBe(false);
    expect(isValidBrazilianPhone("929999900")).toBe(false);
    expect(isValidBrazilianPhone("92888887777")).toBe(false);
    expect(isValidBrazilianPhone("")).toBe(false);
  });
});
