import { describe, expect, it } from "vitest";
import {
  resolveAppBootstrapGuardBranch,
  type AppBootstrapState,
} from "./AppBootstrapGuard";
import { isPublicOrAuthPath } from "@/lib/routeAccess";

describe("AppBootstrapGuard", () => {
  it("mantém estados de bootstrap explícitos", () => {
    const states: AppBootstrapState[] = [
      "validating",
      "unauthenticated",
      "authenticated",
      "degraded",
      "error",
    ];

    expect(states).toEqual([
      "validating",
      "unauthenticated",
      "authenticated",
      "degraded",
      "error",
    ]);
  });

  it("nunca bloqueia rotas públicas/auth durante initializing", () => {
    const publicPaths = ["/", "/login", "/register", "/forgot-password", "/auth/callback"];

    publicPaths.forEach(pathname => {
      expect(isPublicOrAuthPath(pathname)).toBe(true);
      expect(
        resolveAppBootstrapGuardBranch({
          state: "validating",
          isPublicBootstrapPath: true,
        })
      ).toBe("pass_through");
    });
  });

  it("bloqueia erro e degradação em rota privada", () => {
    expect(
      resolveAppBootstrapGuardBranch({
        state: "error",
        isPublicBootstrapPath: false,
      })
    ).toBe("blocking_error");

    expect(
      resolveAppBootstrapGuardBranch({
        state: "degraded",
        isPublicBootstrapPath: false,
      })
    ).toBe("blocking_degraded");

    expect(
      resolveAppBootstrapGuardBranch({
        state: "degraded",
        isPublicBootstrapPath: true,
      })
    ).toBe("pass_through");
  });
});
