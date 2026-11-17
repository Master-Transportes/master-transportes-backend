/**
 * Classificação explícita de acesso por endpoint.
 *
 * A chave é `<serviço>.<export do endpoint>`; o valor define a política exigida.
 * Este mapa é validado contra as definições reais em `src/api/**` pelo teste
 * `src/auth/__tests__/endpoint-policy.spec.ts`.
 *
 * Ao criar um endpoint, adicione a classificação aqui. Sem isso o teste falha —
 * nenhuma rota autenticada pode ficar sem política por esquecimento.
 */
export type EndpointPolicy = "public" | "authenticated" | "client" | "driver";

export const ENDPOINT_POLICIES = {
  "client.register": "public",
  "client.login": "public",
  "client.refresh": "public",
  "client.logout": "authenticated",
  "client.me": "client",
  "client.applyDriver": "client",
  "driver.register": "public",
  "driver.login": "public",
  "driver.refresh": "public",
  "driver.logout": "authenticated",
  "driver.me": "driver",
} as const satisfies Record<string, EndpointPolicy>;
