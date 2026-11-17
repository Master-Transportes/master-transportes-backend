# Encore.ts — Infraestrutura para self-hosting

> **Referência principal:** https://encore.dev/docs/self-host/configure-infra#example
> **Esquema oficial:** https://encore.dev/schemas/infra.schema.json
> **Consulta da documentação:** 17/11/2026
> **Tipo:** guia técnico autoral para estudos, revisão e futura implantação do Master Transporte. **Não é um arquivo de configuração pronto para produção.**

## 1. Objetivo e escopo

O Encore permite compilar os serviços TypeScript em uma imagem Docker e executá-la em infraestrutura administrada pela equipe. O arquivo `infra-config.json` fornece ao runtime o **mapeamento de recursos do Encore** para recursos reais: banco declarado por `SQLDatabase`, cache nativo, Topics/Subscriptions, objetos, segredos, descoberta de serviços e observabilidade. A imagem/container, a rede, TLS de borda, os brokers, volumes e backups continuam sendo responsabilidade do ambiente de deploy.

**Não confundir:**

| Elemento | Responsabilidade |
| --- | --- |
| Código Encore (`new Topic`, `SQLDatabase`, `CacheCluster`, etc.) | Declara o recurso lógico que a aplicação utiliza. |
| `infra-config.json` | Aponta esse recurso lógico para a infraestrutura concreta na implantação self-hosted. |
| `docker-compose.yml`, Kubernetes etc. | Cria/executa contêineres, redes, volumes e serviços. |
| `encore.app` | Metadados e configuração da própria aplicação Encore (ex.: CORS). Não substitui o infra config. |
| `DATABASE_URL` + `postgres.js` + Drizzle independente | Conecta o projeto diretamente a um PostgreSQL externo; não usa automaticamente `sql_servers`. |
| `.env` / gerenciador de segredos | Fornece variáveis sensíveis ao processo; um arquivo `.env` na máquina não entra automaticamente em um contêiner. |

O comando oficial para compilar é:

```bash
encore build docker --config=infra-config.json master-transporte:versao
```

O CLI compila a aplicação e monta a imagem. Por padrão, **todos os serviços** estão incluídos na imagem; opções `--services` e `--gateways` permitem selecionar componentes em builds avançados. O runtime usa, por padrão, a porta `8080` (ajustável por `PORT`). O build **não executa migrations** e **não agenda cron jobs automaticamente**. Veja a seção 14.

## 2. Como ler a configuração de exemplo da documentação

O exemplo oficial apresenta, em um mesmo JSON, recursos que **não precisam ser usados simultaneamente**. Ele é um catálogo ilustrativo, não um template obrigatório.

| Chave superior | Quando é relevante | Observação |
| --- | --- | --- |
| `$schema` | Sempre recomendada | Habilita validação/autocomplete pelo JSON Schema oficial. |
| `metadata` | Identificação do ambiente | Inclui `app_id`, `env_name`, `env_type`, `cloud`, `base_url`. |
| `graceful_shutdown` | Parada controlada | Tempos expressos em segundos. |
| `auth` | Autenticação **entre serviços** | **Não é** a autenticação JWT do cliente/driver. |
| `service_discovery` | Serviços distribuídos em endereços diferentes | Desnecessária em geral se todos estiverem na mesma imagem Encore. |
| `metrics` | Exportação de métricas | Um provider por configuração. |
| `sql_servers` | Bancos **declarados ao Encore** | Não é obrigatório para um pool `postgres.js` externo. |
| `secrets` | Uso de `secret()` do Encore | Diferente de simples `process.env`. |
| `redis` | Cache Redis nativo do Encore | Não configura automaticamente um cliente `ioredis` externo. |
| `pubsub` | Topics/Subscriptions do Encore | Mapeia para NSQ, GCP Pub/Sub ou AWS SNS/SQS. |
| `object_storage` | Buckets declarados no Encore | GCS, S3 e provedores compatíveis com S3. |

