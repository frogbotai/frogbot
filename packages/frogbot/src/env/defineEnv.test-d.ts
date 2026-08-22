import { expectTypeOf } from 'vitest'

import { env } from './builders.js'
import { defineEnv } from './defineEnv.js'

const service = defineEnv({
  enabled: env.boolean().default(false),
  level: env.enum(['info', 'error']),
  port: env.number().required(),
  secret: env.string(),
})

expectTypeOf(service.enabled).toEqualTypeOf<boolean>()
expectTypeOf(service.level).toEqualTypeOf<'info' | 'error' | undefined>()
expectTypeOf(service.port).toEqualTypeOf<number>()
expectTypeOf(service.secret).toEqualTypeOf<string | undefined>()
