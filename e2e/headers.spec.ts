import { expect, test } from "@playwright/test";

/** Security headers go out on pages and on generated images alike. */
for (const path of ["/login", "/manifest.webmanifest", "/opengraph-image"]) {
  test(`${path} carries the security headers`, async ({ request }) => {
    const response = await request.get(path);
    expect(response.ok()).toBe(true);

    const headers = response.headers();
    expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(headers["content-security-policy-report-only"]).toContain("default-src 'self'");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["permissions-policy"]).toContain("camera=()");
    expect(headers["x-powered-by"]).toBeUndefined();
  });
}
