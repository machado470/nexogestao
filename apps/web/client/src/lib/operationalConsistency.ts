type UtilsLike = any;

export async function invalidateOperationalGraph(
  utils: UtilsLike,
  customerId?: string | null,
  serviceOrderId?: string | null
) {
  await Promise.all([
    utils.nexo.customers.list.invalidate(),
    utils.nexo.appointments.list.invalidate(),
    customerId
      ? utils.nexo.customers.getById.invalidate({ id: customerId })
      : Promise.resolve(),
    customerId
      ? utils.nexo.customers.workspace.invalidate({ id: customerId })
      : Promise.resolve(),
    customerId
      ? utils.nexo.whatsapp.messages.invalidate({ customerId })
      : Promise.resolve(),
    utils.nexo.serviceOrders.list.invalidate(),
    serviceOrderId
      ? utils.nexo.serviceOrders.getById.invalidate({ id: serviceOrderId })
      : Promise.resolve(),
    utils.finance.charges.list.invalidate(),
    utils.finance.charges.stats.invalidate(),
    utils.nexo.timeline.listByOrg.invalidate(),
    utils.dashboard.kpis.invalidate(),
    utils.dashboard.alerts.invalidate(),
    utils.governance.summary.invalidate(),
    utils.governance.runs.invalidate(),
  ]);
}
