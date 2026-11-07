import type { Context } from '@deepseek-ai/cordis'

export type LooseListener = (...args: never[]) => unknown

/**
 * Register a listener on a pre-stable, stringly-named harness event without
 * depending on its typed declaration; payloads are validated at the listener.
 */
export function onLoose(ctx: Context, name: string, listener: LooseListener): () => void {
  return (ctx.on as unknown as (event: string, listener: LooseListener) => () => void)(name, listener)
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}
