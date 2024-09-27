import { Context, Session, z } from 'koishi'
import { SubscriptionRules } from 'koishi-plugin-w-subscribe'

export const name = 'w-subscribe-common'

export const inject = [ 'subscribe' ]

export interface Config {}

declare module 'koishi-plugin-w-subscribe' {
    interface SubscriptionRules {
        common: Logic<
            | { type: 'senderIs', id: string }
            | { type: 'includes', content: string }
        >
    }
}

declare global {
    namespace Schemastery {
        interface Static {
            new <S = any, T = S>(options: Partial<z<S, T>>): z<S, T>
            lazy<S, T>(builder: () => z<S, T>): z<S, T>
        }
    }
    interface Schemastery<S, T> {
        builder?: () => z<S, T>
    }
}

z.lazy = <S, T>(builder: () => z<S, T>): z<S, T> => new z<S, T>({ type: 'lazy', builder })
z.extend('lazy', (data, { builder }, options, strict) => z.resolve(data, builder(), options, strict))

export const Config: z<Config> = z.object({})

export type Logic<T> =
    | { type: 'is', filter: T }
    | { type: 'not', filter: Logic<T> }
    | { type: 'and', filters: Logic<T>[] }
    | { type: 'or', filters: Logic<T>[] }

export const zLogic = <S, T>(schema: z<S, T>): z<Logic<S>, Logic<T>> => {
    const zSelf = z.lazy<Logic<S>, Logic<T>>(() => z.union([
        z.object({ type: z.const('is').required(), filter: schema.required() }),
        z.object({ type: z.const('not').required(), filter: zSelf.required() }),
        z.object({ type: z.const('and').required(), filters: z.array(zSelf).required() }),
        z.object({ type: z.const('or').required(), filters: z.array(zSelf).required() }),
    ]))
    return zSelf
}

export const compileFilter = (config: SubscriptionRules['common']): (session: Session) => boolean => {
    if (config.type === 'not') return session => ! compileFilter(config.filter)(session)
    if (config.type === 'and') return session => config.filters.every(child => compileFilter(child)(session))
    if (config.type === 'or') return session => config.filters.some(child => compileFilter(child)(session))
    if (config.type === 'is') return session => {
        const { filter } = config
        if (filter.type === 'senderIs') return session.uid === filter.id
        if (filter.type === 'includes') return session.content.includes(filter.content)
    }
    return () => true
}

export function apply(ctx: Context) {
    const { dispose } = ctx.subscribe.rule('common', {
        filter: (session, config) => compileFilter(config)(session),
        render: (_session, msg) => msg.content,
        schema: zLogic(z.union([
            z.object({ type: z.const('senderIs').required(), id: z.string().required() }),
            z.object({ type: z.const('includes').required(), content: z.string().required() })
        ]))
    })

    ctx.on('dispose', dispose)
}
