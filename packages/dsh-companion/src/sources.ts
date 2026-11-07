import type { Context } from '@deepseek-ai/cordis'
import type { CompanionAction, CompanionEvent, CompanionPendingItem } from '@dsh-companion/protocol'
import type { CompanionBus } from './bus.js'
import type { ResolvedConfig } from './config.js'
import { HeldRegistry, TEXT_ACTION_ID, type HeldAnswerOf } from './hold.js'
import { isRecord, onLoose, optionalString } from './loose-events.js'

interface QuestionOptionView {
  readonly label: string
  readonly description?: string
}

interface QuestionView {
  readonly id: string
  readonly question: string
  readonly header?: string
  readonly detail?: string
  readonly options: readonly QuestionOptionView[]
  readonly multiSelect: boolean
  readonly intent?: { readonly kind: 'approval' | 'plan-review'; readonly approve?: string; readonly reject?: string }
}

interface QuestionRequestView {
  readonly questions: readonly QuestionView[]
  readonly signal?: AbortSignal
}

interface ApprovalRequestView {
  readonly toolName?: string
  readonly reason?: string
  readonly signal?: AbortSignal
}

function parseQuestionRequest(payload: unknown): QuestionRequestView | undefined {
  if (!isRecord(payload)) return undefined
  const rawQuestions = payload.questions
  if (!Array.isArray(rawQuestions)) return undefined
  const questions: QuestionView[] = []
  for (const raw of rawQuestions) {
    if (!isRecord(raw)) return undefined
    const id = optionalString(raw.id)
    const question = optionalString(raw.question)
    if (id === undefined || question === undefined) return undefined
    const rawOptions = Array.isArray(raw.options) ? raw.options : []
    const options: QuestionOptionView[] = []
    for (const rawOption of rawOptions) {
      if (!isRecord(rawOption)) return undefined
      const label = optionalString(rawOption.label)
      if (label === undefined) return undefined
      options.push({ label, ...(optionalString(rawOption.description) === undefined ? {} : { description: optionalString(rawOption.description) }) })
    }
    const intent = isRecord(raw.intent) && (raw.intent.kind === 'approval' || raw.intent.kind === 'plan-review')
      ? { kind: raw.intent.kind as 'approval' | 'plan-review', ...optionalString(raw.intent.approve) === undefined ? {} : { approve: optionalString(raw.intent.approve) }, ...optionalString(raw.intent.reject) === undefined ? {} : { reject: optionalString(raw.intent.reject) } }
      : undefined
    questions.push({
      id,
      question,
      ...optionalString(raw.header) === undefined ? {} : { header: optionalString(raw.header) },
      ...optionalString(raw.detail) === undefined ? {} : { detail: optionalString(raw.detail) },
      options,
      multiSelect: raw.multiSelect === true,
      ...intent === undefined ? {} : { intent },
    })
  }
  const signal = isRecord(payload.signal) && typeof payload.signal.aborted === 'boolean' ? payload.signal as unknown as AbortSignal : undefined
  return { questions, ...signal === undefined ? {} : { signal } }
}

function parseApprovalRequest(payload: unknown): ApprovalRequestView | undefined {
  if (!isRecord(payload)) return undefined
  return {
    ...optionalString(payload.toolName) === undefined ? {} : { toolName: optionalString(payload.toolName) },
    ...optionalString(payload.reason) === undefined ? {} : { reason: optionalString(payload.reason) },
    ...isRecord(payload.signal) && typeof payload.signal.aborted === 'boolean' ? { signal: payload.signal as unknown as AbortSignal } : {},
  }
}

function isNoProvider(error: unknown): boolean {
  if (!isRecord(error)) return false
  if (error.code === 'NO_PROVIDER') return true
  const message = optionalString(error.message) ?? ''
  return message.includes('no user-questions answerer')
}

function actionsOfQuestion(question: QuestionView): CompanionAction[] {
  if (question.options.length === 0) {
    return [{ id: TEXT_ACTION_ID, label: 'Answer with text', style: 'text' }]
  }
  return question.options.map((option): CompanionAction => {
    const intent = question.intent
    const style = intent?.kind === 'approval'
      ? option.label === intent.approve ? 'approve'
        : option.label === intent.reject ? 'reject'
          : 'default'
      : 'default'
    return {
      id: option.label,
      label: option.label,
      style,
      ...option.description === undefined ? {} : { description: option.description },
    }
  })
}

function questionEventOf(question: QuestionView, pendingId: string): CompanionEvent {
  return {
    kind: 'question',
    title: question.header ?? 'Question',
    body: question.question,
    actions: actionsOfQuestion(question),
    data: { questionId: question.id },
    pendingId,
  }
}

