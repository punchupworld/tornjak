export type TunstileValidationResponse = { success: boolean; error?: unknown };
export type TurnstileSessionCache = Map<string, Promise<TunstileValidationResponse>>;

export const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
export const TURNSTILE_TOKEN_HEADER = "cf-turnstile-response";
export const TURNSTILE_CACHE_MS_HEADER = "cf-turnstile-cache-ms";

const globalCache = new Map<string, number>();

function isTurnstileGlobalCached(cacheKey: string): boolean {
  const expiredAt = globalCache.get(cacheKey);
  if (!expiredAt) return false;
  if (Date.now() >= expiredAt) {
    globalCache.delete(cacheKey);
    return false;
  }
  return true;
}

export function clearTurnstileGlobalCache(): void {
  globalCache.clear();
}

type ValidateTurnstileOptions = {
  secret?: string;
  token: string;
  remoteip?: string;
  sessionCache: TurnstileSessionCache;
  cacheHeader?: string | null;
};

export async function validateTurnstile({
  secret = "",
  token,
  remoteip,
  sessionCache,
  cacheHeader,
}: ValidateTurnstileOptions): Promise<TunstileValidationResponse> {
  const cacheKey = `${token}:${remoteip}`;
  const cacheMs = cacheHeader ? parseInt(cacheHeader, 10) : undefined;

  if (sessionCache.has(cacheKey)) {
    return sessionCache.get(cacheKey)!;
  }

  if (isTurnstileGlobalCached(cacheKey)) {
    return { success: true };
  }

  const promise = (async (): Promise<TunstileValidationResponse> => {
    try {
      const response = await fetch(TURNSTILE_VERIFY_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          secret,
          response: token,
          remoteip,
        }),
      });

      const result = (await response.json()) as { success: boolean };

      if (result.success && cacheMs !== undefined) {
        globalCache.set(cacheKey, Date.now() + cacheMs);
      }

      return result;
    } catch (error) {
      return { success: false, error };
    }
  })();

  sessionCache.set(cacheKey, promise);
  return promise;
}
