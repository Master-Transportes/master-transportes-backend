import { describe, expect, it } from "bun:test";
import { ErrCode } from "encore.dev/api";
import { AccountStatus } from "@/domain/identity/identity.types";
import { DriverStatus } from "@/domain/driver/driver.types";
import { DriverService } from "@/services/driver.service";
import { UniqueViolationError } from "@/repositories/database-errors";
import { FakeDriverRepository } from "./fakes";
import { captureApiError } from "./test-helpers";

const baseRequest = {
  fullName: "João Motorista",
  email: "Joao@Example.com",
  password: "Str0ng#Passw0rd",
  phone: "(92) 98888-7777",
  cpf: "529.982.247-25",
};

function setup() {
  const drivers = new FakeDriverRepository();
  const service = new DriverService(drivers);
  return { drivers, service };
}

describe("DriverService.register", () => {
  it("cadastra motorista como PENDING e retorna DTO público", async () => {
    const { drivers, service } = setup();

    const response = await service.register(baseRequest);

    expect(response.id).toBeTruthy();
    expect(response.fullName).toBe("João Motorista");
    expect(response.email).toBe("joao@example.com");
    expect(response.phone).toBe("92988887777");
    expect(response.cpf).toBe("52998224725");
    expect(response.accountStatus).toBe(AccountStatus.ACTIVE);
    expect(response.driverStatus).toBe(DriverStatus.PENDING);
    expect(response.createdAt).toBe("2026-01-01T00:00:00.000Z");

    expect(response).not.toHaveProperty("passwordHash");
    expect(response).not.toHaveProperty("roles");
    expect(drivers.countDrivers()).toBe(1);
  });

  it("rejeita e-mail duplicado com 409", async () => {
    const { service } = setup();
    await service.register(baseRequest);

    const error = await captureApiError(service.register({ ...baseRequest, cpf: "11144477735" }));

    expect(error.code).toBe(ErrCode.AlreadyExists);
    expect(error.message).toBe("Não foi possível concluir o cadastro.");
    expect(error.details).toEqual({ reason: "ACCOUNT_ALREADY_EXISTS" });
  });

  it("rejeita CPF duplicado com 409", async () => {
    const { service } = setup();
    await service.register(baseRequest);

    const error = await captureApiError(service.register({ ...baseRequest, email: "outro@example.com" }));

    expect(error.code).toBe(ErrCode.AlreadyExists);
    expect(error.message).toBe("Não foi possível concluir o cadastro.");
    expect(error.details).toEqual({ reason: "ACCOUNT_ALREADY_EXISTS" });
  });

  it("rejeita CPF inválido, telefone inválido e telefone ausente", async () => {
    const { service } = setup();

    const invalidCpf = await captureApiError(service.register({ ...baseRequest, cpf: "123.456.789-00" }));
    const invalidPhone = await captureApiError(service.register({ ...baseRequest, phone: "1234" }));

    const { phone: _phone, ...withoutPhone } = baseRequest;
    const missingPhone = await captureApiError(service.register(withoutPhone as typeof baseRequest));

    expect(invalidCpf.code).toBe(ErrCode.InvalidArgument);
    expect(invalidPhone.code).toBe(ErrCode.InvalidArgument);
    expect(missingPhone.code).toBe(ErrCode.InvalidArgument);
  });
});

describe("DriverService.apply", () => {
  const applyRequest = { phone: "(92) 99999-0000", cpf: "529.982.247-25" };

  it("adiciona DRIVER a uma identidade existente e retorna o perfil PENDING", async () => {
    const { drivers, service } = setup();
    const profile = drivers.seed({ userId: "client-1", email: "cliente@test.com", status: DriverStatus.PENDING });
    drivers.setNextApplyResult({ status: "created", profile });

    const response = await service.apply("client-1", applyRequest);

    expect(response.id).toBe("client-1");
    expect(response.phone).toBe("92999990000");
    expect(response.cpf).toBe("52998224725");
    expect(response.driverStatus).toBe(DriverStatus.PENDING);
    expect(response).not.toHaveProperty("passwordHash");
  });

  it("rejeita identidade que já possui o papel DRIVER", async () => {
    const { drivers, service } = setup();
    drivers.setNextApplyResult({ status: "already_driver" });

    const error = await captureApiError(service.apply("client-1", applyRequest));

    expect(error.code).toBe(ErrCode.AlreadyExists);
    expect(error.details).toEqual({ reason: "DRIVER_PROFILE_ALREADY_EXISTS" });
  });

  it("retorna 404 quando o usuário autenticado não existe mais", async () => {
    const { drivers, service } = setup();
    drivers.setNextApplyResult({ status: "user_not_found" });

    const error = await captureApiError(service.apply("client-1", applyRequest));

    expect(error.code).toBe(ErrCode.NotFound);
    expect(error.details).toEqual({ reason: "PROFILE_NOT_FOUND" });
  });

  it("não sobrescreve telefone/CPF divergentes da identidade", async () => {
    const { drivers, service } = setup();
    drivers.setNextApplyResult({ status: "identity_conflict", field: "cpf" });

    const error = await captureApiError(service.apply("client-1", applyRequest));

    expect(error.code).toBe(ErrCode.AlreadyExists);
    expect(error.details).toEqual({ reason: "RESOURCE_CONFLICT" });
  });

  it("valida CPF/telefone e rejeita campos desconhecidos", async () => {
    const { service } = setup();

    const invalidCpf = await captureApiError(service.apply("client-1", { ...applyRequest, cpf: "111.111.111-11" }));
    const invalidPhone = await captureApiError(service.apply("client-1", { ...applyRequest, phone: "1234" }));
    const unknownField = await captureApiError(
      service.apply("client-1", { ...applyRequest, role: "ADMIN" } as typeof applyRequest),
    );

    expect(invalidCpf.code).toBe(ErrCode.InvalidArgument);
    expect(invalidPhone.code).toBe(ErrCode.InvalidArgument);
    expect(unknownField.code).toBe(ErrCode.InvalidArgument);
  });

  it("traduz conflito de unicidade do PostgreSQL sem vazar detalhes", async () => {
    const { drivers, service } = setup();
    drivers.nextApplyError = new UniqueViolationError("users_cpf_unique");

    const error = await captureApiError(service.apply("client-1", applyRequest));

    expect(error.code).toBe(ErrCode.AlreadyExists);
    expect(error.message).toBe("Não foi possível aplicar o papel de motorista.");
    expect(error.details).toEqual({ reason: "ACCOUNT_ALREADY_EXISTS" });
  });
});

describe("DriverService.getMe", () => {
  it("retorna identidade + status do motorista sem dados sensíveis", async () => {
    const { service } = setup();
    const created = await service.register(baseRequest);

    const profile = await service.getMe(created.id);

    expect(profile).toEqual({
      id: created.id,
      fullName: "João Motorista",
      email: "joao@example.com",
      phone: "92988887777",
      cpf: "52998224725",
      accountStatus: AccountStatus.ACTIVE,
      driverStatus: DriverStatus.PENDING,
    });
    expect(profile).not.toHaveProperty("passwordHash");
  });

  it("retorna 404 quando o perfil de motorista não existe", async () => {
    const { service } = setup();

    const error = await captureApiError(service.getMe("motorista-inexistente"));

    expect(error.code).toBe(ErrCode.NotFound);
  });
});
