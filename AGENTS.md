# AGENTS.md — Master Transporte B

## Finalidade

Este arquivo define **como agentes de código devem trabalhar neste repositório**.
Não é um inventário de pastas, endpoints, versões, módulos ou pendências: esses dados
mudam e devem ser descobertos na implementação vigente.

## Princípios

1. **Verifique antes de assumir.** Código, configuração, migrations e testes atuais são
   evidências da implementação. Documentação e histórico do Git podem estar desatualizados.
   Ao encontrar divergências relevantes, investigue e relate; não escolha uma versão às cegas.
2. **Trabalhe no escopo solicitado.** Não antecipe funcionalidades, restaure módulos antigos
   nem faça refatorações laterais sem necessidade demonstrável para a tarefa.
3. **Reutilize padrões reais.** Prefira a solução mais simples compatível com o domínio e
   o código existente. Evite camadas, interfaces, dependências, caches, índices ou constraints
   sem justificativa técnica concreta.
4. **Preserve comportamento e segurança.** Toda alteração deve considerar compatibilidade,
   autorização, integridade dos dados, concorrência e regressões.
5. **Não invente fatos sobre o projeto.** Se algo não puder ser verificado, deixe explícita
   a incerteza, em vez de apresentá-lo como implementado.

## Antes de implementar

- Identifique o objetivo, os critérios de aceitação e o menor conjunto de arquivos envolvidos.
- Localize os pontos de entrada e acompanhe o fluxo real até regras de negócio, persistência
  e testes. Faça buscas direcionadas; não varra todo o projeto sem motivo.
- Consulte as instruções locais aplicáveis, o `README.md`, o índice de `docs/` (se existir)
  e somente a documentação pertinente à tarefa.
- Confirme stack, versões, scripts, organização e recursos disponíveis nos arquivos atuais
  do repositório; não dependa de listas históricas.
- Para APIs ou comportamentos de bibliotecas que não conhece com segurança, confira a
  documentação oficial da versão efetivamente instalada.
- Antes de editar código, verifique os consumidores, contratos e testes potencialmente afetados.

## Implementação e arquitetura

- Respeite a separação de responsabilidades existente: transporte/API, autenticação,
  validação, regras de negócio e acesso a dados não devem ser misturados sem necessidade.
- Endpoints devem tratar contratos e delegar operações de domínio; consultas e mutações
  persistentes devem seguir a camada de acesso a dados adotada no projeto.
- Reaproveite os DTOs, validações, mappers, tipos e tratamento de erros existentes.
  Não exponha entidades internas ou detalhes de persistência em contratos públicos sem decisão explícita.
- Preserve os padrões atuais de nomes, formatação, injeção e organização; não imponha uma
  estrutura antiga se o repositório tiver evoluído.
- Mudanças públicas de API exigem análise dos consumidores e compatibilidade.
- Não instale dependências nem altere infraestrutura apenas por preferência pessoal.

## Padrões de API (Encore.ts) — obrigatórios

Toda API nova (passageiro, motorista, corrida, administração, suporte) deve seguir
o padrão detalhado em **`docs/api/padroes-do-projeto.md`** e nos demais arquivos de
`docs/api/` (endpoints, validação, autenticação, comunicação entre serviços e erros).
Resumo das regras transversais:

- **Endpoint pequeno:** a API recebe dados, identifica o usuário e chama o service.
  A validação/transformação Zod fica na entrada do service (`validateOrThrow`); o
  endpoint não repete o mesmo parse. Sem regras de negócio no handler nem acesso
  direto a repositories.
- **Contrato explícito:** interfaces próprias de request/response em `src/dto/`
  (nunca linhas do Drizzle) e declaração explícita de `expose`, `method`, `path` e `auth`.
- **Autorização em duas etapas:** papel via middleware por tag (`client-role`,
  `driver-role`) e permissão sobre o recurso no service. `passengerId`/`driverId`
  vêm de `auth.getAuthData()`, nunca do payload. `sensitive: true` onde houver
  credenciais, sessão ou dados pessoais. **Papel `DRIVER` não é aprovação
  operacional**: operações de transporte exigem `driver_profiles.status = APPROVED`
  e devem declarar `tags: ["driver-role", "driver-operational"]` no guard
  operacional; `/driver/me` e logout continuam acessíveis para regularização.
- **Validação sem duplicação:** Encore para estrutura HTTP, Zod (`validateOrThrow`)
  para regras e transformações, PostgreSQL para unicidade e integridade. A mesma
  regra não se repete em três camadas.
- **Erros:** `APIError` + `details.reason` estável de `src/constants/error-reasons.ts`;
  mensagens em português; nunca expor SQL, segredos ou dados internos.
- **Serviços internos tipados:** `~encore/clients` para fronteira real entre serviços
  Encore; chamada TypeScript direta no mesmo domínio. `api.raw()` só para webhooks
  e formatos especiais.
- **Datas:** instantes em ISO 8601 UTC; datas civis em `YYYY-MM-DD` (ver `docs/temporal/`).
- **Testes por endpoint:** autenticação, autorização (papel e recurso), entrada
  inválida, sucesso, falhas e concorrência — atualizando a política central de
  endpoints e seus testes quando uma rota é adicionada ou alterada.

