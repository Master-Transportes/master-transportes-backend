import type { ClientMeResponse, ClientRegisterResponse } from "@/dto/client.dto";
import type { UserProfile } from "@/repositories/user/user.types";

export function toClientRegisterResponse(profile: UserProfile): ClientRegisterResponse {
  return {
    id: profile.id,
    fullName: profile.fullName,
    email: profile.email,
    phone: profile.phone,
    cpf: profile.cpf,
    status: profile.status,
    createdAt: profile.createdAt.toISOString(),
  };
}

export function toClientMeResponse(profile: UserProfile): ClientMeResponse {
  return {
    id: profile.id,
    fullName: profile.fullName,
    email: profile.email,
    phone: profile.phone,
    cpf: profile.cpf,
    status: profile.status,
  };
}
