import { describe, expect, it } from 'vitest'
import { isSafeNotificationRouteHint } from '../../../../../packages/common/src/notification-route'

describe('MainLayout notification navigation guard', () => {
  it('keeps supported links navigable', () => {
    expect(isSafeNotificationRouteHint('/customers?customerId=c1')).toBe(true)
    expect(isSafeNotificationRouteHint('/service-orders?id=so1')).toBe(true)
  })

  it('does not navigate for persisted unsafe links', () => {
    expect(isSafeNotificationRouteHint('//external.invalid')).toBe(false)
    expect(isSafeNotificationRouteHint('/internal/test')).toBe(false)
    expect(isSafeNotificationRouteHint('/service-orders?serviceOrderId=so1')).toBe(false)
  })
})
