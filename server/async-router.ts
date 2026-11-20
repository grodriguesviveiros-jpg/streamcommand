import type { NextFunction, Request, RequestHandler, Response, Router } from 'express';

type Layer = { route?: { stack: { handle: RequestHandler }[] }; handle: RequestHandler };

function wrap(handler: RequestHandler): RequestHandler {
  if (typeof handler !== 'function') return handler;
  if (handler.length >= 4) return handler; // middleware de erro (err, req, res, next)
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = (handler as unknown as (r: Request, s: Response, n: NextFunction) => unknown)(req, res, next);
      if (result && typeof (result as Promise<unknown>).catch === 'function') {
        (result as Promise<unknown>).catch(next);
      }
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Express 4 não captura rejeições de handlers async. Sem isso, um erro de
 * validação (ex.: id inválido) derrubaria o processo inteiro da API.
 * Percorre as camadas já registradas e envolve cada handler.
 */
export function applyAsyncGuard(router: Router): Router {
  const stack = (router as unknown as { stack: Layer[] }).stack ?? [];
  for (const layer of stack) {
    if (layer.route) {
      for (const sub of layer.route.stack) sub.handle = wrap(sub.handle);
    } else if (typeof layer.handle === 'function') {
      layer.handle = wrap(layer.handle);
    }
  }
  return router;
}
