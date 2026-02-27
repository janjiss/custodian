import { getAgentClient } from "./agent"

export interface AuthMethod {
  type: string
  label: string
}

export async function getProviderAuthMethods(): Promise<Record<string, AuthMethod[]>> {
  return await getAgentClient().getProviderAuthMethods()
}

export async function startOAuthFlow(
  providerId: string,
  methodIndex = 0,
): Promise<{ url: string; method: string; instructions: string } | null> {
  return await getAgentClient().startOAuth(providerId, methodIndex)
}

export async function completeOAuthFlow(
  providerId: string,
  methodIndex = 0,
  code?: string,
): Promise<boolean> {
  return await getAgentClient().completeOAuth(providerId, methodIndex, code)
}
