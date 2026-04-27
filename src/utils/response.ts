export async function serializeResponses(responses: Response[]) {
  return Promise.all(
    responses.map(async (res) => {
      const text = await res.text();
      const contentType = res.headers.get("content-type") ?? "";
      let body: unknown = text;

      if (contentType.includes("application/json")) {
        try {
          body = JSON.parse(text);
        } catch {
          /* keep raw text */
        }
      }

      return {
        status: res.status,
        statusText: res.statusText,
        headers: Object.fromEntries(res.headers),
        body,
      };
    }),
  );
}
