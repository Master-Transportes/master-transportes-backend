import { verifyToken } from "../../src/auth/auth";
import { Gateway, APIError } from "encore.dev/api";
import { authHandler } from "encore.dev/auth";
import { Header } from "encore.dev/api";

export interface AuthParams {
  authorization: Header<"Authorization">;
}

export interface AuthData {
  userID: string;
  sessionID: string;
}

export const auth = authHandler<AuthParams, AuthData>(async params => {
  const authHeader = params.authorization;
  if (!authHeader) throw APIError.invalidArgument("Missing 'Authorization' header.");
  if (!authHeader.startsWith("Bearer "))
    throw APIError.invalidArgument("Invalid 'Authorization' header format. Expected 'Bearer <token>'.");

  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) throw APIError.invalidArgument("Token must not be empty.");

  try {
    const jwtObject = verifyToken(token);
    return jwtObject;
  } catch (error) {
    throw APIError.unauthenticated("Invalid or expired token.");
  }
});

export const gateway = new Gateway({
  authHandler: auth,
});
