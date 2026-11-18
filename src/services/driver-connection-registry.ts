import type { DriverStream } from "./driver-stream.service";

/**
 * Registro EM MEMÓRIA das conexões de stream ativas neste processo.
 *
 * Objetivo único: localizar a conexão de um motorista para entregas futuras
 * (Etapa 5/8). Registro existe ⇒ conexão existe naquele processo — nenhum
 * status derivado (`isConnected`, `isOnline`, `lastHeartbeat`) é armazenado
 * aqui. Presença com expiração é responsabilidade da Etapa 3 (Redis), e a
 * disponibilidade ("Receber corridas") vive no PostgreSQL.
 *
 * Política de substituição: `add` mantém a conexão MAIS RECENTE por `userId`
 * e NÃO fecha a anterior — se uma conexão antiga ainda estiver aberta, ela
 * deixa de ser o alvo do registro e se remove sozinha ao encerrar (o
 * `remove` compara a identidade do stream e só apaga se for o registrado).
 *
 * Limite estrutural: o Map é local à instância que mantém o stream. Com
 * múltiplas instâncias, a distribuição entre processos é trabalho da camada
 * de entrega (Etapa 8) — ver docs/roadmap/mvp-tempo-real.md.
 */
export class DriverConnectionRegistry {
  private readonly connections = new Map<string, DriverStream>();

  add(userId: string, stream: DriverStream): void {
    this.connections.set(userId, stream);
  }

  get(userId: string): DriverStream | undefined {
    return this.connections.get(userId);
  }

  remove(userId: string, stream: DriverStream): void {
    if (this.connections.get(userId) === stream) {
      this.connections.delete(userId);
    }
  }
}

export const driverConnections = new DriverConnectionRegistry();