**Cuidado com a página original:** o exemplo amplo contém vírgulas finais após algumas propriedades — inválidas em JSON estrito. Os exemplos desta pasta usam JSON válido.

## 3. Exemplo mínimo para o estágio atual do Master Transporte

Contexto atual: Encore.ts; PostgreSQL 18 no Docker, Drizzle ORM com `postgres.js` via `DATABASE_URL`; autenticação própria; Redis `ioredis` preparado; sem Topics/Subscriptions ou buckets nativos confirmados.

Se **não houver recursos do Encore exigindo infraestrutura própria**, o ponto de partida conceitual é:

```json
{
  "$schema": "https://encore.dev/schemas/infra.schema.json",
  "metadata": {
    "app_id": "master-transporte",
    "env_name": "staging",
    "env_type": "test",
    "base_url": "https://api.exemplo.com"
  },
  "graceful_shutdown": {
    "total": 30
  }
}
```

- `app_id`, nome/ambiente e `base_url` acima são **valores ilustrativos**; ajustar aos reais.
- `cloud` foi omitido deliberadamente: a documentação exemplifica AWS/GCP/Azure, mas **não exige inventar um provider** para uma VPS genérica.
- O exemplo **não configura** banco, Redis, Pub/Sub ou segredos da aplicação; não os adicione sem uma dependência real do código.
- O runtime da aplicação continua recebendo suas variáveis (como `DATABASE_URL`, `JWT_SECRET`, `REFRESH_TOKEN_SECRET`) **por fora**, desde que assim seja implementado em `src/config/env.ts`.
- Verifique com a versão efetiva do Encore se este arquivo atende ao build. O CLI pode exigir recursos declarados não conhecidos neste resumo.

Exemplo completo em [`infra-config-minimal.example.json`](./infra-config-minimal.example.json).

## 4. `metadata`: metadados do ambiente

```json
{
  "metadata": {
    "app_id": "master-transporte",
    "env_name": "production",
    "env_type": "production",
    "base_url": "https://api.exemplo.com"
  }
}
```

- `app_id`: ID usado como metadado do app (não presume vínculo com Encore Cloud).
- `env_name`: nome legível do ambiente, por exemplo `development`, `staging`, `production`.
- `env_type`: valores documentados no schema: `production`, `test`, `development`, `ephemeral`.
- `cloud`: nome do provedor; inclua apenas se representar fielmente a implantação.
- `base_url`: URL pública efetiva usada pelos serviços, com HTTPS quando exposta ao público.

Não coloque URLs internas de container no lugar da URL pública. O reverse proxy/LB deve apontar ao porto correto da imagem.

## 5. `graceful_shutdown`: encerramento controlado

```json
{
  "graceful_shutdown": {
    "total": 30,
    "shutdown_hooks": 10,
    "handlers": 20
  }
}
```

Os campos são limites de tempo em **segundos**: `total` (processo de desligamento), `shutdown_hooks` (hooks) e `handlers` (requisições em processamento). São *opções de configuração*, não promessa de entrega de WebSocket ou de evento. Validar o desligamento com `docker stop`/SIGTERM e observar requisições e subscribers em andamento. O orquestrador precisa conceder tempo suficiente antes de SIGKILL.

## 6. `auth`: autenticação entre serviços

A documentação destaca que **endpoints privados podem ficar sem autenticação entre serviços quando nenhum método é configurado** — só é aceitável se houver isolamento de rede e controle de acesso adequados. Para chamadas em redes não confiáveis, configure chave compartilhada.

```json
{
  "auth": [
    {
      "type": "key",
      "id": 1,
      "key": { "$env": "SERVICE_API_KEY" }
    }
  ]
}
```

- `type: "key"`: método de autenticação suportado nesse exemplo.
- `id`: identificador da chave (útil para rotação conforme a estratégia adotada).
- `key`: segredo, preferencialmente referenciado via `$env`.
- **Não confundir** com o `AuthHandler`, JWT HS256 ou o middleware RBAC de clientes/motoristas. Eles pertencem à autorização de usuários finais.
- O segredo deve ser longo, imprevisível, diferente dos segredos JWT, protegido no ambiente e nunca registrado em logs.

