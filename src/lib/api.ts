export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

let activeWorkspace: string | null = null;

export function setActiveWorkspace(id: string | null): void {
  activeWorkspace = id;
}

type Options = Omit<RequestInit, 'body'> & { body?: unknown; workspace?: string };

/** Cliente HTTP único: mesma origem, cookie de sessão e workspace no cabeçalho. */
export async function api<T>(path: string, options: Options = {}): Promise<T> {
  const headers = new Headers(options.headers);
  let body: BodyInit | undefined;

  if (options.body instanceof FormData) {
    body = options.body;
  } else if (options.body !== undefined) {
    headers.set('content-type', 'application/json');
    body = JSON.stringify(options.body);
  }

  const workspace = options.workspace ?? activeWorkspace;
  if (workspace) headers.set('x-workspace-id', workspace);

  const response = await fetch(`/api${path}`, {
    ...options,
    body,
    headers,
    credentials: 'same-origin',
  });

  const text = await response.text();
  const data = text ? (JSON.parse(text) as unknown) : null;

  if (!response.ok) {
    const message =
      data && typeof data === 'object' && 'error' in data ? String((data as { error: string }).error) : `Erro ${response.status}`;
    throw new ApiError(message, response.status);
  }
  return data as T;
}

export const get = <T>(path: string, workspace?: string) => api<T>(path, { workspace });
export const post = <T>(path: string, body?: unknown, workspace?: string) =>
  api<T>(path, { method: 'POST', body, workspace });
export const patch = <T>(path: string, body?: unknown, workspace?: string) =>
  api<T>(path, { method: 'PATCH', body, workspace });
export const put = <T>(path: string, body?: unknown, workspace?: string) =>
  api<T>(path, { method: 'PUT', body, workspace });
export const del = <T>(path: string, workspace?: string) => api<T>(path, { method: 'DELETE', workspace });
