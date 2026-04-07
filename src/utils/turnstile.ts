export const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
export const TURNSTILE_TOKEN_HEADER = "cf-turnstile-response";

export async function validateTurnstile(
  secret: string,
  token: string,
  remoteip: string,
): Promise<{ success: boolean; error?: unknown }> {
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

    return (await response.json()) as { success: boolean };
  } catch (error) {
    return { success: false, error };
  }
}