## 7. `service_discovery`: descoberta de serviços

```json
{
  "service_discovery": {
    "identity-service": {
      "base_url": "https://identity-interno.exemplo.com",
      "auth": [
        {
          "type": "key",
          "id": 1,
          "key": { "$env": "SERVICE_API_KEY" }
        }
      ]
    }
  }
}
```

A chave (`identity-service`) é o **nome do serviço Encore** cuja localização deve ser resolvida; `base_url` é o endereço acessível **a partir do serviço que faz a chamada**. `auth` pode sobrescrever a autenticação padrão configurada na seção `auth`.

Se todos os serviços estiverem incluídos na mesma imagem Docker, o Encore configura automaticamente sua descoberta interna, segundo a documentação. **Não adicionar este bloco só por ter várias pastas `src/api` ou mais de um serviço lógico.** Use quando os serviços realmente forem implantados separadamente.

## 8. `metrics`: exportação de métricas

Providers documentados:

| Provider | Campos importantes | Observações |
| --- | --- | --- |
| `prometheus` | `type`, `collection_interval`, `remote_write_url` | Exportação para destino Prometheus Remote Write compatível. |
| `datadog` | `type`, `collection_interval`, `site`, `api_key` | Segredo por `$env`. |
| `gcp_cloud_monitoring` | `type`, `project_id`, `monitored_resource_type`, `monitored_resource_labels`, `metric_names` | Requer identidade/autorização GCP apropriada. |
| `aws_cloudwatch` | `type`, `collection_interval`, `namespace` | Requer credenciais/identidade AWS apropriada. |

Exemplo de Prometheus:

```json
{
  "metrics": {
    "type": "prometheus",
    "collection_interval": 15,
    "remote_write_url": { "$env": "PROMETHEUS_REMOTE_WRITE_URL" }
  }
}
```

Exemplos compactos alternativos:

```json
{"metrics":{"type":"datadog","collection_interval":30,"site":"datadoghq.com","api_key":{"$env":"DATADOG_API_KEY"}}}
```

```json
{"metrics":{"type":"aws_cloudwatch","collection_interval":60,"namespace":"MasterTransporte"}}
```

Em uma VPS sem observabilidade pronta, não configure URLs fictícias. Antes do deploy, defina logs, métricas de latência/erros, retenção e alertas. Métricas **não substituem** logs ou rastreamento distribuído.

## 9. `sql_servers`: SQL gerenciado pelo runtime Encore

A página diz que **cada banco declarado ao Encore** deve ter exatamente um mapeamento correspondente. Vários servidores podem coexistir.

Exemplo quando o código declara um banco Encore `main_db`:

```json
{
  "sql_servers": [
    {
      "host": "postgres:5432",
      "tls_config": { "disabled": true },
      "databases": {
        "main_db": {
          "name": "master_transporte",
          "username": "app_user",
          "password": { "$env": "DB_PASSWORD" },
          "max_connections": 20,
          "min_connections": 1
        }
      }
    }
  ]
}
```

**Não copie para o Master Transporte atual sem mudar sua arquitetura.** O exemplo se aplica se houver no código `new SQLDatabase("main_db", ...)` ou equivalente. Os repositórios atuais acessam PostgreSQL diretamente pelo `DATABASE_URL`, então uma entrada `sql_servers` não configura esse pool externo. Tampouco executa migrations do Drizzle externo.

Detalhes:

- `host`: endereço resolvível de dentro do contêiner. `localhost:5432` aponta para o próprio contêiner Encore, **não** para o serviço `postgres` do Compose.
- `name`: nome físico do banco, se diferente do nome lógico declarado no código.
- `username`, `password`: credenciais de banco (privilégios mínimos).
- `min_connections`/`max_connections`: dimensionar por número de réplicas.
- `tls_config`: definir explicitamente conforme o banco/rede. O exemplo com `disabled: true` presume rede privada Docker não criptografada; banco remoto deve usar TLS apropriado.

