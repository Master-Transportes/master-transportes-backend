# 🚀 Deployment — estratégias de implantação

Índice das estratégias de implantação do backend Master Transporte.

## Situação atual

O modelo definitivo de deploy **ainda não foi decidido**. A pasta está organizada para
receber os modelos conforme eles forem avaliados:

| Pasta | Estratégia | Status |
|---|---|---|
| [`self-host/`](./self-host/) | Self-hosting (imagem Docker em infraestrutura própria) | Documentado — `nsqd` já existe no Compose local; `infra-config.json` de produção ainda não ativado |
| `encore-platform.md` (futuro) | Encore Platform (AWS/GCP gerenciado) | Não documentado — criar quando o modelo for avaliado |

## Conteúdo atual

- [`self-host/encore-self-host-configure-infra.md`](./self-host/encore-self-host-configure-infra.md)
  — guia completo de configuração de infraestrutura self-hosted.
- [`self-host/infra-config-minimal.example.json`](./self-host/infra-config-minimal.example.json)
  — exemplo mínimo compatível com o estágio atual do projeto.
- [`self-host/infra-config-nsq.example.json`](./self-host/infra-config-nsq.example.json)
  — exemplo com Pub/Sub via NSQ.

## ⚠️ Os JSONs são exemplos

Os arquivos `*.example.json` têm sintaxe válida, mas **não são configuração de
produção ativada**. Antes de qualquer uso real:

- Não ativar configurações automaticamente.
- Não presumir que os Topics/Subscriptions do exemplo NSQ já existem no projeto.
- Validar nomes de recursos e o schema oficial
  (https://encore.dev/schemas/infra.schema.json) com a versão efetiva do Encore CLI.

## Distinções fundamentais

Três pontos que evitam os erros mais comuns de configuração:

1. **`infra-config.json` não substitui o Docker Compose.** Ele informa ao Encore como
   acessar os recursos; o Compose/Kubernetes executa os contêineres e serviços.
2. **O PostgreSQL externo (Drizzle + `DATABASE_URL`) não é declarado em `sql_servers`**
   enquanto continuar sendo acessado diretamente pelo driver `postgres.js`, sem
   `SQLDatabase` do Encore.
3. **O Pub/Sub nativo precisa de um provider compatível** (NSQ, AWS SNS/SQS ou GCP
   Pub/Sub). O Redis existente não assume automaticamente essa função.
