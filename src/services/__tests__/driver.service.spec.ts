import { describe, expect, it } from "bun:test";
import { ErrCode } from "encore.dev/api";
import { AccountStatus } from "@/domain/identity/identity.types";
import { DriverStatus } from "@/domain/driver/driver.types";
import { DriverService } from "@/services/driver.service";
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
      service.register({ ...baseRequest, email: "outro@example.com" }),
    );

    expect(error.code).toBe(ErrCode.AlreadyExists);
    expect(error.message).toBe("CPF já está em uso.");
  });

  it("rejeita CPF inválido, telefone inválido e telefone ausente", async () => {
    const { service } = setup();

    const invalidCpf = await captureApiError(
      service.register({ ...baseRequest, cpf: "123.456.789-00" }),
    );
    const invalidPhone = await captureApiError(
      service.register({ ...baseRequest, phone: "1234" }),
    );

    const { phone: _phone, ...withoutPhone } = baseRequest;
    const missingPhone = await captureApiError(
      service.register(withoutPhone as typeof baseRequest),
    );

    expect(invalidCpf.code).toBe(ErrCode.InvalidArgument);
    expect(invalidPhone.code).toBe(ErrCode.InvalidArgument);
    expect(missingPhone.code).toBe(ErrCode.InvalidArgument);
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
