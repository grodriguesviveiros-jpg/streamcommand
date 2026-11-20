import type { Response } from 'express';

export type BusEvent = { type: string; data: unknown };

type Client = { userId: string; workspaces: Set<string>; res: Response };

const clients = new Set<Client>();

/** Inscreve um cliente SSE nas atualizações em tempo real dos seus workspaces. */
export function subscribe(userId: string, workspaces: string[], res: Response): () => void {
  const client: Client = { userId, workspaces: new Set(workspaces), res };
  clients.add(client);
  const ping = setInterval(() => {
    try {
      res.write(': ping\n\n');
    } catch {
      /* ignore */
    }
  }, 25_000);
  return () => {
    clearInterval(ping);
    clients.delete(client);
  };
}

/** Publica um evento apenas para quem tem acesso ao workspace de origem. */
export function publish(workspaceId: string, event: BusEvent): void {
  const payload = `event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`;
  for (const client of clients) {
    if (!client.workspaces.has(workspaceId)) continue;
    try {
      client.res.write(payload);
    } catch {
      clients.delete(client);
    }
  }
}

export function setWorkspaces(userId: string, workspaces: string[]): void {
  for (const client of clients) {
    if (client.userId === userId) client.workspaces = new Set(workspaces);
  }
}
