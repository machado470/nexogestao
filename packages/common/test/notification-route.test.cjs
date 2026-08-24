const test = require("node:test");
const assert = require("node:assert/strict");

const {
  notificationRoutes,
  isSafeNotificationRouteHint,
} = require("../dist/notification-route.js");

test("builds canonical customer and service-order notification routes", () => {
  assert.equal(
    notificationRoutes.customer("customer-123"),
    "/customers?customerId=customer-123"
  );

  assert.equal(
    notificationRoutes.serviceOrder("os/123"),
    "/service-orders?id=os%2F123"
  );
});

test("rejects empty notification route identifiers", () => {
  assert.throws(
    () => notificationRoutes.customer("   "),
    /identificador da rota de notificação é obrigatório/
  );
});

test("accepts only declared internal notification routes", () => {
  assert.equal(
    isSafeNotificationRouteHint("/customers?customerId=customer-123"),
    true
  );

  assert.equal(
    isSafeNotificationRouteHint("/service-orders?id=os-123"),
    true
  );
});

test("rejects unsafe or malformed notification routes", () => {
  const invalid = [
    "",
    "customers?customerId=1",
    "//evil.example/customers?customerId=1",
    "https://evil.example/customers?customerId=1",
    "/unknown?id=1",
    "/customers",
    "/customers?customerId=",
    "/customers?customerId=%20",
    "/customers?customerId=1&extra=2",
    "/customers?customerId=1&customerId=2",
    "/customers?customerId=1#fragment",
    "/customers/../admin?customerId=1",
    "/customers/%2E%2E/admin?customerId=1",
    "/customers?customerId=%E0%A4%A",
    "/customers\\evil?customerId=1",
  ];

  for (const value of invalid) {
    assert.equal(
      isSafeNotificationRouteHint(value),
      false,
      `expected unsafe route to be rejected: ${value}`
    );
  }
});
