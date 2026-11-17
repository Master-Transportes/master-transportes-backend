# 📚 Documentação — Master Transporte B

Biblioteca de conhecimento técnico do projeto. Cada tema tem sua própria pasta, com
visão geral, exemplos completos e referências.

> **Nota de contexto:** este repositório usa **Drizzle ORM** (não `SQLDatabase` nativo do Encore)
> e a camada **API → Service → Repository**. Exemplos que usam `db.queryRow` do Encore devem ser
> adaptados aos repositories Drizzle em `src/repositories/`.

## Índice

| Pasta | Conteúdo |
|---|---|
| [`api/`](./api/README.md) | Padrões de API no Encore.ts: `api()`, validação (Encore × Zod), autenticação/autorização, comunicação entre serviços, erros e regras obrigatórias para novas APIs |
| [`streaming/`](./streaming/README.md) | Comunicação em tempo real (WebSockets): `streamIn`, `streamOut`, `streamInOut`, mensagens entre usuários, Redis, Pub/Sub, reconexão e confiabilidade |
| [`drizzle/`](./drizzle/README.md) | Persistência: Drizzle ORM + Kit, PostgreSQL 18, schema, relações, migrations, conexão, transações e diagnóstico no banco |
| [`temporal/`](./temporal/README.md) | Política de datas e horários: instantes × datas civis, contrato de API em UTC, filtros por dia local, autoridade dos timestamps e testes de regressão |
| [`pubsub/`](./pubsub/README.md) | Pub/Sub do Encore: topics e subscribers, garantias de entrega, idempotência, DLQ, Outbox, ordenação, providers e testes |
| [`deployment/`](./deployment/README.md) | Estratégias de implantação: self-hosting (infra config, build Docker, checklist de segurança); Encore Platform pendente de decisão |
| [`roadmap/`](./roadmap/README.md) | Roadmap de implementação do produto: etapas 0–8 (disponibilidade de motoristas, solicitações, ofertas transacionais, Redis GEO, despacho via Pub/Sub, streaming, ciclo da corrida, recuperação) e decisões arquiteturais |

## Convenções dos documentos

- Cada pasta tem um `README.md` com visão geral e navegação.
- Exemplos de código são completos e copiáveis, mas **adaptáveis** — nunca copiar/colar sem
  revisar contra as convenções do projeto (ver `AGENTS.md`).
- Conteúdo em português; termos técnicos mantidos em inglês quando são o nome oficial
  (`handshake`, `expose`, `deliveryGuarantee`, etc.).
