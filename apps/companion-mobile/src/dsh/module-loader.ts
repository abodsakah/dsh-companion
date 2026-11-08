/**
 * Minimal React Native implementation of DSH's `window.__ModuleLoader__`
 * contract. DSH client bundles register factories through
 * `window.__ModuleLoader__.load({ id, factory })`; in the web shell the
 * client-modules system materializes them. Here, factories materialize on
 * demand: wrapped packages resolve through the registration table, and
 * non-wrapped externals (cordis, cosmokit, zod, …) through Metro's require.
 */

type FactoryRequire = (spec: string) => unknown
type Factory = (require: FactoryRequire) => unknown

interface Registration {
  readonly id: string
  readonly factory: Factory
  readonly external?: readonly string[]
  readonly rev?: string
}

const registrations = new Map<string, Registration>()
const exportsTable = new Map<string, unknown>()
const materializing = new Set<string>()

function stripClientSuffix(spec: string): string {
  return spec.endsWith('/client') ? spec.slice(0, -'/client'.length) : spec
}

const externals: Record<string, () => unknown> = {
  '@deepseek-ai/cordis': () => require('@deepseek-ai/cordis'),
  '@deepseek-ai/cosmokit': () => require('@deepseek-ai/cosmokit'),
  '@deepseek-ai/schemastery': () => require('@deepseek-ai/schemastery'),
  zod: () => require('zod'),
  'zustand/vanilla': () => require('zustand/vanilla'),
  'zustand/middleware': () => require('zustand/middleware'),
  'zustand/shallow': () => require('zustand/shallow'),
  immer: () => require('immer'),
  '@deepseek-ai/dsh-client-store': () => require('@deepseek-ai/dsh-client-store'),
  '@deepseek-ai/dsh-deque': () => require('@deepseek-ai/dsh-deque'),
  '@deepseek-ai/dsh-brand': () => require('@deepseek-ai/dsh-brand'),
  '@deepseek-ai/dsh-timeout': () => require('@deepseek-ai/dsh-timeout'),
  '@deepseek-ai/dsh-util-crypto': () => require('@deepseek-ai/dsh-util-crypto'),
  '@deepseek-ai/dsh-scope': () => require('@deepseek-ai/dsh-scope'),
}

function dshRequire(spec: string): unknown {
  const external = externals[spec]
  if (external !== undefined) return external()
  const id = stripClientSuffix(spec)
  if (exportsTable.has(id)) return exportsTable.get(id)
  if (registrations.has(id)) return materialize(id)
  throw new Error(
    `dsh module-loader: cannot resolve ${JSON.stringify(spec)} — not a known external and not registered `
    + `(registered: ${[...registrations.keys()].join(', ')})`,
  )
}

function materialize(id: string): unknown {
  const existing = exportsTable.get(id)
  if (existing !== undefined) return existing
  if (materializing.has(id)) throw new Error(`dsh module-loader: require cycle through ${JSON.stringify(id)}`)
  const registration = registrations.get(id)
  if (registration === undefined) throw new Error(`dsh module-loader: no registered factory for ${JSON.stringify(id)}`)
  materializing.add(id)
  try {
    const exports = registration.factory(dshRequire)
    exportsTable.set(id, exports)
    return exports
  } finally {
    materializing.delete(id)
  }
}

/** Materialize one wrapped package's exports by id (a `/client` suffix is stripped). */
export function dshExports<T>(id: string): T {
  const value = materialize(stripClientSuffix(id))
  if (value === undefined) throw new Error(`dsh module-loader: ${JSON.stringify(id)} materialized to undefined exports`)
  return value as T
}

const queue: Registration[] = []
;(globalThis as unknown as Record<string, unknown>).__ModuleLoader__ = {
  mode: 'queue',
  pendingQueue: queue,
  load(registration: Registration): void {
    queue.push(registration)
    registrations.set(registration.id, registration)
  },
  create(): never {
    throw new Error('dsh module-loader: create() is not supported in the native app')
  },
}
