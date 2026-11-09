/**
 * Regras puras de normalização e validação de identidade.
 * Sem dependência de HTTP, Drizzle ou Encore — testável isoladamente.
 */

export function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function normalizeFullName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function normalizeCpf(value: string): string {
  return onlyDigits(value);
}

export function normalizePhone(value: string): string {
  const digits = onlyDigits(value);

  // Aceita o formato internacional brasileiro (+55 ...): remove o código do país.
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) {
    return digits.slice(2);
  }

  return digits;
}

/**
 * Valida CPF pelos dígitos verificadores (módulo 11).
 * Rejeita também sequências repetidas (ex.: 11111111111).
 */
export function isValidCpf(value: string): boolean {
  const digits = onlyDigits(value);
  if (digits.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(digits)) return false;

  const checkDigit = (sliceLength: number): number => {
    let sum = 0;
    for (let index = 0; index < sliceLength; index += 1) {
      sum += Number(digits[index]) * (sliceLength + 1 - index);
    }
    const remainder = (sum * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };

  return checkDigit(9) === Number(digits[9]) && checkDigit(10) === Number(digits[10]);
}

/**
 * Valida telefone brasileiro já normalizado (somente dígitos):
 * 10 dígitos (fixo) ou 11 dígitos (celular iniciando em 9), com DDD válido.
 */
export function isValidBrazilianPhone(value: string): boolean {
  const digits = normalizePhone(value);
  if (digits.length !== 10 && digits.length !== 11) return false;

  const areaCode = Number(digits.slice(0, 2));
  if (areaCode < 11 || areaCode > 99) return false;

  if (digits.length === 11 && digits[2] !== "9") return false;

  return true;
}
