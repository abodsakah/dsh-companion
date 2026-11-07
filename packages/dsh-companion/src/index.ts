import { homedir } from 'node:os'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { Config, resolveConfig, type ResolvedConfig } from './config.js'
import { CompanionBus } from './bus.js'
import { DeviceRegistry } from './devices.js'
import { HeldRegistry } from './hold.js'
import { registerRoutes } from './routes.js'
import { registerSources } from './sources.js'

export const name = 'dsh-companion'
export const inject = ['webServer']
export { Config }

export interface ProfileContextLike {
  readonly dir?: string
}

function storeDir(ctx: Context): string {
  const profile = (ctx as unknown as { profileContext?: ProfileContextLike }).profileContext
  return profile?.dir !== undefined ? join(profile.dir, 'dsh-companion') : join(homedir(), '.dsh-companion')
}

export function apply(ctx: Context, config: unknown): void {
  const resolved: ResolvedConfig = resolveConfig(Config((config ?? {}) as never))
  if (resolved.expoProjectId === '' && resolved.expoAccessToken === '') {
    ctx.logger('dsh-companion').warn('neither expoProjectId nor expoAccessToken is configured; pushes will not deliver')
  }
  const devices = new DeviceRegistry(storeDir(ctx))
  const held = new HeldRegistry()
  const bus = new CompanionBus(ctx, devices, resolved)
  registerSources(ctx, resolved, bus, held)
  registerRoutes(ctx, resolved, devices, held, bus)
}
