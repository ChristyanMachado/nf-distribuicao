import { describe, expect, it } from "vitest";
import { urlHttpsSegura } from "./urls";

describe("urlHttpsSegura", () => {
  it("aceita URLs HTTPS absolutas", () => {
    expect(urlHttpsSegura("https://storage.example/nota.pdf?token=abc")).toBe(
      "https://storage.example/nota.pdf?token=abc",
    );
  });

  it.each(["javascript:alert(1)", "data:text/html,x", "http://example.test/x", "/arquivo.pdf", "invalida"])(
    "rejeita destino não seguro: %s",
    (valor) => expect(urlHttpsSegura(valor)).toBeNull(),
  );
});
