import { describe, expect, it } from "vitest";
import { supabase } from "@/integrations/supabase/client";

describe("NeuroAcesso recurring publication", () => {
  it("allows Monday through Friday, excluding Saturday and Sunday", async () => {
    for (const [date, allowed] of [["2026-11-09", true], ["2026-11-13", true], ["2026-11-14", false], ["2026-11-15", false]] as const) {
      const { data, error } = await supabase.rpc("neuroacesso_horario_permitido", { p_inicio: `${date}T14:00:00-03:00`, p_fim: `${date}T15:00:00-03:00` });
      expect(error).toBeNull(); expect(data).toBe(allowed);
    }
  });
  it("allows meetings only between 14:00 and 19:00 Brasília", async () => {
    for (const [start, end, allowed] of [["13:59", "15:00", false], ["14:00", "15:00", true], ["18:00", "19:00", true], ["18:00", "19:01", false]] as const) {
      const { data, error } = await supabase.rpc("neuroacesso_horario_permitido", { p_inicio: `2026-11-11T${start}:00-03:00`, p_fim: `2026-11-11T${end}:00-03:00` });
      expect(error).toBeNull(); expect(data).toBe(allowed);
    }
  });
});