import z from '@deepseek-ai/schemastery'

/** How much of an event's content travels through Expo's push relay. */
export type CompanionContentMode = 'generic' | 'detailed'

export interface Config {
  /** Expo project id the mobile app registers against (from your Expo account). */
  readonly expoProjectId: string
  /** Expo access token; falls back to DSH_COMPANION_EXPO_ACCESS_TOKEN. */
  readonly expoAccessToken: string
  /** Bearer token the mobile app authenticates with; falls back to DSH_COMPANION_TOKEN. */
  readonly companionToken: string
  /** `generic` keeps event content off Expo's relay; `detailed` includes titles/bodies. */
  readonly contentMode: string
  /** Hold requests no other answerer claims, so the phone can answer them. */
  readonly holdUnanswered: boolean
  /** How long a held request waits for the phone before failing closed. */
  readonly holdTimeoutMs: number
  readonly notifyQuestions: boolean
  readonly notifyApprovals: boolean
  readonly notifyTurnComplete: boolean
}

export const Config: z<Config> = z.object({
  expoProjectId: z.string().default(''),
  expoAccessToken: z.string().default(''),
  companionToken: z.string().default(''),
  contentMode: z.string().default('generic'),
  holdUnanswered: z.boolean().default(true),
  holdTimeoutMs: z.natural().max(86_400_000).default(600_000),
  notifyQuestions: z.boolean().default(true),
  notifyApprovals: z.boolean().default(true),
  notifyTurnComplete: z.boolean().default(false),
})

export type ResolvedConfig = Omit<Required<Config>, 'contentMode'> & { readonly contentMode: CompanionContentMode }

export function resolveConfig(config: Config): ResolvedConfig {
  const env = process.env
  const contentMode = config.contentMode === 'detailed' ? 'detailed' : 'generic'
  return {
    expoProjectId: config.expoProjectId,
    expoAccessToken: config.expoAccessToken || env.DSH_COMPANION_EXPO_ACCESS_TOKEN || '',
    companionToken: config.companionToken || env.DSH_COMPANION_TOKEN || '',
    contentMode,
    holdUnanswered: config.holdUnanswered,
    holdTimeoutMs: config.holdTimeoutMs,
    notifyQuestions: config.notifyQuestions,
    notifyApprovals: config.notifyApprovals,
    notifyTurnComplete: config.notifyTurnComplete,
  }
}
