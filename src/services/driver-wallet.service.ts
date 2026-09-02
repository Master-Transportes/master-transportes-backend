import { APIError } from "encore.dev/api";
import { validateOrThrow } from "@/validations/schema-validator";
import { PixKeySchema } from "@/validations/dto/driver.validate";
import type { IDriverRepository } from "@/repositories/contracts/IDriverRepository";
import type { IDriverCache } from "@/cache/contracts/IDriverCache";
import type { DriverWalletInformationResponse, UpdatePixKeyDTO } from "@/dto/driver.interface";
import type { WalletService } from "./wallet.service";
import { driverRepository } from "@/repositories";
import { driverCache } from "@/cache";
import { walletService } from "./wallet.service";

export class DriverWalletService {
  constructor(
    private readonly driverRepo: IDriverRepository,
    private readonly driverCacheService: IDriverCache,
    private readonly walletService: WalletService,
  ) {}

  async updatePixKey(driverId: string, payload: UpdatePixKeyDTO): Promise<DriverWalletInformationResponse> {
    const validated = validateOrThrow(PixKeySchema, payload);

    const driver = await this.driverRepo.findById(driverId);
    if (!driver) throw APIError.notFound("Motorista não encontrado.");

    await this.driverRepo.updatePixKey(driverId, {
      pixKey: validated.pixKey.trim(),
      pixKeyType: validated.pixKeyType,
    });

    await this.driverCacheService.invalidate(driverId);

    return this.getWalletInformation(driverId);
  }

  async getWalletInformation(driverId: string): Promise<DriverWalletInformationResponse> {
    const [wallet, pix] = await Promise.all([
      this.walletService.getWallet(driverId, "DRIVER"),
      this.driverRepo.findByIdWithPixKey(driverId),
    ]);

    if (!pix) throw APIError.notFound("Motorista não encontrado.");

    return {
      walletId: wallet.id,
      balance: wallet.balance,
      currency: wallet.currency,
      pixKey: pix.pixKey,
      pixKeyType: pix.pixKeyType,
    };
  }
}

export const driverWalletService = new DriverWalletService(driverRepository, driverCache, walletService);
