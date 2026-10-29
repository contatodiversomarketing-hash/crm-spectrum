// Each backend invocation has a hard ~150s wall clock, so long reports are written in
// chained steps: every step stops before the limit, saves what it wrote and hands off.
export const STEP_BUDGET_MS = 110_000;
export const MAX_WRITE_HOPS = 5;
export const STALE_JOB_MS = 4 * 60 * 1000;

export type WriteOutcome =
  | { kind: "finish"; texto: string }
  | { kind: "continue"; parcial: string; hops: number };

/** Decide what happens after a writing step ended (completed or stopped by the time budget). */
export function afterWriteStep(prev: { parcial: string; hops: number }, step: { text: string; completed: boolean }): WriteOutcome {
  const parcial = prev.parcial + step.text;
  if (step.completed) return { kind: "finish", texto: parcial.trim() };
  const hops = prev.hops + 1;
  // Out of budget: deliver what exists instead of losing the whole report.
  if (hops >= MAX_WRITE_HOPS && parcial.trim()) return { kind: "finish", texto: parcial.trim() };
  return { kind: "continue", parcial, hops };
}

/** A job whose chain died (no update for a few minutes) must not keep the UI waiting forever. */
export function isStaleJob(job: { status: string; atualizado_em: string }, now = Date.now()): boolean {
  if (job.status !== "pesquisando" && job.status !== "redigindo") return false;
  return now - new Date(job.atualizado_em).getTime() > STALE_JOB_MS;
}
