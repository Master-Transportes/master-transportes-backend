import { describe, expect, it } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ENDPOINT_POLICIES, type EndpointPolicy } from "@/auth/endpoint-policy";

/**
 * Auditoria estática dos endpoints declarados com `api(...)`.
 *
 * O Encore lê o código-fonte no build e não expõe `auth`/`tags` em runtime, então
 * a verificação lê as definições reais em `src/api/**`. A convenção do Prettier
 * mantém as opções do endpoint em uma linha; o parser abaixo é apenas um extrator
 * das chaves `auth`, `path` e `tags` e falha explicitamente se algo não casar.
 */
interface ScannedEndpoint {
  key: string;
  service: string;
  name: string;
  path: string;
  auth: boolean;
  tags: string[];
}

const ROLE_TAGS = { client: "client-role", driver: "driver-role" } as const;

const API_DIR = join(import.meta.dir, "..", "..", "api");
const ENDPOINT_PATTERN = /export const (\w+)\s*=\s*api<[^>]*>\(\s*\{([\s\S]*?)\}\s*,/g;

function scanService(service: string): ScannedEndpoint[] {
  const serviceDir = join(API_DIR, service);
  const files = readdirSync(serviceDir).filter(file => file.endsWith(".ts") && file !== "encore.service.ts");

  return files.flatMap(file => {
    const source = readFileSync(join(serviceDir, file), "utf8");
    const endpoints: ScannedEndpoint[] = [];

    for (const match of source.matchAll(ENDPOINT_PATTERN)) {
      const [, name, options] = match;
      const auth = /auth:\s*(true|false)/.exec(options)?.[1] === "true";
      const path = /path:\s*"([^"]+)"/.exec(options)?.[1];

      if (!path) {
        throw new Error(`Endpoint ${service}.${name} sem "path" legível em ${file}.`);
      }

      const tagsBlock = /tags:\s*\[([^\]]*)\]/.exec(options)?.[1] ?? "";
      const tags = [...tagsBlock.matchAll(/"([^"]+)"/g)].map(tag => tag[1]);

      endpoints.push({ key: `${service}.${name}`, service, name, path, auth, tags });
    }

    return endpoints;
  });
}

const services = readdirSync(API_DIR, { withFileTypes: true })
  .filter(entry => entry.isDirectory())
  .map(entry => entry.name)
  .filter(name => existsSync(join(API_DIR, name, "encore.service.ts")));

const endpoints = services.flatMap(scanService);
const policies = ENDPOINT_POLICIES as Record<string, EndpointPolicy>;

function roleTagsOf(endpoint: ScannedEndpoint): string[] {
  return endpoint.tags.filter(tag => tag === ROLE_TAGS.client || tag === ROLE_TAGS.driver);
}

describe("Política de acesso dos endpoints", () => {
  it("encontra os endpoints reais do projeto", () => {
    expect(services.sort()).toEqual(["client", "driver"]);
    expect(endpoints.length).toBeGreaterThan(0);
  });

  it("classifica todos os endpoints e não mantém entradas obsoletas", () => {
    expect(endpoints.map(endpoint => endpoint.key).sort()).toEqual(Object.keys(ENDPOINT_POLICIES).sort());
  });

  it("não declara mais de uma tag de papel no mesmo endpoint", () => {
    const ambiguous = endpoints.filter(endpoint => roleTagsOf(endpoint).length > 1).map(endpoint => endpoint.key);

    expect(ambiguous).toEqual([]);
  });

  for (const endpoint of endpoints) {
    it(`${endpoint.key} (${endpoint.path}) respeita a política declarada`, () => {
      const policy = policies[endpoint.key];
      expect(policy).toBeDefined();

      const roleTags = roleTagsOf(endpoint);

      if (policy === "public") {
        expect(endpoint.auth).toBe(false);
        expect(roleTags).toEqual([]);
        return;
      }

      expect(endpoint.auth).toBe(true);

      if (policy === "authenticated") {
        expect(roleTags).toEqual([]);
        return;
      }

      expect(roleTags).toEqual([ROLE_TAGS[policy]]);
    });
  }
});
