export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...options, cache: "no-store" });
  const data = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? `Request failed (${response.status})`);
  return data;
}

export function postJson<T>(path: string, value: object): Promise<T> {
  return api<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(value),
  });
}
