import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  countUnreadOperationalNotifications,
  listOperationalNotifications,
  markNotificationAsRead,
} from "./operationalNotifications";

const source = {
  user: {
    token: "token-notifications",
  },
};

describe("operational notifications API paths", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("usa a base /v1 uma única vez nas rotas de notificações", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            items: [],
            total: 0,
            page: 1,
            pages: 1,
            unreadCount: 0,
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ unreadCount: 0 }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true }), { status: 200 }),
      );

    await listOperationalNotifications(source, {
      limit: 6,
      page: 1,
      category: "all",
    });

    await countUnreadOperationalNotifications(source);
    await markNotificationAsRead(
      source,
      "11111111-1111-4111-8111-111111111111",
    );

    const urls = fetchSpy.mock.calls.map(([url]) => String(url));

    expect(urls[0]).toBe(
      "http://127.0.0.1:3000/v1/notifications?limit=6&page=1&category=all",
    );
    expect(urls[1]).toBe(
      "http://127.0.0.1:3000/v1/notifications/unread-count",
    );
    expect(urls[2]).toBe(
      "http://127.0.0.1:3000/v1/notifications/11111111-1111-4111-8111-111111111111/read",
    );

    expect(urls.every(url => !url.includes("/v1/v1/"))).toBe(true);
  });
});
