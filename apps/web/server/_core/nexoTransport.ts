import { nexoFetch } from "./nexoClient";
import { unwrapNexoApiResponse } from "./nexoEnvelope";

export type NexoContext = {
  req?: any;
  user?: { token?: string } | null;
};

export function toQueryString(input?: Record<string, unknown> | null): string {
  if (!input || typeof input !== "object") return "";

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === null || value === "" || Number.isNaN(value)) continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item !== undefined && item !== null) params.append(key, String(item));
      }
      continue;
    }
    params.append(key, String(value));
  }

  const query = params.toString();
  return query ? `?${query}` : "";
}

export async function authedFetch(
  ctx: NexoContext,
  path: string,
  options: RequestInit = {},
) {
  const raw = await nexoFetch<unknown>(ctx, path, options);
  return unwrapNexoApiResponse<any>(raw);
}

export function authedGet(
  ctx: NexoContext,
  path: string,
  query?: Record<string, unknown> | null,
) {
  return authedFetch(ctx, `${path}${toQueryString(query)}`);
}

export function authedPost(
  ctx: NexoContext,
  path: string,
  body?: unknown,
  headers?: Record<string, string>,
) {
  return authedFetch(ctx, path, {
    method: "POST",
    body: body !== undefined ? JSON.stringify(body) : undefined,
    headers,
  });
}

export function authedPatch(ctx: NexoContext, path: string, body?: unknown) {
  return authedFetch(ctx, path, {
    method: "PATCH",
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}
