# Reconexão, confirmação de entrega e confiabilidade

Uma conexão WebSocket pode cair por: perda de rede, mudança de Wi-Fi, encerramento do
aplicativo, atualização de servidor ou timeout de infraestrutura.

## Estados de uma mensagem (implementados pela aplicação)

O cliente precisa distinguir:

| Estado      | O que realmente significa                        |
| ----------- | ------------------------------------------------ |
| `pending`   | Mensagem criada localmente                       |
| `accepted`  | Servidor confirmou a persistência                |
| `delivered` | Dispositivo destinatário confirmou o recebimento |
| `read`      | Destinatário confirmou a leitura                 |

> ⚠️ Esses estados são **implementados pela aplicação**. A existência de uma conexão
> WebSocket ou o retorno de `stream.send()` **não cria automaticamente** uma confirmação
> de entrega ou leitura.

## Confiabilidade: o que implementar

- **Identificadores estáveis** de mensagens e eventos.
- **Reconexão** com *exponential backoff* e variação aleatória (*jitter*).
- **Sincronização incremental** ao restabelecer a conexão.
- **Confirmação no nível da aplicação** (ACK por `eventId`/`messageId`).
- **Tratamento de mensagens repetidas** (deduplicação por id).
- **Limites por conexão** (backpressure).

## Sessão e permissões durante a vida da conexão

Uma conexão **autenticada no handshake** pode continuar aberta mesmo depois de mudanças
na sessão ou nas permissões. Revogações, expiração de credenciais e remoção de
participantes precisam ser aplicadas **também durante a vida da conexão**, conforme as
regras de segurança do sistema.

> Neste projeto: toda requisição autenticada confirma sessão, status da conta e papéis
> **no PostgreSQL** (sem cache de auth) — ver `AGENTS.md`. Para streams de longa duração,
> definir a política de revalidação.

## Testes essenciais antes de produção

| Cenário                                   | Resultado esperado                                        |
| ----------------------------------------- | --------------------------------------------------------- |
| Usuário sem JWT conecta                   | Conexão rejeitada                                         |
| X tenta acessar conversa de Y e Z         | Acesso negado                                             |
| X envia a mesma mensagem duas vezes       | Uma única linha no PostgreSQL                             |
| Y está offline quando X envia             | Mensagem fica armazenada                                  |
| Y reconecta após a queda                  | Consegue recuperar mensagens perdidas                     |
| Duas réplicas recebem conexões diferentes | Evento alcança a réplica de destino                       |
| Dois motoristas aceitam a mesma corrida   | Apenas um vence                                           |
| Broker falha depois do commit             | Evento pode ser republicado a partir da outbox            |
| Token é revogado com socket ativo         | A sessão deixa de ter acesso conforme a política definida |
| Cliente lento acumula mensagens           | Sistema aplica limites sem esgotar recursos               |

Também é necessário testar a **infraestrutura real de produção**: o comportamento de
WebSockets depende do balanceador, dos proxies e dos limites de conexão. Conexões longas
exigem **heartbeat** e estratégia de **reconexão**.
