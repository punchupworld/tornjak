export const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

const TURNSTILE_TOKEN_HEADERS = ["cf-turnstile-response", "x-turnstile-token"];

export function getTurnstileToken(request: Request) {
  for (const headerName of TURNSTILE_TOKEN_HEADERS) {
    const token = request.headers.get(headerName);

    if (token !== null && token.trim() !== "") {
      return token;
    }
  }

  const url = new URL(request.url);
  const queryToken = url.searchParams.get("turnstile-token");

  return queryToken !== null && queryToken.trim() !== "" ? queryToken : null;
}

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
