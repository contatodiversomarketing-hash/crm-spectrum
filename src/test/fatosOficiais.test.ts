import { describe, it, expect } from "vitest";
import { montarBlocoFatosOficiais, separarFatosOficiais } from "../../supabase/functions/_shared/fatos-oficiais";

describe("fatos oficiais da Ana", () => {
  const itens = [
    { titulo: "Valor consulta", instrucao: "R$ 600 com retorno", categoria: "fatos_oficiais" },
    { titulo: "Tom", instrucao: "Acolhedor", categoria: "atendimento" },
  ];
  it("separa só os fatos oficiais", () => {
    const { fatos, demais } = separarFatosOficiais(itens);
    expect(fatos.map((f) => f.titulo)).toEqual(["Valor consulta"]);
    expect(demais.map((f) => f.titulo)).toEqual(["Tom"]);
  });
  it("sem fatos não gera bloco", () => {
    expect(montarBlocoFatosOficiais([])).toBe("");
  });
  it("bloco contém o fato e a regra de não inventar", () => {
    const b = montarBlocoFatosOficiais(separarFatosOficiais(itens).fatos);
    expect(b).toContain("R$ 600 com retorno");
    expect(b).toContain("Nunca invente");
    expect(b).not.toContain("Acolhedor");
  });
});
