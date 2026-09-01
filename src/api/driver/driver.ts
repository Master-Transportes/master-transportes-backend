import { api } from "encore.dev/api";
import * as auth from "~encore/auth";
import { driverService } from "@/services/driver.service";
import { walletService } from "@/services/wallet.service";
import { paymentService } from "@/services/payment.service";
import { getRequestMetadata } from "@/middlewares/rate-limit.middleware";
import type {
  ChangePasswordDTO,
  DepositParams,
  PaginationParams,
  RegisterAccountResponse,
  RegisterDriverDTO,
  UpdateProfileDTO,
} from "@/dto/user.interface";
import type {
  UpdateDriverLocationDTO,
  AcceptOfferDTO,
  RejectOfferDTO,
  CancelRideParams,
  CompleteRideDTO,
  ActiveRideResponse,
  DriverStatusResponse,
  DriverProfileResponse,
  DriverRideListResponse,
  UpdatePixKeyDTO,
  DriverWalletInformationResponse,
} from "@/dto/driver.interface";
import type { SignInDTO, SignInResponse, RefreshDTO, RefreshResponse } from "@/dto/access.interface";
import type {
  WalletResponse,
  WalletBalanceResponse,
  WalletTransactionListResponse,
  PayoutResponse,
} from "@/dto/wallet.interface";

export const login = api<SignInDTO, SignInResponse>(
  { expose: true, method: "POST", path: "/driver/login", auth: false },
  async payload => {
    const meta = getRequestMetadata();
    return driverService.signIn(payload, meta);
  },
);

export const register = api<RegisterDriverDTO, RegisterAccountResponse>(
  { expose: true, method: "POST", path: "/driver/register", auth: false },
  async payload => driverService.register(payload),
);

export const refresh = api<RefreshDTO, RefreshResponse>(
  { expose: true, method: "POST", path: "/driver/refresh", auth: false },
  async ({ refreshToken }) => driverService.refreshSession(refreshToken),
);

export const me = api<void, DriverProfileResponse>(
  { expose: true, method: "GET", path: "/driver/me", auth: true },
  async () => {
    const { userID } = auth.getAuthData()!;
    return driverService.getMe(userID);
  },
);

export const updateProfile = api<UpdateProfileDTO, DriverProfileResponse>(
  { expose: true, method: "PUT", path: "/driver/profile", auth: true },
  async payload => {
    const { userID } = auth.getAuthData()!;
    return driverService.updateProfile(userID, payload);
  },
);

export const updatePassword = api<ChangePasswordDTO, void>(
  { expose: true, method: "PUT", path: "/driver/password", auth: true },
  async payload => {
    const { userID } = auth.getAuthData()!;
    await driverService.changePassword(userID, payload);
  },
);

export const updateLocation = api<UpdateDriverLocationDTO, void>(
  { expose: true, method: "PUT", path: "/driver/location", auth: true },
  async payload => {
    const { userID } = auth.getAuthData()!;
    await driverService.updateLocation(userID, payload);
  },
);

export const updatePixKey = api<UpdatePixKeyDTO, DriverWalletInformationResponse>(
  { expose: true, method: "PUT", path: "/driver/pix-key", auth: true },
  async payload => {
    const { userID } = auth.getAuthData()!;
    return driverService.updatePixKey(userID, payload);
  },
);

export const getInformationWallet = api<void, DriverWalletInformationResponse>(
  { expose: true, method: "GET", path: "/driver/wallet/information", auth: true },
  async () => {
    const { userID } = auth.getAuthData()!;
    return driverService.getWalletInformation(userID);
  },
);

export const listRides = api<PaginationParams, DriverRideListResponse>(
  { expose: true, method: "GET", path: "/driver/rides", auth: true },
  async params => {
    const { userID } = auth.getAuthData()!;
    return driverService.getRides(userID, {
      page: params.page ? Number(params.page) : undefined,
      limit: params.limit ? Number(params.limit) : undefined,
    });
  },
);

export const getActiveRide = api<void, ActiveRideResponse>(
  { expose: true, method: "GET", path: "/driver/rides/active", auth: true },
  async () => {
    const { userID } = auth.getAuthData()!;
    return driverService.getActiveRide(userID);
  },
);

export const cancelRide = api<CancelRideParams, void>(
  { expose: true, method: "DELETE", path: "/driver/rides/:rideId", auth: true },
  async payload => {
    const { userID } = auth.getAuthData()!;
    await driverService.cancelRide(userID, payload);
  },
);

export const completeRide = api<CompleteRideDTO, ActiveRideResponse>(
  { expose: true, method: "PUT", path: "/driver/rides/:rideId/complete", auth: true },
  async payload => {
    const { userID } = auth.getAuthData()!;
    return driverService.completeRide(userID, payload);
  },
);

export const acceptOffer = api<AcceptOfferDTO, void>(
  { expose: true, method: "POST", path: "/driver/offers/:offerId/accept", auth: true },
  async payload => {
    const { userID } = auth.getAuthData()!;
    await driverService.acceptOffer(userID, payload);
  },
);

export const rejectOffer = api<RejectOfferDTO, void>(
  { expose: true, method: "POST", path: "/driver/offers/:offerId/reject", auth: true },
  async payload => {
    const { userID } = auth.getAuthData()!;
    await driverService.rejectOffer(userID, payload);
  },
);

export const goOnline = api<void, DriverStatusResponse>(
  { expose: true, method: "POST", path: "/driver/status/online", auth: true },
  async () => {
    const { userID } = auth.getAuthData()!;
    return driverService.goOnline(userID);
  },
);

export const goOffline = api<void, DriverStatusResponse>(
  { expose: true, method: "POST", path: "/driver/status/offline", auth: true },
  async () => {
    const { userID } = auth.getAuthData()!;
    return driverService.goOffline(userID);
  },
);

export const getStatus = api<void, DriverStatusResponse>(
  { expose: true, method: "GET", path: "/driver/status", auth: true },
  async () => {
    const { userID } = auth.getAuthData()!;
    return driverService.getStatus(userID);
  },
);

export const getWallet = api<void, WalletResponse>(
  { expose: true, method: "GET", path: "/driver/wallet", auth: true },
  async () => {
    const { userID } = auth.getAuthData()!;
    return walletService.getWallet(userID, "DRIVER");
  },
);

export const getBalance = api<void, WalletBalanceResponse>(
  { expose: true, method: "GET", path: "/driver/wallet/balance", auth: true },
  async () => {
    const { userID } = auth.getAuthData()!;
    return walletService.getBalance(userID, "DRIVER");
  },
);

export const listTransactions = api<PaginationParams, WalletTransactionListResponse>(
  { expose: true, method: "GET", path: "/driver/wallet/transactions", auth: true },
  async params => {
    const { userID } = auth.getAuthData()!;
    return walletService.getTransactions(userID, "DRIVER", {
      page: params.page ? Number(params.page) : undefined,
      limit: params.limit ? Number(params.limit) : undefined,
    });
  },
);

export const requestPayout = api<DepositParams, PayoutResponse>(
  { expose: true, method: "POST", path: "/driver/wallet/payout", auth: true },
  async payload => {
    const { userID } = auth.getAuthData()!;
    return paymentService.requestPayout(userID, payload.amountInCents);
  },
);
