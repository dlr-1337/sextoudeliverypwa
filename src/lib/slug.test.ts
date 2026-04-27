import { describe, expect, it } from "vitest";
import { slugify } from "./slug";

describe("slugify", () => {
  it("normalizes Portuguese accents and cedilla", () => {
    expect(slugify("Açaí, Pão de Queijo e Café"))
      .toBe("acai-pao-de-queijo-e-cafe");
  });

  it("removes punctuation and trims repeated separators", () => {
    expect(slugify("  Sextou!!! Delivery???  ")).toBe("sextou-delivery");
  });

  it("collapses duplicate whitespace into one dash", () => {
    expect(slugify("Combo     de\tPetiscos\nEspeciais")).toBe(
      "combo-de-petiscos-especiais",
    );
  });

  it("returns a stable fallback for blank or punctuation-only input", () => {
    expect(slugify("")).toBe("sem-titulo");
    expect(slugify("   !!! ---   ")).toBe("sem-titulo");
  });

  it("keeps output lower-case and supports custom fallback text", () => {
    expect(slugify("BEBIDAS GELADAS")).toBe("bebidas-geladas");
    expect(slugify("***", "categoria")).toBe("categoria");
  });
});
