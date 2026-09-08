import { ValidationPipe } from '@nestjs/common'
import { SendTemplateMessageDto } from './whatsapp.dto'

describe('SendTemplateMessageDto', () => {
  const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })
  const validate = (value: unknown) => pipe.transform(value, { type: 'body', metatype: SendTemplateMessageDto })

  it('accepts a canonical template intent and typed context', async () => {
    await expect(validate({
      conversationId: 'conversation-1',
      templateKey: 'payment_reminder',
      context: { customerName: 'Cliente', chargeAmount: '100,00' },
    })).resolves.toEqual(expect.objectContaining({ templateKey: 'payment_reminder' }))
  })

  it.each(['templateName', 'variables', 'orgId', 'tenantId', 'organizationId', 'provider', 'phoneId'])(
    'rejects unauthorized property %s',
    async property => {
      await expect(validate({ customerId: 'customer-1', templateKey: 'payment_reminder', [property]: 'forged' }))
        .rejects.toMatchObject({ status: 400 })
    },
  )

  it('rejects unknown templates and nested arbitrary/provider properties', async () => {
    await expect(validate({ customerId: 'customer-1', templateKey: 'arbitrary' })).rejects.toMatchObject({ status: 400 })
    await expect(validate({ customerId: 'customer-1', templateKey: 'payment_reminder', context: { namespace: 'provider', arbitrary: true } }))
      .rejects.toMatchObject({ status: 400 })
  })
})
