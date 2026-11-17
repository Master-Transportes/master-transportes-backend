# Padrões obrigatórios para novas APIs

> **Este é o arquivo referenciado pelo `AGENTS.md`.** Toda API nova (passageiro,
> motorista, corrida, administração, suporte) deve respeitar as regras abaixo.
> Arquivos irmãos detalham cada tema: endpoints, validação, auth, serviços e erros.

A arquitetura existente **API → Service → Repository → Drizzle → PostgreSQL** está
adequada e **não deve ser substituída**. O que muda é a disciplina em cada nova API.

## As 10 regras

### 1. Endpoints pequenos
A API recebe os dados, identifica o usuário, valida o contrato e chama o service.
Sem regras de negócio no handler, sem acesso direto a repositórios do endpoint.

```ts
// Padrão (src/api/client/client.ts)
export const me = api<void, ClientMeResponse>(
  { expose: true, method: "GET", path: "/client/me", auth: true, sensitive: true, tags: ["client-role"] },
  async () => {
    const { userID } = auth.getAuthData()!;
    return clientService.getMe(userID);
  },
);
```

### 2. Contratos explícitos
Interfaces próprias de request e response em `src/dto/`, nunca expor linhas do
Drizzle nem entidades internas em contratos públicos.

### 3. Configuração explícita
Sempre declarar `expose`, `method`, `path` e `auth`, mesmo quando há valor padrão.
`sensitive: true` em endpoints com dados de sessão, credenciais ou dados pessoais.

### 4. Autorização em duas etapas
- **Papel** no middleware por tag (`client-role`, `driver-role`) — lembrando que
  `target.tags` usa OR e que `logout` fica deliberadamente sem tag;
- **Permissão sobre o recurso** no service (ex.: dono da corrida).

O papel ADMIN não autoriza automaticamente qualquer ação sobre qualquer recurso.
`passengerId`/`driverId` vêm de `auth.getAuthData()`, nunca do payload.

### 5. Validação sem duplicação
Encore cuida da estrutura HTTP; Zod cuida de regras e transformações (via
`validateOrThrow`); PostgreSQL cuida de unicidade e integridade. A mesma regra
não se repete em três camadas. Ver [`validacao.md`](./validacao.md).

### 6. Datas padronizadas
Instantes em **ISO 8601 UTC**; datas civis em **`YYYY-MM-DD`**. Contrato completo
em `docs/temporal/`.

### 7. Erros consistentes
`APIError` + `details.reason` de `src/constants/error-reasons.ts`; mensagens em
português; nunca expor SQL, segredos ou dados internos. Ver [`erros.md`](./erros.md).

### 8. Serviços internos tipados
`~encore/clients` para chamadas reais entre serviços Encore; chamada TypeScript
direta dentro do mesmo domínio. Não transformar chamada entre classes em API.
Ver [`comunicacao-entre-servicos.md`](./comunicacao-entre-servicos.md).

### 9. `api.raw()` só como exceção
Reservado a webhooks e formatos especiais. Endpoints de negócio usam `api()`.

### 10. Testes por comportamento
Cobertura mínima por endpoint: autenticação, autorização (papel e recurso),
entrada inválida, sucesso, falhas de domínio e concorrência. Testes de integração
que alteram dados usam ambiente apropriado.

## Pontos de atenção abertos

- **Auditoria Encore × Zod:** mapear validações repetidas nas duas fronteiras e
  simplificar os endpoints novos sem perder segurança (registrado em
  [`validacao.md`](./validacao.md));
- **Política central de endpoints:** o teste de política de endpoints continua
  sendo a autoridade sobre quais rotas existem, quais tags carregam e o que está
  exposto — toda API nova deve atualizá-lo junto com os testes.