## Autenticação, autorização e segurança

- Use a identidade autenticada e as políticas de acesso **reais** do projeto. Nunca confie
  em `userId`, papel, permissões ou estado operacional enviados pelo cliente como prova de autorização.
- Verifique autenticação e também autorização sobre o recurso e a operação envolvidos.
  Um papel válido não implica automaticamente autorização para qualquer ação de negócio.
- Ao adicionar ou alterar endpoints, atualize a classificação/política central de acesso
  e os testes correspondentes, se esse mecanismo existir na implementação vigente.
- Preserve a possibilidade de encerrar uma sessão válida após a perda de um papel,
  conforme o comportamento de segurança já adotado pelo projeto.
- Não registre ou exponha tokens, senhas, segredos, dados pessoais ou SQL sensível em logs,
  traces e respostas. Use mecanismos existentes para proteção de dados e mensagens de erro.
- Mudanças em sessão, refresh, revogação ou papéis exigem análise específica de concorrência
  e testes de acesso negado, além dos cenários de sucesso.

## Persistência e concorrência

- Confira o schema, constraints, relações, migrations e consultas atuais antes de modificar dados.
- Mantenha invariantes de domínio com transações e operações atômicas quando necessário.
  Não substitua concorrência segura por uma sequência vulnerável de leitura e escrita.
- Considere soft delete, unicidade, índices e integridade referencial conforme a regra real
  de cada entidade; não generalize uma regra local para todas as tabelas.
- Não altere migrations já aplicadas. Mudanças de schema devem ter estratégia de migração,
  compatibilidade com dados existentes e testes adequados.
- Não execute resets, seeds destrutivos, `push`, exclusões ou migrations em bancos não
  descartáveis sem solicitação e autorização explícitas.
- Use o ORM, driver e fluxo de migrations configurados atualmente; não introduza outro
  mecanismo de persistência com base apenas em exemplos de documentação.

## Streaming e eventos (quando a tarefa envolver esses recursos)

- Consulte a documentação pertinente em `docs/streaming/`, se presente, e valide os
  exemplos contra a implementação e a versão atual do Encore.
- Diferencie conexão WebSocket, entrega em tempo real, persistência, cache/presença e
  processamento assíncrono: uma tecnologia não substitui automaticamente a outra.
- Autentique conexões, autorize destinatários e recursos, valide mensagens e trate desconexões.
- Para eventos relevantes, considere idempotência, duplicações, reconexão, recuperação de
  lacunas e consistência entre a transação do banco e a publicação de eventos.
- Não assuma que mapas em memória ou assinaturas Pub/Sub locais funcionam entre réplicas.

## Validação e testes

- Descubra os comandos disponíveis em scripts, configuração e CI antes de executá-los.
- Faça primeiro os testes mais próximos da mudança; depois typecheck, lint e demais
  verificações relevantes, quando o ambiente permitir.
- Preserve e acrescente testes para regressões funcionais, autorização, dados e concorrência.
- Se o projeto ainda exigir `encore exec -- bun test`, utilize esse invólucro em vez de
  executar `bun test` diretamente; confirme a necessidade na configuração vigente.
- Testes de integração que alteram dados só devem usar ambiente e banco apropriados.
- Não declare testes como aprovados sem executá-los. Relate falhas e limitações verificadas.

## Documentação e evolução

- `README.md` apresenta o projeto; `docs/` aprofunda decisões, contratos e funcionamento;
  o código e os testes mostram o que está de fato implementado.
- Atualize apenas os documentos afetados por mudanças reais de comportamento, contratos
  ou decisões de arquitetura. Mantenha os índices e links úteis quando necessário.
- Exemplos/documentação não autorizam implementar funcionalidades fora do escopo pedido.
- **Não atualize este AGENTS.md só porque uma pasta, endpoint, versão ou módulo mudou.**
  Atualize-o quando mudar uma orientação duradoura de trabalho ou uma regra transversal.
- Crie `AGENTS.md` mais específicos em subdiretórios apenas quando houver regras locais
  realmente distintas; não duplique estas instruções.

## Agente `master-transporte` e skills

- O projeto possui o agente especializado `.opencode/agents/master-transporte.md`
  (selecione-o no OpenCode para tarefas de engenharia deste backend).
- Referências oficiais por assunto estão catalogadas em `docs/references.md`;
  consulte sob demanda (`webfetch` na página pertinente), não em lote.
- Skills por tecnologia em `.opencode/skills/` devem ser carregadas conforme o assunto
  (`encore-runtime`, `encore-events`, `drizzle-postgres`, `redis-realtime`,
  `typescript-quality`) — não todas em cada tarefa.
- Consulte a documentação oficial quando houver dúvida técnica, mudança de versão
  ou comportamento específico de bibliotecas, confirmando a versão instalada.
- O código existente, os contratos reais e os testes têm prioridade sobre exemplos genéricos.

## Entrega

Ao concluir, informe de forma objetiva: comportamento alterado, arquivos relevantes,
validações executadas e seus resultados, pendências e riscos. Diferencie o que foi
implementado, o que foi apenas documentado e o que não pôde ser verificado.
