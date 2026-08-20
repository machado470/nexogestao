import { Global, Logger, Module } from '@nestjs/common'
import IORedis from 'ioredis'
import { existsSync } from 'node:fs'
import { PrismaModule } from '../prisma/prisma.module'
import { QUEUE_CONNECTION } from './queue.constants'
import { QueueController } from './queue.controller'
import { QueueService } from './queue.service'
import { QueueObservabilityService } from '../common/metrics/queue-observability.service'

function isRunningInDocker() {
  return existsSync('/.dockerenv')
}

function parseRedisConfig() {
  const preferLocalhost =
    !isRunningInDocker() && (process.env.NODE_ENV ?? 'development') !== 'production'

  if (process.env.REDIS_URL) {
    const url = new URL(process.env.REDIS_URL)
    const host =
      preferLocalhost && url.hostname === 'redis' ? '127.0.0.1' : url.hostname

    return {
      host,
      port: Number(url.port || 6379),
      password: url.password || undefined,
      username: url.username || undefined,
      db: url.pathname ? Number(url.pathname.replace('/', '') || 0) : 0,
    }
  }

  const envHost = process.env.REDIS_HOST ?? 'localhost'
  const host = preferLocalhost && envHost === 'redis' ? '127.0.0.1' : envHost

  return {
    host,
    port: Number(process.env.REDIS_PORT ?? 6379),
    password: process.env.REDIS_PASSWORD || undefined,
    username: process.env.REDIS_USERNAME || undefined,
    db: Number(process.env.REDIS_DB ?? 0),
  }
}

@Global()
@Module({
  imports: [PrismaModule],
  controllers: [QueueController],
  providers: [
    {
      provide: QUEUE_CONNECTION,
      useFactory: () => {
        const logger = new Logger('QueueConnectionFactory')
        const config = parseRedisConfig()
        logger.log(`Redis target ${config.host}:${config.port} db=${config.db}`)

        return new IORedis({
          ...config,
          maxRetriesPerRequest: null,
          lazyConnect: true,
          enableReadyCheck: true,
          connectTimeout: 10000,
          retryStrategy: (times) =>
            Math.min(Math.max(1, times) * 500, 5_000),
        })
      },
    },
    QueueService,
    QueueObservabilityService,
  ],
  exports: [QUEUE_CONNECTION, QueueService, QueueObservabilityService],
})
export class QueueModule {}
