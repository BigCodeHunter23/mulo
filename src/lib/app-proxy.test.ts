import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { appApiProxy, isAppApi } from "./app-proxy";

const at = (path: string, init?: ConstructorParameters<typeof NextRequest>[1]) =>
  new NextRequest(`https://mulo.test${path}`, init);

describe("isAppApi", () => {
  it.each(["/api/app/v1/me", "/api/app/v1/albums/x"])("%s is the app's", (path) => {
    expect(isAppApi(path)).toBe(true);
  });

  it.each(["/api/search", "/api/application", "/album/x", "/"])("%s isn't", (path) => {
    expect(isAppApi(path)).toBe(false);
  });
});

describe("appApiProxy", () => {
  it("answers a preflight itself", () => {
    const response = appApiProxy(at("/api/app/v1/ratings", { method: "OPTIONS" }));
    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(response.headers.get("access-control-allow-headers")).toMatch(/Authorization/);
    expect(response.headers.get("access-control-allow-methods")).toMatch(/DELETE/);
  });

  it("lets any origin read the answer", () => {
    const response = appApiProxy(at("/api/app/v1/me"));
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("drops cookies, so only a bearer token can sign a request in", () => {
    const request = at("/api/app/v1/ratings", {
      method: "POST",
      headers: { cookie: "sb-access-token=stolen" },
    });
    appApiProxy(request);
    expect(request.cookies.getAll()).toEqual([]);
    expect(request.headers.get("cookie") ?? "").toBe("");
  });
});
