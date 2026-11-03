import { expect, it } from "vitest";
import { collectCrmLeadPages } from "../lib/crmLeadPages";

it("loads older completed purchases after 500 new cards", async () => {
  const cards = Array.from({ length: 632 }, (_, id) => ({ id, status: id === 631 ? "compra_concluida" : "novo" }));
  const ranges: number[][] = [];
  const result = await collectCrmLeadPages(async (from, to) => {
    ranges.push([from, to]);
    return cards.slice(from, to + 1);
  });
  expect(ranges).toEqual([[0, 499], [500, 999]]);
  expect(result).toHaveLength(632);
  expect(result.find((c) => c.id === 631)?.status).toBe("compra_concluida");
});