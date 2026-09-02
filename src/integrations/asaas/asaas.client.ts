import type {
  AsaasCustomer,
  AsaasPayment,
  AsaasPixQrCode,
  AsaasPaymentStatus,
  AsaasTransfer,
  AsaasError,
  CreateAsaasCustomerData,
  CreateAsaasPaymentData,
  CreateAsaasTransferData,
} from "./asaas.types";

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

export interface IAsaasClient {
  createCustomer(data: CreateAsaasCustomerData): Promise<AsaasCustomer>;
  findCustomerByExternalReference(externalReference: string): Promise<AsaasCustomer | null>;
  createPayment(data: CreateAsaasPaymentData): Promise<AsaasPayment>;
  getPixQrCode(paymentId: string): Promise<AsaasPixQrCode>;
  getPaymentStatus(paymentId: string): Promise<AsaasPaymentStatus>;
  createTransfer(data: CreateAsaasTransferData): Promise<AsaasTransfer>;
}

export class AsaasClient implements IAsaasClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(
    baseUrl: string = process.env.ASAAS_BASE_URL ?? "https://api-sandbox.asaas.com/v3",
    apiKey: string = process.env.ASAAS_KEY_SANDBOX ?? "",
  ) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
  }

  private async request<T>(options: RequestOptions): Promise<T> {
    const { method, path, body } = options;

    if (!this.apiKey) {
      throw new AsaasApiError(500, "MISSING_API_KEY", "ASAAS_KEY_SANDBOX não configurada");
    }

    const headers: Record<string, string> = {
      access_token: this.apiKey,
      "Content-Type": "application/json",
      "User-Agent": "MasterTransporte/1.0.0",
    };

    const fetchOptions: RequestInit = { method, headers };

    if (body && method !== "GET") {
      fetchOptions.body = JSON.stringify(body);
    }

    const response = await fetch(`${this.baseUrl}${path}`, fetchOptions);

    if (!response.ok) {
      const errorBody = (await response.json().catch(() => null)) as AsaasError | null;
      const errorCode = errorBody?.errors?.[0]?.code ?? "UNKNOWN";
      const errorMessage = errorBody?.errors?.[0]?.description ?? response.statusText;
      throw new AsaasApiError(response.status, errorCode, errorMessage);
    }

    return (await response.json()) as T;
  }

  async createCustomer(data: CreateAsaasCustomerData): Promise<AsaasCustomer> {
    return this.request<AsaasCustomer>({ method: "POST", path: "/customers", body: data });
  }

  async findCustomerByExternalReference(externalReference: string): Promise<AsaasCustomer | null> {
    const result = await this.request<{ data: AsaasCustomer[] }>({
      method: "GET",
      path: `/customers?externalReference=${encodeURIComponent(externalReference)}&limit=1`,
    });
    return result.data?.[0] ?? null;
  }

  async createPayment(data: CreateAsaasPaymentData): Promise<AsaasPayment> {
    return this.request<AsaasPayment>({ method: "POST", path: "/payments", body: data });
  }

  async getPixQrCode(paymentId: string): Promise<AsaasPixQrCode> {
    return this.request<AsaasPixQrCode>({ method: "GET", path: `/payments/${paymentId}/pixQrCode` });
  }

  async getPaymentStatus(paymentId: string): Promise<AsaasPaymentStatus> {
    return this.request<AsaasPaymentStatus>({ method: "GET", path: `/payments/${paymentId}/status` });
  }

  async createTransfer(data: CreateAsaasTransferData): Promise<AsaasTransfer> {
    return this.request<AsaasTransfer>({ method: "POST", path: "/transfers", body: data });
  }
}

export const asaasClient = new AsaasClient();
