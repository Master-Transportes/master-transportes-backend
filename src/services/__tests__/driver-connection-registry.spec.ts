import { describe, expect, it } from "bun:test";
import type { DriverStream } from "@/services/driver-stream.service";
import { DriverConnectionRegistry } from "@/services/driver-connection-registry";

function fakeStream(token: string): DriverStream {
  return { token } as unknown as DriverStream;
}

describe("DriverConnectionRegistry", () => {
  it("add/get/remove localiza e libera a conexão do motorista", () => {
    const registry = new DriverConnectionRegistry();
    const stream = fakeStream("a");

    registry.add("driver-1", stream);
    expect(registry.get("driver-1")).toBe(stream);

    registry.remove("driver-1", stream);
    expect(registry.get("driver-1")).toBeUndefined();
  });

  it("add substitui por userId e mantém a conexão mais recente (sem fechar a anterior)", () => {
    const registry = new DriverConnectionRegistry();
    const first = fakeStream("primeira");
    const second = fakeStream("segunda");

    registry.add("driver-1", first);
    registry.add("driver-1", second);

    expect(registry.get("driver-1")).toBe(second);
  });

  it("remove é protegido por identidade: conexão antiga não remove a nova", () => {
    const registry = new DriverConnectionRegistry();
    const first = fakeStream("primeira");
    const second = fakeStream("segunda");

    registry.add("driver-1", first);
    registry.add("driver-1", second);

    // A conexão antiga encerra depois da nova entrar; não pode apagá-la.
    registry.remove("driver-1", first);
    expect(registry.get("driver-1")).toBe(second);

    registry.remove("driver-1", second);
    expect(registry.get("driver-1")).toBeUndefined();
  });

  it("remove de motorista inexistente é inofensivo", () => {
    const registry = new DriverConnectionRegistry();

    expect(() => registry.remove("desconhecido", fakeStream("x"))).not.toThrow();
    expect(registry.get("desconhecido")).toBeUndefined();
  });
});