**Cuidado importante:** a página explica que, sem `tls_config`, o Encore tenta TLS e pode aceitar fallback sem criptografia em SQL; não dependa disso como uma política de segurança remota. Especifique CA/conexão segura.

### PostgreSQL + Drizzle no projeto atual

O ciclo independente permanece:

```text
App Encore.ts → src/config/env.ts → DATABASE_URL → postgres.js → Drizzle ORM → PostgreSQL
```

- Schema e migrations Drizzle pertencem ao projeto.
- Aplicar `drizzle-kit migrate` como etapa explícita antes de subir a nova imagem (ver [`../../drizzle/migrations.md`](../../drizzle/migrations.md)).
- Não misturar uma declaração de SQLDatabase com o pool externo sem decidir quem é responsável pelo recurso e pelas migrations.
- O artigo oficial de **integração gerenciada** Drizzle + Encore usa `SQLDatabase` e menciona migrations automáticas naquele **outro** modelo; não se aplica automaticamente ao banco externo existente.

## 10. `secrets`: segredos da plataforma Encore

### 10.1. Referências individuais

```json
{
  "secrets": {
    "ExternalAPIKey": { "$env": "EXTERNAL_API_KEY" }
  }
}
```

O nome do lado esquerdo deve corresponder ao segredo esperado no código quando se utiliza a API de segredos do Encore (`secret("ExternalAPIKey")`). O objeto `{ "$env": "EXTERNAL_API_KEY" }` aponta para uma variável de ambiente.

### 10.2. Objeto JSON inteiro por variável

```json
{
  "secrets": { "$env": "ENCORE_SECRETS_JSON" }
}
```

Neste caso, a variável é um **JSON de pares nome/valor**, e não apenas uma string de token. Exemplo de conteúdo em um gerenciador de segredos (não commitar valores reais):

```json
{"ExternalAPIKey":"valor-seguro-no-ambiente"}
```

### Diferença prática

- Se o projeto lê `process.env.JWT_SECRET` via `src/config/env.ts`, o segredo é gerenciado pelo próprio processo e **não precisa aparecer** na seção `secrets` do Encore.
- Se o código usa `secret("Nome")` do Encore, mapeie esse nome em `secrets` na configuração self-hosted.
- Nunca publicar segredos reais no Git ou no arquivo de configuração de exemplo.
- O `$env` exige disponibilizar a variável no ambiente correto de compilação/execução segundo o processo de deploy; validar a resolução em staging e não presumir que `.env` seja carregado pelo Docker.

## 11. `redis`: recursos de cache do Encore

Exemplo de Redis Encore com autenticação por senha:

```json
{
  "redis": {
    "cache": {
      "host": "redis:6379",
      "database_index": 0,
      "auth": {
        "type": "auth_string",
        "auth_string": { "$env": "REDIS_AUTH_STRING" }
      },
      "tls_config": { "disabled": true },
      "key_prefix": "mt:cache:",
      "max_connections": 20,
      "min_connections": 1
    }
  }
}
```

- A chave `cache` é o **nome lógico do recurso Redis Encore**; o exemplo pressupõe um recurso declarado com este nome.
- `auth`: modos documentados `auth_string` (senha) e `acl` (usuário+senha).
- `database_index`: número do banco lógico Redis (em Redis Cluster algumas opções podem ser diferentes).
- `key_prefix`: namespace das chaves.
- `tls_config`: ative TLS quando exigido; `disabled: true` somente se a conexão for protegida por rede privada confiável.
- `min_connections` e `max_connections`: limites do pool.

**Não confundir com o `ioredis` do projeto:** se a infraestrutura conecta `ioredis` diretamente por `REDIS_STATE_URL`, a seção `redis` do infra config **não configura esse cliente**. É necessária apenas se o código usa primitivas do cache nativo do Encore.

