import { describe, expect, it } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { Middleware } from "encore.dev/api";
import { ENDPOINT_POLICIES, type EndpointPolicy } from "@/auth/endpoint-policy";

/**
 * Auditoria dos endpoints declarados com `api(...)`.
 *
 * Além da correspondência com a política central, o teste confirma que o
 * middleware de papel está REALMENTE registrado no `new Service()` do serviço.
 * Uma tag no endpoint sem middleware correspondente não protege nada.
 *
 * O parser é deliberadamente simples e baseado na convenção do Prettier. Se um
 * novo formato de endpoint (`api.raw`, `api.stream*`) aparecer, o teste falha
 * explicitamente em vez de ignorar a rota.
 */
interface ScannedEndpoint {
  key: string;
  service: string;
  name: string;
  path: string;
  method: string;
  expose: boolean;
  auth: boolean;
  tags: string[];
}

interface ServiceDefinition {
  service: string;
  tags: Set<string>;
}

const ROLE_TAGS = { client: "client-role", driver: "driver-role" } as const;
const API_DIR = join(import.meta.dir, "..", "..", "api");
const ENDPOINT_PATTERN = /export const (\w+)\s*=\s*api<[^>]*>\(\s*\{([\s\S]*?)\}\s*,/g;
const ANY_API_DECLARATION = /export const (\w+)\s*=\s*api/g;

function walk(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) return walk(fullPath);
    if (entry.isFile() && entry.name.endsWith(".ts") && entry.name !== "encore.service.ts") return [fullPath];
    return [];
  });
}

function scanService(service: string): ScannedEndpoint[] {
  const serviceDir = join(API_DIR, service);
  const files = walk(serviceDir);

  return files.flatMap(file => {
    const source = readFileSync(file, "utf8");
    const endpoints: ScannedEndpoint[] = [];
    const parsedNames = new Set<string>();

    for (const match of source.matchAll(ENDPOINT_PATTERN)) {
      const [, name, options] = match;
      parsedNames.add(name);

      const authMatch = /auth:\s*(true|false)/.exec(options);
      const path = /path:\s*"([^"]+)"/.exec(options)?.[1];
      const method = /method:\s*"([^"]+)"/.exec(options)?.[1];
      const expose = /expose:\s*(true|false)/.exec(options)?.[1];

      if (!path || !method || expose === undefined || !authMatch) {
        throw new Error(`Endpoint ${service}.${name} não declara explicitamente method/path/expose/auth em ${file}.`);
      }

      const tagsBlock = /tags:\s*\[([^\]]*)\]/.exec(options)?.[1] ?? "";
      const tags = [...tagsBlock.matchAll(/"([^"]+)"/g)].map(tag => tag[1]);

      endpoints.push({
        key: `${service}.${name}`,
        service,
        name,
        path,
        method,
        expose: expose === "true",
        auth: authMatch[1] === "true",
        tags,
      });
    }

    const declaredNames = [...source.matchAll(ANY_API_DECLARATION)].map(match => match[1]);
    const unparsed = declaredNames.filter(name => !parsedNames.has(name));
    if (unparsed.length > 0) {
      throw new Error(
        `Endpoint(s) ${unparsed.join(", ")} em ${file} usam uma forma não suportada pelo auditor ` +
          "(api.raw/api.stream* ou generics aninhados). Atualize o auditor antes de continuar.",
      );
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

const serviceDefinitions: ServiceDefinition[] = await Promise.all(
  services.map(async service => {
    const modulePath = pathToFileURL(join(API_DIR, service, "encore.service.ts")).href;
    const definition = await import(modulePath);
    const middlewares = (definition.default?.cfg?.middlewares ?? []) as Middleware[];
    const tags = new Set(middlewares.flatMap(middleware => middleware.options?.target?.tags ?? []));

    return { service, tags };
  }),
);

function roleTagsOf(endpoint: ScannedEndpoint): string[] {
  return endpoint.tags.filter(tag => tag === ROLE_TAGS.client || tag === ROLE_TAGS.driver);
}

describe("Política de acesso dos endpoints", () => {
  it("encontra os endpoints reais e não deixa nenhum sem política", () => {
    expect(endpoints.length).toBeGreaterThan(0);
    expect(endpoints.map(endpoint => endpoint.key).sort()).toEqual(Object.keys(ENDPOINT_POLICIES).sort());
  });

  it("declara explicitamente método, rota, expose e auth", () => {
    for (const endpoint of endpoints) {
      expect(endpoint.path.startsWith("/")).toBe(true);
      expect(endpoint.method).toBe(endpoint.method.toUpperCase());
      expect(typeof endpoint.expose).toBe("boolean");
    }
  });

  it("não declara mais de uma tag de papel no mesmo endpoint", () => {
    const ambiguous = endpoints.filter(endpoint => roleTagsOf(endpoint).length > 1).map(endpoint => endpoint.key);

    expect(ambiguous).toEqual([]);
  });

  it("registra os guards de papel dos serviços conhecidos", () => {
    const tagsOf = (service: string) => serviceDefinitions.find(definition => definition.service === service)?.tags;

    expect(tagsOf("client")?.has(ROLE_TAGS.client)).toBe(true);
    expect(tagsOf("driver")?.has(ROLE_TAGS.driver)).toBe(true);
    expect(tagsOf("driver")?.has("driver-operational")).toBe(true);
  });

  it("registra no serviço o middleware do papel exigido por cada tag", () => {
    const serviceTags = new Map(serviceDefinitions.map(definition => [definition.service, definition.tags]));

    for (const endpoint of endpoints) {
      for (const tag of roleTagsOf(endpoint)) {
        expect(serviceTags.get(endpoint.service)?.has(tag)).toBe(true);
      }
    }
  });

  for (const endpoint of endpoints) {
    it(`${endpoint.key} (${endpoint.method} ${endpoint.path}) respeita a política declarada`, () => {
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
