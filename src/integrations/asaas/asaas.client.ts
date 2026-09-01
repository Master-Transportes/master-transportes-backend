import type {
  AsaasCustomer,
  AsaasPayment,
  AsaasPixQrCode,
  AsaasPaymentStatus,
  AsaasTransfer,
  AsaasError,
} from "./asaas.types";
import type { PixKeyType } from "@/infra/database/types";

const BASE_URL = process.env.ASAAS_BASE_URL ?? "https://api-sandbox.asaas.com/v3";
const API_KEY = process.env.ASAAS_KEY_SANDBOX ?? "";

export class AsaasApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(`Asaas API [${statusCode}] ${code}: ${message}`);
    this.name = "AsaasApiError";
  }
}

interface RequestOptions {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  body?: unknown;
}

async function request<T>(options: RequestOptions): Promise<T> {
  const { method, path, body } = options;

  if (!API_KEY) {
    throw new AsaasApiError(500, "MISSING_API_KEY", "ASAAS_KEY_SANDBOX não configurada");
  }

  const headers: Record<string, string> = {
    access_token: API_KEY,
    "Content-Type": "application/json",
    "User-Agent": "MasterTransporte/1.0.0",
  };

  const fetchOptions: RequestInit = { method, headers };

  if (body && method !== "GET") {
    fetchOptions.body = JSON.stringify(body);
  }

  const response = await fetch(`${BASE_URL}${path}`, fetchOptions);

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => null)) as AsaasError | null;
    const errorCode = errorBody?.errors?.[0]?.code ?? "UNKNOWN";
    const errorMessage = errorBody?.errors?.[0]?.description ?? response.statusText;
    throw new AsaasApiError(response.status, errorCode, errorMessage);
  }

  return (await response.json()) as T;
}

export async function createCustomer(data: {
  name: string;
  cpfCnpj: string;
  email?: string;
  externalReference?: string;
}): Promise<AsaasCustomer> {
  return request<AsaasCustomer>({ method: "POST", path: "/customers", body: data });
}

export async function findCustomerByExternalReference(externalReference: string): Promise<AsaasCustomer | null> {
  const result = await request<{ data: AsaasCustomer[] }>({
    method: "GET",
    path: `/customers?externalReference=${encodeURIComponent(externalReference)}&limit=1`,
  });
  return result.data?.[0] ?? null;
}

export async function createPayment(data: {
  customer: string;
  billingType: "PIX";
  value: number;
  dueDate: string;
  description?: string;
  externalReference?: string;
}): Promise<AsaasPayment> {
  return request<AsaasPayment>({ method: "POST", path: "/payments", body: data });
}

export async function getPixQrCode(paymentId: string): Promise<AsaasPixQrCode> {
  return request<AsaasPixQrCode>({ method: "GET", path: `/payments/${paymentId}/pixQrCode` });
}

export async function getPaymentStatus(paymentId: string): Promise<AsaasPaymentStatus> {
  return request<AsaasPaymentStatus>({ method: "GET", path: `/payments/${paymentId}/status` });
}

export async function createTransfer(data: {
  value: number;
  pixAddressKey: string;
  pixAddressKeyType: PixKeyType;
  description?: string;
  externalReference?: string;
}): Promise<AsaasTransfer> {
  return request<AsaasTransfer>({ method: "POST", path: "/transfers", body: data });
}

export interface IAsaasClient {
  createCustomer(data: {
    name: string;
    cpfCnpj: string;
    email?: string;
    externalReference?: string;
  }): Promise<AsaasCustomer>;
  findCustomerByExternalReference(externalReference: string): Promise<AsaasCustomer | null>;
  createPayment(data: {
    customer: string;
    billingType: "PIX";
    value: number;
    dueDate: string;
    description?: string;
    externalReference?: string;
  }): Promise<AsaasPayment>;
  getPixQrCode(paymentId: string): Promise<AsaasPixQrCode>;
  createTransfer(data: {
    value: number;
    pixAddressKey: string;
    pixAddressKeyType: PixKeyType;
    description?: string;
    externalReference?: string;
  }): Promise<AsaasTransfer>;
}

export const asaasClient: IAsaasClient = {
  createCustomer,
  findCustomerByExternalReference,
  createPayment,
  getPixQrCode,
  createTransfer,
};
