# 📚 Documentação — Master Transporte B

Biblioteca de conhecimento técnico do projeto. Cada tema tem sua própria pasta, com
visão geral, exemplos completos e referências.

> **Nota de contexto:** este repositório usa **Drizzle ORM** (não `SQLDatabase` nativo do Encore)
> e a camada **API → Service → Repository**. Exemplos que usam `db.queryRow` do Encore devem ser
> adaptados aos repositories Drizzle em `src/repositories/`.

## Índice

| Pasta | Conteúdo |
|---|---|
| [`streaming/`](./streaming/README.md) | Comunicação em tempo real (WebSockets): `streamIn`, `streamOut`, `streamInOut`, mensagens entre usuários, Redis, Pub/Sub, reconexão e confiabilidade |

## Convenções dos documentos

- Cada pasta tem um `README.md` com visão geral e navegação.
- Exemplos de código são completos e copiáveis, mas **adaptáveis** — nunca copiar/colar sem
  revisar contra as convenções do projeto (ver `AGENTS.md`).
- Conteúdo em português; termos técnicos mantidos em inglês quando são o nome oficial
  (`handshake`, `expose`, `deliveryGuarantee`, etc.).
