import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("visibilidade da autenticação", () => {
  it("não oculta o contêiner que contém o próprio formulário de login", () => {
    const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

    expect(css).not.toMatch(/body:has\(\.login-screen\) \.app-shell\s*,/);
    expect(css).toContain("body:has(.login-screen) .app-shell > aside");
    expect(css).toContain("body:has(.login-screen) .app-shell > header");
  });
});
