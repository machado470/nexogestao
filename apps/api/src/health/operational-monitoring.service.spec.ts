import { OperationalMonitoringService } from './operational-monitoring.service'

describe('OperationalMonitoringService queue availability', () => {
  function createService() {
    const queueService = {
      getQueueStatus: jest.fn().mockResolvedValue({
        ok: false,
        redisEnabled: false,
        reason: 'Redis indisponível no ambiente atual',
        status: 'end',
      }),
    }

    const waMetrics = {
      snapshot: jest.fn().mockReturnValue({
        whatsapp_inbound_webhook_failed_total: 0,
        whatsapp_retry_total: 0,
        whatsapp_failed_jobs_total: 0,
        whatsapp_failed_webhook_total: 0,
      }),
    }

    return new OperationalMonitoringService(
      queueService as any,
      waMetrics as any,
    )
  }

  it('não transforma Redis indisponível em health saudável', async () => {
    const service = createService()

    const summary = await service.summary()

    expect(summary.status).toBe('degraded')

    expect(summary.queues).toEqual([
      expect.objectContaining({
        queue: 'queue-service',
        degraded: true,
        degradedReasons: expect.arrayContaining([
          'queue_service_unavailable',
        ]),
      }),
    ])

    expect(summary.degradedReasons).toContain(
      'queue_degraded:queue-service',
    )

    expect(
      summary.queues.some((item) =>
        ['ok', 'reason', 'status', 'redisEnabled'].includes(item.queue),
      ),
    ).toBe(false)
  })
})