**Inconsistência na própria documentação:** dois parágrafos consecutivos sobre o TLS padrão do Redis dizem comportamentos opostos quando `tls_config` é omitido. Por segurança, configure a intenção explicitamente e valide com o runtime/versão usados; não assuma um dos padrões sem teste.

## 12. `pubsub`: Topics e Subscriptions declarados ao Encore

Providers suportados: **NSQ (`nsq`)**, **Google Pub/Sub (`gcp_pubsub`)**, **AWS SNS/SQS (`aws_sns_sqs`)**.

A chave em `topics` deve corresponder ao nome lógico declarado em `new Topic("...")`; a chave em `subscriptions` deve corresponder ao nome declarado em `new Subscription(topic, "...")`. Os valores `name`/`arn`/`url` apontam para os recursos reais do provedor. Nomes não devem ser inventados a partir de campos do domínio.

### 12.1. NSQ, alternativa para laboratório self-hosted

**Código ilustrativo somente se o serviço/evento vier a existir:**

```typescript
import { Topic, Subscription } from "encore.dev/pubsub";

interface RideEvent {
  rideId: string;
  status: string;
}

export const rideEvents = new Topic<RideEvent>("ride-events", {
  deliveryGuarantee: "at-least-once",
});

const rideProcessor = new Subscription(rideEvents, "process-ride-event", {
  handler: async (event) => {
    // Processamento idempotente no serviço real.
    console.log(event.rideId, event.status);
  },
});
```

**Infra config correspondente:**

```json
{
  "pubsub": [
    {
      "type": "nsq",
      "hosts": "nsqd:4150",
      "topics": {
        "ride-events": {
          "name": "ride-events",
          "subscriptions": {
            "process-ride-event": {
              "name": "process-ride-event"
            }
          }
        }
      }
    }
  ]
}
```

Exemplo em [`infra-config-nsq.example.json`](./infra-config-nsq.example.json).

O hostname `nsqd` precisa resolver de dentro do contêiner Encore (ambos na mesma rede Docker). O NSQ deve ser iniciado com armazenamento, restrições de rede e monitoração próprios. **A configuração não cria o contêiner, não fornece alta disponibilidade e não garante idempotência de processamento.** Comportamento de Pub/Sub detalhado em [`../../pubsub/README.md`](../../pubsub/README.md).

### 12.2. Google Cloud Pub/Sub

```json
{
  "pubsub": [
    {
      "type": "gcp_pubsub",
      "project_id": "projeto-exemplo",
      "topics": {
        "user-events": {
          "name": "user-events-topic",
          "subscriptions": {
            "user-notification": {
              "name": "user-notification-subscription"
            }
          }
        }
      }
    }
  ]
}
```

O guia também documenta `push_config` opcional com `id`, `service_account` e `jwt_audience`. Se usado, os três são exigidos e o `jwt_audience` precisa corresponder ao audience da assinatura push configurada no GCP. Exige permissões e recursos reais do projeto GCP.

### 12.3. AWS SNS + SQS

```json
{
  "pubsub": [
    {
      "type": "aws_sns_sqs",
      "topics": {
        "my-topic": {
          "arn": "arn:aws:sns:us-east-1:123456789012:my-topic",
          "subscriptions": {
            "my-queue": {
              "url": "https://sqs.us-east-1.amazonaws.com/123456789012/my-queue"
            }
          }
        }
      }
    }
  ]
}
```

**Ponto que exige checagem antes do deploy:** no momento da consulta, **a página** exibe `url` para assinatura SQS, enquanto **o JSON Schema** publicado contém `arn` no objeto de assinatura desse provider. Não assuma que ambas as formas são aceitas pelo runtime. Teste com o Encore CLI e com a versão fixada antes de criar um deployment real. Use a configuração que o CLI efetivamente validar.

### 12.4. Garantias reais

