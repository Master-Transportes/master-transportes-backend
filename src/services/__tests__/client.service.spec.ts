import { describe, expect, it } from "bun:test";
import { ErrCode } from "encore.dev/api";
import { AccountStatus } from "@/domain/identity/identity.types";
import { ClientService } from "@/services/client.service";
import { FakeUserRepository } from "./fakes";
import { captureApiError } from "./test-helpers";

const VALID_CPF = "52998224725";

function setup() {
  const users = new FakeUserRepository();
  const service = new ClientService(users);
  return { users, service };
}

const baseRequest = {
  fullName: "  Maria   da Silva ",
  email: "Maria@Example.com",
  password: "Str0ng#Passw0rd",
  phone: "(92) 99999-0000",
  cpf: "529.982.247-25",
};

describe("ClientService.register", () => {
  it("cadastra passageiro válido normalizando nome/e-mail/CPF e retorna DTO público", async () => {
    const { users, service } = setup();

    const response = await service.register(baseRequest);

    expect(response.id).toBeTruthy();
    expect(response.fullName).toBe("Maria da Silva");
    expect(response.email).toBe("maria@example.com");
    expect(response.phone).toBe("92999990000");
    expect(response.cpf).toBe(VALID_CPF);
    expect(response.status).toBe(AccountStatus.ACTIVE);
    expect(response.createdAt).toBe("2026-01-01T00:00:00.000Z");

    expect(response).not.toHaveProperty("passwordHash");
    expect(response).not.toHaveProperty("password");
    expect(response).not.toHaveProperty("roles");
    expect(users.countUsers()).toBe(1);
  });

  it("rejeita e-mail duplicado com 409", async () => {
    const { service } = setup();
    await service.register(baseRequest);

    const error = await captureApiError(
      service.register({ ...baseRequest, cpf: "11144477735" }),
    );

    expect(error.code).toBe(ErrCode.AlreadyExists);
    expect(error.message).toBe("E-mail já está em uso.");
  });

  it("rejeita CPF duplicado com 409", async () => {
    const { service } = setup();
    await service.register(baseRequest);

    const error = await captureApiError(
      service.register({ ...baseRequest, email: "outra@example.com" }),
    );

    expect(error.code).toBe(ErrCode.AlreadyExists);
    expect(error.message).toBe("CPF já está em uso.");
  });

  it("rejeita CPF inválido (dígitos verificadores) com 400", async () => {
    const { service } = setup();

    const error = await captureApiError(
      service.register({ ...baseRequest, cpf: "111.111.111-11" }),
    );

    expect(error.code).toBe(ErrCode.InvalidArgument);
  });

  it("rejeita dados obrigatórios ausentes com 400", async () => {
    const { service } = setup();
    const { password: _password, ...withoutPassword } = baseRequest;

    const error = await captureApiError(
      service.register(withoutPassword as typeof baseRequest),
    );

    expect(error.code).toBe(ErrCode.InvalidArgument);
  });

  it("rejeita campos desconhecidos (status/papéis) com 400", async () => {
    const { service } = setup();

    const error = await captureApiError(
      service.register({ ...baseRequest, role: "ADMIN", status: "BANNED" } as typeof baseRequest),
    );

    expect(error.code).toBe(ErrCode.InvalidArgument);
  });

  it("falha persistencial não deixa cadastro parcial", async () => {
    const { users, service } = setup();
    users.nextCreateError = new Error("falha simulada de banco");

    const error = await captureApiError(service.register(baseRequest));

    expect(error.code).toBe(ErrCode.Internal);
    expect(users.countUsers()).toBe(0);
  });
});

describe("ClientService.getMe", () => {
  it("retorna somente campos públicos do próprio perfil", async () => {
    const { service } = setup();
    const created = await service.register(baseRequest);

    const profile = await service.getMe(created.id);

    expect(profile).toEqual({
      id: created.id,
      fullName: "Maria da Silva",
      email: "maria@example.com",
      phone: "92999990000",
      cpf: VALID_CPF,
      status: AccountStatus.ACTIVE,
    });
    expect(profile).not.toHaveProperty("passwordHash");
    expect(profile).not.toHaveProperty("createdAt");
  });

  it("retorna 404 para usuário inexistente", async () => {
    const { service } = setup();

    const error = await captureApiError(service.getMe("usuario-inexistente"));

    expect(error.code).toBe(ErrCode.NotFound);
  });
});
