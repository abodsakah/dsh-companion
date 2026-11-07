import type { Context } from '@deepseek-ai/cordis'
import type { CompanionEvent } from '@dsh-companion/protocol'
import { sendExpoPush, type ExpoPushReport } from './expo.js'
import type { DeviceRegistry } from './devices.js'
import type { ResolvedConfig } from './config.js'

declare module '@deepseek-ai/cordis' {
  interface Events {
    /**
     * One companion event travelling to the registered devices. Any plugin can
     * emit it; the bus fans it out as push notifications.
     * @param event - the event to dispatch.
     * @mode emit
     */
    'companion/notify'(event: CompanionEvent): void
  }
}

const GENERIC_BODIES: Readonly<Record<string, string>> = {
  question: 'A question needs your answer',
  approval: 'A permission request needs your decision',
  'turn-complete': 'A turn finished',
  custom: 'New companion event',
}

export interface CompanionDispatch extends ExpoPushReport {
  readonly devices: number
}

/**
 * The general notification bus. Deliberately NOT a Cordis Service: the plugin
 * must not construct classes from its own cordis copy, because a profile-linked
 * dev workspace resolves a second cordis instance next to the host's.
 * Reach it via the `companion/notify` event instead.
 */
export class CompanionBus {
  private readonly devices: DeviceRegistry
  private readonly config: ResolvedConfig
  private readonly log: (message: string) => void

  constructor(ctx: Context, devices: DeviceRegistry, config: ResolvedConfig) {
    this.devices = devices
    this.config = config
    this.log = (message: string) => { ctx.logger('dsh-companion').info(message) }
  }

  /** Push one event to every registered device; never throws to the caller. */
  async notify(event: CompanionEvent): Promise<CompanionDispatch> {
    const list = await this.devices.list()
    if (list.length === 0) return { devices: 0, sent: 0, failures: [] }
    const detailed = this.config.contentMode === 'detailed'
    const title = detailed ? event.title : 'DeepSeek Harness'
    const body = detailed
      ? event.body ?? GENERIC_BODIES[event.kind] ?? GENERIC_BODIES.custom
      : GENERIC_BODIES[event.kind] ?? GENERIC_BODIES.custom
    const report = await sendExpoPush(
      list.map(device => device.token),
      {
        title,
        body,
        sound: 'default',
        ...(event.kind === 'approval' || event.kind === 'question' ? { categoryId: 'companion.pending' } : {}),
        data: { dshCompanion: event },
      },
      this.config.expoAccessToken,
    ).catch((error: unknown) => {
      this.log(`push delivery failed: ${String(error)}`)
      return { sent: 0, failures: [String(error)] } satisfies ExpoPushReport
    })
    for (const failure of report.failures) this.log(`push failure: ${failure}`)
    return { devices: list.length, ...report }
  }
}
