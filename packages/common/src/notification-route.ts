const ROUTE_CONTRACT = {
  '/customers': ['customerId'],
  '/service-orders': ['id'],
} as const;

export type NotificationRouteHint = string;

function build(path: keyof typeof ROUTE_CONTRACT, key: string, value: string): NotificationRouteHint {
  if (!value.trim()) throw new Error('O identificador da rota de notificação é obrigatório');
  return `${path}?${key}=${encodeURIComponent(value)}`;
}

export const notificationRoutes = {
  customer: (customerId: string) => build('/customers', 'customerId', customerId),
  serviceOrder: (serviceOrderId: string) => build('/service-orders', 'id', serviceOrderId),
};

/** Accepts only the explicitly declared, internal notification deep links. */
export function isSafeNotificationRouteHint(value: unknown): value is NotificationRouteHint {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return false;
  if (value.includes('\\') || value.includes('#')) return false;

  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return false;
  }
  if (decoded.includes('..') || decoded.includes('\\') || decoded.startsWith('//')) return false;

  let url: URL;
  try {
    url = new URL(value, 'https://notification-route.invalid');
  } catch {
    return false;
  }
  const required = ROUTE_CONTRACT[url.pathname as keyof typeof ROUTE_CONTRACT];
  if (!required || url.origin !== 'https://notification-route.invalid') return false;

  const entries = [...url.searchParams.entries()];
  if (entries.length !== required.length) return false;
  return required.every(key => {
    const values = url.searchParams.getAll(key);
    return values.length === 1 && values[0].trim().length > 0;
  });
}
