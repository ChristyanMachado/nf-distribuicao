import { describe, expect, it } from "vitest";
import manifest from "./manifest";

describe("manifesto de instalação", () => {
  it("declara uma instalação standalone com os ícones públicos da Graalyst", () => {
    const resultado = manifest();

    expect(resultado.display).toBe("standalone");
    expect(resultado.start_url).toBe("/");
    expect(resultado.icons).toEqual([
      expect.objectContaining({
        src: "/brand/graalyst-icon-192-v1.png",
        sizes: "192x192",
        type: "image/png",
      }),
      expect.objectContaining({
        src: "/brand/graalyst-icon-512-v1.png",
        sizes: "512x512",
        type: "image/png",
      }),
    ]);
  });

  it("não inclui campos que quebram a rota de manifesto em produção", () => {
    expect(manifest()).not.toHaveProperty("id");
  });
});