- Configurar um broker não substitui transações PostgreSQL.
- Entrega ao consumidor não significa entrega ao smartphone; para clientes use push/WebSocket e recuperação por API.
- Trate eventos duplicados, retentativas e falhas de publicação (ver [`../../pubsub/garantias-e-falhas.md`](../../pubsub/garantias-e-falhas.md)).
- Para mudanças críticas confirmadas no PostgreSQL (ex.: corrida aceita), considere **Transactional Outbox** e subscribers idempotentes.
- Em múltiplas instâncias do Encore, um subscriber de um Topic não é automaticamente um broadcast para cada processo e seus mapas locais de WebSocket.

## 13. `object_storage`: buckets para o Encore

### GCS

```json
{
  "object_storage": [
    {
      "type": "gcs",
      "buckets": {
        "driver-documents": {
          "name": "mt-driver-documents"
        }
      }
    }
  ]
}
```

### AWS S3

```json
{
  "object_storage": [
    {
      "type": "s3",
      "region": "sa-east-1",
      "buckets": {
        "driver-documents": {
          "name": "mt-driver-documents"
        }
      }
    }
  ]
}
```

### S3 compatível (endpoint personalizado)

```json
{
  "object_storage": [
    {
      "type": "s3",
      "region": "auto",
      "endpoint": "https://endpoint.s3-compativel.exemplo",
      "access_key_id": { "$env": "STORAGE_ACCESS_KEY_ID" },
      "secret_access_key": { "$env": "STORAGE_SECRET_ACCESS_KEY" },
      "buckets": {
        "driver-documents": {
          "name": "mt-driver-documents"
        }
      }
    }
  ]
}
```

- A chave `driver-documents` é o nome do bucket lógico no código do Encore, **não** uma tabela Drizzle.
- `name` é o nome real do bucket no provedor; `key_prefix` pode separar ambientes; `public_base_url` só deve ser usado quando o bucket é **intencionalmente público**.
- **Documentos de motorista são sensíveis:** manter privados, usar autorização para download, acesso temporário quando apropriado, políticas de retenção e auditoria. Não configurar URL pública para CNH/documentos pessoais.
- Assim como SQL/Redis, isso só se aplica se o código usar o recurso nativo do Encore; o campo `storageKey` no banco não declara um bucket por si só.

## 14. Build, deploy e ciclo operacional

### Build

```bash
encore build docker --config=infra-config.json master-transporte:staging
```

O build usa o CLI instalado no host e produz uma imagem Docker. Caso a versão do Encore utilize opções adicionais, conferir `encore build docker --help` e a referência da CLI.

### Preparar ambiente

1. Confirmar quais recursos Encore estão realmente declarados no código (Topics, Subscriptions, SQLDatabase, CacheCluster, Bucket, `secret()`).
2. Provisionar apenas os recursos correspondentes no provider escolhido.
3. Montar configuração por ambiente; evitar misturar endereços de staging e produção.
4. Injetar credenciais e variáveis na execução / pipeline conforme a estratégia de build e secret management.
5. Aplicar migrations Drizzle externas **antes** do rollout; não depender da imagem Encore para isso.
6. Subir a imagem, configurar domínio, TLS, proxy reverso, firewall e healthchecks.
7. Confirmar comunicação com PostgreSQL, Redis e broker; testar uma publicação e uma assinatura reais antes de declarar sucesso.
8. Monitorar métricas, erro dos consumidores, backlog, disco, memória e conexão ao banco.

### Atenção ao cron

O documento oficial de build diz que a imagem não dispara cron jobs sozinha. Para Cron Jobs do Encore em self-hosting, um scheduler externo precisa chamar os endpoints correspondentes no horário configurado, com autenticação adequada; não publicar endpoints privados diretamente sem revisar a arquitetura.

### Exemplo mínimo de execução (sem credenciais reais)

```bash
# A imagem e a configuração já devem ter sido criadas.
# Se o app usa DATABASE_URL diretamente, forneça-a ao container:
docker run --rm \
  --name master-transporte-api \
  --network rede-privada-do-deploy \
  -e PORT=8080 \
  --env-file ./runtime.env \
  -p 127.0.0.1:8080:8080 \
  master-transporte:staging
```

