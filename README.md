# Master Transporte — Backend

Backend do **Master Transporte**, desenvolvido com **Encore.ts** e **TypeScript**, com persistência em **PostgreSQL**, acesso a dados via **Drizzle ORM** e validação com **Zod**.

O projeto reúne as APIs e regras de negócio da plataforma. Entre as funcionalidades existentes estão identidade, autenticação, sessões e autorização de clientes e motoristas. Para conhecer os módulos e endpoints disponíveis, consulte o código e o painel local do Encore.

## Começando

### Pré-requisitos

- [Node.js](https://nodejs.org/) e npm
- [Docker](https://docs.docker.com/get-docker/) com Docker Compose
- [Encore CLI](https://encore.dev/docs/ts/install)
- [Bun](https://bun.sh/) para executar os testes

### Configuração e execução

1. Instale as dependências:

   ```bash
   npm install
   ```

2. Copie `.env.example` para `.env` e configure o ambiente local. As principais variáveis são:

   | Variável | Finalidade |
   | --- | --- |
   | `DATABASE_URL` | Conexão com o PostgreSQL |
   | `JWT_SECRET` | Assinatura dos access tokens |
   | `REFRESH_TOKEN_SECRET` | Proteção dos refresh tokens |

   Consulte `.env.example` para as demais opções, inclusive configurações do Docker e do Redis. Gere segredos fortes e distintos; não versione o `.env`.

3. Inicie o ambiente:

   ```bash
   npm run dev
   ```

   Conforme a configuração atual dos scripts, esse comando inicia a infraestrutura local, aplica as migrations pendentes e executa o Encore.

Por padrão, a API local fica em `http://localhost:4000` e o painel de desenvolvimento do Encore em `http://localhost:9400` (os endereços podem variar conforme a configuração).

### Infraestrutura local

O `docker-compose.yml` sobe PostgreSQL, Redis e um `nsqd` (NSQ) na rede privada do
Compose. O NSQ está preparado para builds self-hosted e **não** é usado pelo
`encore run`, que executa o broker local do próprio Encore. Detalhes e comandos de
validação em [`docs/pubsub/infra-e-limites.md`](./docs/pubsub/infra-e-limites.md).

## Comandos úteis

| Comando | Ação |
| --- | --- |
| `npm run dev` | Inicia o ambiente de desenvolvimento |
| `npm start` | Inicia o Encore sem preparar a infraestrutura |
| `npm test` | Executa os testes no contexto do Encore |
| `npm run lint` | Verifica o código com ESLint |
| `npm run lint:fix` | Corrige automaticamente problemas de lint |
| `npm run format` | Formata o código com Prettier |
| `npm run format:check` | Verifica a formatação |
| `npx tsc --noEmit` | Executa a checagem de tipos |
| `npm run db:generate` | Gera uma migration do Drizzle |
| `npm run db:migrate` | Aplica migrations pendentes |
| `npm run db:studio` | Abre o Drizzle Studio |

O arquivo `package.json` é a referência para os scripts efetivamente disponíveis.

### Testes de integração

Os testes que dependem de PostgreSQL exigem `TEST_DATABASE_URL` apontando para **um banco de teste isolado, migrado e descartável**. Sem essa variável, os testes de integração configurados para isso são ignorados.

Use `npm test` em vez de executar `bun test` diretamente: na configuração descrita, o runtime do Encore é necessário para os testes.

## API e autenticação

Os contratos e endpoints são definidos no próprio código. Utilize o painel local do Encore para explorar as APIs em vez de manter uma lista duplicada neste README.

Endpoints autenticados utilizam `Authorization: Bearer <accessToken>`. A identidade e as permissões são verificadas pelo backend; não devem ser confiadas aos campos enviados pelo cliente.

## Banco de dados

O acesso aos dados é feito com Drizzle ORM. As mudanças de schema são versionadas por migrations, geradas e aplicadas pelos comandos `db:generate` e `db:migrate`.

Neste projeto, **as migrations do Drizzle não são aplicadas automaticamente pelo Encore**. Verifique o estado do banco antes de executar o backend fora do fluxo `npm run dev`.

## Documentação

- [`docs/README.md`](./docs/README.md) — índice da documentação técnica.
- [`docs/streaming/`](./docs/streaming/) — streaming, WebSockets, distribuição e confiabilidade.
- [`AGENTS.md`](./AGENTS.md) — instruções de trabalho para agentes de programação.

**Onde procurar a informação correta:** dependências e scripts em `package.json`; configurações em `.env.example`; endpoints e regras no código e nos testes; decisões e explicações detalhadas em `docs/`.
