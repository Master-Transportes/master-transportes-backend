/**
 * Motorista — vocabulário público de aprovação e documentos.
 *
 * Status de disponibilidade (ONLINE/OFFLINE) é de runtime e deliberadamente
 * não faz parte do domínio de persistência.
 */

export enum DriverStatus {
  PENDING = "PENDING",
  UNDER_REVIEW = "UNDER_REVIEW",
  APPROVED = "APPROVED",
  REJECTED = "REJECTED",
  SUSPENDED = "SUSPENDED",
}

/** Tipos de documento aceitos. CRLV fica previsto para a futura entidade veículo. */
export enum DriverDocumentType {
  CNH = "CNH",
  CRLV = "CRLV",
  IDENTITY = "IDENTITY",
  OTHER = "OTHER",
}

/** Status de verificação manual de um documento. Vencimento é derivado de expiresOn. */
export enum DriverDocumentVerificationStatus {
  PENDING = "PENDING",
  APPROVED = "APPROVED",
  REJECTED = "REJECTED",
}

export const DRIVER_STATUSES = [
  DriverStatus.PENDING,
  DriverStatus.UNDER_REVIEW,
  DriverStatus.APPROVED,
  DriverStatus.REJECTED,
  DriverStatus.SUSPENDED,
] as const;

export const DRIVER_DOCUMENT_TYPES = [
  DriverDocumentType.CNH,
  DriverDocumentType.CRLV,
  DriverDocumentType.IDENTITY,
  DriverDocumentType.OTHER,
] as const;

export const DRIVER_DOCUMENT_VERIFICATION_STATUSES = [
  DriverDocumentVerificationStatus.PENDING,
  DriverDocumentVerificationStatus.APPROVED,
  DriverDocumentVerificationStatus.REJECTED,
] as const;

/**
 * Política inicial de login: PENDING, UNDER_REVIEW e APPROVED podem autenticar.
 * REJECTED e SUSPENDED são negados.
 *
 * Atenção: login permitido NÃO significa elegibilidade para receber corridas —
 * somente APPROVED será elegível no futuro despacho, sujeito a outras verificações.
 */
export const DRIVER_LOGIN_ALLOWED_STATUSES: readonly DriverStatus[] = [
  DriverStatus.PENDING,
  DriverStatus.UNDER_REVIEW,
  DriverStatus.APPROVED,
];
