export { ApiError, NetworkError } from "./errors.js";
export { createApiClient } from "./client.js";
export type { ApiClient, ApiClientConfig, RequestOptions } from "./client.js";
export { createMemoryStorage } from "./storage.js";
export type { SecureStorage } from "./storage.js";
export {
  loginTenant,
  verifyTenantMfa,
  loginCliente,
  registrarCliente,
} from "./auth.js";
export type { RegistroClienteInput } from "./auth.js";
export type {
  StaffUser,
  TenantSession,
  TenantLoginResult,
  ClienteUser,
  ClienteSession,
  LoginCredentials,
} from "./types.js";
