export async function request<T>(path: string, body?: unknown, csrf?: string): Promise<T> {
  const response = await fetch(path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(csrf ? { 'x-csrf-token': csrf } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response
    .json()
    .catch(() => ({ error: 'The server did not respond. Try again.' }));
  if (!response.ok) throw new Error(data.error || 'Request failed.');
  return data;
}
