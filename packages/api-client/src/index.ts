export { ApiError, NetworkError } from "./errors";
export { createApiClient } from "./client";
export type { ApiClient, ApiClientConfig, RequestOptions } from "./client";
export { createMemoryStorage } from "./storage";
export type { SecureStorage } from "./storage";
export {
  loginTenant,
  verifyTenantMfa,
  loginCliente,
  registrarCliente,
} from "./auth";
export type { RegistroClienteInput } from "./auth";
export type {
  StaffUser,
  TenantSession,
  TenantLoginResult,
  ClienteUser,
  ClienteSession,
  LoginCredentials,
} from "./types";