function approvalEventOf(request: ApprovalRequestView, pendingId: string): CompanionEvent {
  return {
    kind: 'approval',
    title: `Permission${request.toolName === undefined ? '' : `: ${request.toolName}`}`,
    body: request.reason,
    actions: [
      { id: 'approve', label: 'Approve', style: 'approve' },
      { id: 'reject', label: 'Reject', style: 'reject' },
    ],
    pendingId,
  }
}

const APPROVAL_ACTIONS: readonly CompanionAction[] = [
  { id: 'approve', label: 'Approve', style: 'approve' },
  { id: 'reject', label: 'Reject', style: 'reject' },
]

function sessionLabelOf(session: unknown): string | undefined {
  return optionalString((isRecord(session) ? session.label : undefined))
    ?? optionalString((isRecord(session) ? session.title : undefined))
    ?? optionalString((isRecord(session) ? session.name : undefined))
    ?? optionalString((isRecord(session) ? session.id : undefined))
}

/** Attach every companion event source; each is append-only and fails soft. */
export function registerSources(ctx: Context, config: ResolvedConfig, bus: CompanionBus, held: HeldRegistry): void {
  onLoose(ctx, 'user-questions/request', async (payload: unknown, next: () => Promise<unknown>): Promise<unknown> => {
    const request = parseQuestionRequest(payload)
    if (request === undefined || !config.holdUnanswered || request.questions.length !== 1) return next()
    const question = request.questions[0]
    if (question === undefined || question.multiSelect) return next()
    try {
      return await next()
    } catch (error) {
      if (!isNoProvider(error)) throw error
      const answerOf: HeldAnswerOf = (actionId, text) => actionId === TEXT_ACTION_ID
        ? { answers: [{ id: question.id, selected: [], custom: text ?? '' }] }
        : { answers: [{ id: question.id, selected: [actionId] }] }
      const item: Omit<CompanionPendingItem, 'pendingId' | 'createdAt'> = {
        kind: 'question',
        title: question.header ?? question.question,
        ...question.detail === undefined ? {} : { detail: question.detail },
        options: actionsOfQuestion(question),
      }
      const { pendingId, promise } = held.hold(item, answerOf, config.holdTimeoutMs)
      if (request.signal !== undefined) {
        const onAbort = (): void => {
          held.cancel(pendingId, new Error('dsh-companion: question aborted'))
        }
        if (request.signal.aborted) {
          held.cancel(pendingId, new Error('dsh-companion: question aborted'))
        } else {
          request.signal.addEventListener('abort', onAbort, { once: true })
        }
      }
      void bus.notify(questionEventOf(question, pendingId))
      return promise
    }
  })

  onLoose(ctx, 'approval/request', async (payload: unknown, next: () => Promise<unknown>): Promise<unknown> => {
    const request = parseApprovalRequest(payload)
    if (request === undefined || !config.holdUnanswered) return next()
    const outcome = await next()
    if (outcome !== 'unavailable') return outcome
    const answerOf: HeldAnswerOf = (actionId) => actionId === 'approve' ? 'allowed-once' : 'rejected'
    const item: Omit<CompanionPendingItem, 'pendingId' | 'createdAt'> = {
      kind: 'approval',
      title: `Permission${request.toolName === undefined ? '' : `: ${request.toolName}`}`,
      ...request.reason === undefined ? {} : { detail: request.reason },
      options: APPROVAL_ACTIONS,
    }
    const { pendingId, promise } = held.hold(item, answerOf, config.holdTimeoutMs)
    if (request.signal !== undefined) {
      const onAbort = (): void => {
        held.cancel(pendingId, new Error('dsh-companion: approval aborted'))
      }
      if (request.signal.aborted) {
        held.cancel(pendingId, new Error('dsh-companion: approval aborted'))
      } else {
        request.signal.addEventListener('abort', onAbort, { once: true })
      }
    }
    void bus.notify(approvalEventOf(request, pendingId))
    return promise
  })

  if (config.notifyTurnComplete) {
    onLoose(ctx, 'session/event', (session: unknown, event: unknown): void => {
      if (!isRecord(event) || event.type !== 'turn/end') return
      const label = sessionLabelOf(session)
      void bus.notify({
        kind: 'turn-complete',
        title: 'Turn finished',
        body: label === undefined ? undefined : `Session: ${label}`,
        ...label === undefined ? {} : { sessionLabel: label },
      })
    })
  }

  ctx.on('companion/notify', (event) => {
    void bus.notify(event)
  })
}
