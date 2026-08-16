import { isSafeNotificationRouteHint, notificationRoutes } from '@nexogestao/common'

describe('notification route contract', () => {
  it('builds encoded customer and service-order deep links', () => {
    expect(notificationRoutes.customer('customer / 1')).toBe('/customers?customerId=customer%20%2F%201')
    expect(notificationRoutes.serviceOrder('os / 1')).toBe('/service-orders?id=os%20%2F%201')
  })

  it.each(['/customers?customerId=id', '/service-orders?id=id'])('accepts %s', route => {
    expect(isSafeNotificationRouteHint(route)).toBe(true)
  })

  it.each([
    '/service-orders?serviceOrderId=id', '/customers/id', '/service-orders/id', '/internal/test',
    '//dominio-externo.com', 'https://dominio-externo.com', '/../internal', '/%2e%2e/internal',
    '/unknown?id=1', '/customers?customerId=id&unexpected=1', '/customers?customerId=',
    '/customers?customerId=one&customerId=two',
  ])('rejects %s', route => expect(isSafeNotificationRouteHint(route)).toBe(false))
})
