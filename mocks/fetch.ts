export type FetchCall = {
  input: Parameters<typeof fetch>[0];
  init?: RequestInit;
};

export function installFetchMock(impl: (call: FetchCall, calls: FetchCall[]) => Promise<Response>) {
  const originalFetch = globalThis.fetch;
  const calls: FetchCall[] = [];

  globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const call = { input, init };
    calls.push(call);
    return impl(call, calls);
  }) as typeof fetch;

  return () => {
    globalThis.fetch = originalFetch;
  };
}
