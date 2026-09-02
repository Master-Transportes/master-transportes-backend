import { api } from "encore.dev/api";
import * as auth from "~encore/auth";
import { userService } from "@/services/user.service";
import { walletService } from "@/services/wallet.service";
import { paymentService } from "@/services/payment.service";
import { getRequestMetadata } from "@/middlewares/rate-limit.middleware";
import type {
  CancelRideParams,
  ChangePasswordDTO,
  PaginationParams,
  CancelRideRequestParams,
  DepositParams,
  RegisterAccountResponse,
  RegisterUserDTO,
  RequestRideDTO,
  RequestRideResponse,
  RideListResponse,
  UpdateProfileDTO,
  UserProfileResponse,
  ActiveRideResponse,
  PendingRideRequestResponse,
} from "@/dto/user.interface";
import type {
  SignInDTO,
  SignInResponse,
  RefreshDTO,
  RefreshResponse,
  GetMeResponse,
  LogoutResponse,
  RevokeSessionParams,
  ListSessionsResponse,
} from "@/dto/access.interface";
import type { WalletResponse, WalletBalanceResponse, WalletTransactionListResponse } from "@/dto/wallet.interface";
import type { WalletDepositResponse } from "@/dto/payment.interface";

export const login = api<SignInDTO, SignInResponse>(
  { expose: true, method: "POST", path: "/auth/login", auth: false },
  async payload => {
    const meta = getRequestMetadata();
    return userService.signIn(payload, meta);
  },
);

export const register = api<RegisterUserDTO, RegisterAccountResponse>(
  { expose: true, method: "POST", path: "/client/register", auth: false },
  async payload => userService.register(payload),
);

export const refresh = api<RefreshDTO, RefreshResponse>(
  { expose: true, method: "POST", path: "/client/refresh", auth: false },
  async ({ refreshToken }) => userService.refreshSession(refreshToken),
);

export const me = api<void, GetMeResponse>(
  { expose: true, method: "GET", path: "/client/me", auth: true },
  async () => {
    const { userID } = auth.getAuthData()!;
    return userService.getMe(userID);
  },
);

export const updateProfile = api<UpdateProfileDTO, UserProfileResponse>(
  { expose: true, method: "PUT", path: "/client/profile", auth: true },
  async payload => {
    const { userID } = auth.getAuthData()!;
    return userService.updateProfile(userID, payload);
  },
);

export const updatePassword = api<ChangePasswordDTO, void>(
  { expose: true, method: "PUT", path: "/client/password", auth: true },
  async payload => {
    const { userID } = auth.getAuthData()!;
    await userService.changePassword(userID, payload);
  },
);

export const listRides = api<PaginationParams, RideListResponse>(
  { expose: true, method: "GET", path: "/client/rides", auth: true },
  async params => {
    const { userID } = auth.getAuthData()!;
    return userService.getRides(userID, {
      page: params.page ? Number(params.page) : undefined,
      limit: params.limit ? Number(params.limit) : undefined,
    });
  },
);

export const requestRide = api<RequestRideDTO, RequestRideResponse>(
  { expose: true, method: "POST", path: "/client/rides", auth: true },
  async payload => {
    const { userID } = auth.getAuthData()!;
    return userService.requestRide(userID, payload);
  },
);

export const getActiveRide = api<void, ActiveRideResponse>(
  { expose: true, method: "GET", path: "/client/rides/active", auth: true },
  async () => {
    const { userID } = auth.getAuthData()!;
    return userService.getActiveRide(userID);
  },
);

export const getPendingRideRequest = api<void, PendingRideRequestResponse>(
  { expose: true, method: "GET", path: "/client/rides/pending", auth: true },
  async () => {
    const { userID } = auth.getAuthData()!;
    return userService.getPendingRideRequest(userID);
  },
);

export const cancelRide = api<CancelRideParams, void>(
  { expose: true, method: "DELETE", path: "/client/rides/:rideId", auth: true },
  async payload => {
    const { userID } = auth.getAuthData()!;
    await userService.cancelRide(userID, payload);
  },
);

export const cancelRideRequest = api<CancelRideRequestParams, void>(
  { expose: true, method: "DELETE", path: "/client/rides/:rideId/request", auth: true },
  async payload => {
    const { userID } = auth.getAuthData()!;
    await userService.cancelRideRequest(userID, payload.rideId);
  },
);

export const getWallet = api<void, WalletResponse>(
  { expose: true, method: "GET", path: "/client/wallet", auth: true },
  async () => {
    const { userID } = auth.getAuthData()!;
    return walletService.getWallet(userID, "USER");
  },
);

export const getBalance = api<void, WalletBalanceResponse>(
  { expose: true, method: "GET", path: "/client/wallet/balance", auth: true },
  async () => {
    const { userID } = auth.getAuthData()!;
    return walletService.getBalance(userID, "USER");
  },
);

export const listTransactions = api<PaginationParams, WalletTransactionListResponse>(
  { expose: true, method: "GET", path: "/client/wallet/transactions", auth: true },
  async params => {
    const { userID } = auth.getAuthData()!;
    return walletService.getTransactions(userID, "USER", {
      page: params.page ? Number(params.page) : undefined,
      limit: params.limit ? Number(params.limit) : undefined,
    });
  },
);

export const deposit = api<DepositParams, WalletDepositResponse>(
  { expose: true, method: "POST", path: "/client/wallet/deposit", auth: true },
  async payload => {
    const { userID } = auth.getAuthData()!;
    return paymentService.createDeposit(userID, payload.amountInCents);
  },
);

export const logout = api<void, LogoutResponse>(
  { expose: true, method: "POST", path: "/client/logout", auth: true },
  async () => {
    const { sessionID } = auth.getAuthData()!;
    await userService.logout(sessionID);
    return { message: "Logout realizado com sucesso." };
  },
);

export const logoutAll = api<void, LogoutResponse>(
  { expose: true, method: "POST", path: "/client/logout-all", auth: true },
  async () => {
    const { userID } = auth.getAuthData()!;
    await userService.logoutAll(userID);
    return { message: "Todas as sessões foram encerradas." };
  },
);

export const listSessions = api<void, ListSessionsResponse>(
  { expose: true, method: "GET", path: "/client/sessions", auth: true },
  async () => {
    const { userID, sessionID } = auth.getAuthData()!;
    const sessions = await userService.getUserSessions(userID);
    const result = sessions.map(s => ({ ...s, isCurrent: s.id === sessionID }));
    return { sessions: result };
  },
);

export const revokeSession = api<RevokeSessionParams, LogoutResponse>(
  { expose: true, method: "DELETE", path: "/client/sessions/:sessionId", auth: true },
  async params => {
    const { userID } = auth.getAuthData()!;
    await userService.revokeSession(userID, params.sessionId);
    return { message: "Sessão encerrada com sucesso." };
  },
);
