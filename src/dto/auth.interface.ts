export interface AccessTokenPayload {
  sub: string;
  sid: string;
  jti: string;
  role: "CLIENT" | "DRIVER";
  iss: string;
  aud: string;
  iat: number;
  exp: number;
}