A rede e o arquivo `runtime.env` acima são **ilustrativos** e devem ser criados/protegidos de acordo com a implantação. Não commitar `runtime.env`. A porta pode ser exposta ao proxy reverso na mesma rede, sem publicação pública direta.

## 15. Checklist de segurança e consistência

- [ ] O `infra-config.json` é JSON válido (sem comentários nem vírgulas finais).
- [ ] O arquivo passa na validação do schema oficial e no build da versão Encore usada.
- [ ] Cada recurso Encore declarado possui mapeamento real (e nenhum recurso fictício foi adicionado).
- [ ] Os segredos usam `$env` ou secret manager; nenhum valor real está no Git ou imagem pública.
- [ ] `auth` entre serviços não foi confundido com `AuthHandler` de usuários.
- [ ] Endpoints privados estão isolados e autenticação de serviço está aplicada quando necessário.
- [ ] Hostnames internos são resolvidos de dentro do contêiner, não apenas do host.
- [ ] TLS está explícito para serviços remotos; CA e autenticação foram testados.
- [ ] O pool PostgreSQL foi dimensionado por réplica; migrations são etapa separada.
- [ ] Tópicos/subscriptions do infra config correspondem aos nomes no código.
- [ ] Existe política de retry, duplicação, recuperação e monitoramento para eventos importantes.
- [ ] O storage de documentos privados não possui exposição pública por engano.
- [ ] Backups do PostgreSQL e persistência do broker foram testados, incluindo restore.
- [ ] `docker stop`/SIGTERM e novo deploy não provocam perda silenciosa de trabalho crítico.
- [ ] Os testes consideram staging, não apenas `encore run` local.

## 16. O que manter fora deste documento

- Versões exatas de pacotes: verificar `package-lock.json` e `package.json`.
- Lista corrente de endpoints ou diretórios: consultar o código e `README.md`.
- Políticas de programação da IA: manter em `AGENTS.md`.
- Documentação detalhada de eventos: `docs/pubsub/` e `docs/streaming/`.
- Decisões de infraestrutura realmente adotadas, com motivos e datas: registrar ADRs quando necessário.

Este arquivo ensina a **configurar e validar**; não afirma que recursos futuros já estão implementados.

## 17. Pontos que devem ser validados especificamente neste repositório

Como não foram inspecionados os arquivos completos da versão atual do projeto ou a execução de `encore build docker`, permanecem condicionais:

- Uso de recursos Encore gerenciados vs conexões externas (Drizzle/`postgres.js`, `ioredis`).
- Existência e nomes reais de Topics, Subscriptions, Buckets ou segredos do Encore.
- Padrões de deployment e versão do Encore CLI/runtime que serão utilizados.
- Compatibilidade da configuração AWS SQS (`url` na página versus `arn` no schema).
- Comportamento efetivo de TLS padrão Redis (texto inconsistente na página).
- Ambiente em que `$env` será resolvido na cadeia real de build/deploy.

## 18. Fontes oficiais consultadas

1. Configure Infrastructure — https://encore.dev/docs/self-host/configure-infra#example
2. JSON Schema oficial do Infra Config — https://encore.dev/schemas/infra.schema.json
3. Build Docker Images — https://encore.dev/docs/self-host/build
4. CI/CD self-hosted — https://encore.dev/docs/self-host/ci-cd
5. Encore.ts com Drizzle — https://encore.dev/docs/ts/develop/orms/drizzle
6. Encore.ts Pub/Sub — https://encore.dev/docs/ts/primitives/pubsub
7. Encore CLI — https://encore.dev/docs/cli/cli-reference

> **Política de atualização:** revisar este documento quando os conceitos/integradores mudarem. Mudanças de versão, endpoints, nomes ou pastas não devem induzir reescrita total: conferir código e documentação de referência no momento de implementar.
