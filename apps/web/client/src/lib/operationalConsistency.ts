type UtilsLike = any;

export async function invalidateOperationalGraph(
  utils: UtilsLike,
  customerId?: string | null,
  serviceOrderId?: string | null
) {
  await Promise.all([
    utils.customers.list.invalidate(),
    utils.appointments.list.invalidate(),
    customerId
      ? utils.customers.getById.invalidate({ id: customerId })
      : Promise.resolve(),
    customerId
      ? utils.customers.workspace.invalidate({ id: customerId })
      : Promise.resolve(),
    customerId
      ? utils.whatsapp.messages.invalidate({ customerId })
      : Promise.resolve(),
    utils.serviceOrders.list.invalidate(),
    serviceOrderId
      ? utils.serviceOrders.getById.invalidate({ id: serviceOrderId })
      : Promise.resolve(),
    utils.finance.charges.list.invalidate(),
    utils.finance.charges.stats.invalidate(),
    utils.timeline.listByOrg.invalidate(),
    utils.dashboard.kpis.invalidate(),
    utils.dashboard.alerts.invalidate(),
    utils.governance.summary.invalidate(),
    utils.governance.runs.invalidate(),
  ]);
}
