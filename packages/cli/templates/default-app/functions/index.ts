import type { AnyTangoFunction } from '@tango-ts/functions'

// Internal serverless functions for this app. They are never exposed as API
// routes — they can only be invoked from inside Tango logic with
// `fn.invoke(payload)` (awaited, typed result) or `fn.defer(payload)`
// (fire-and-forget). Locally they run in-process; on Vercel each invocation
// runs as its own function invocation via a signed internal channel
// (requires TANGO_FUNCTIONS_SECRET).
//
// Define one function per file and list it here:
//
//   import { defineFunction } from '@tango-ts/functions'
//
//   export const sendWelcomeEmail = defineFunction({
//     name: 'sendWelcomeEmail',
//     handler: async (payload: { userId: number }) => {
//       // Model.objects works here — no setup needed.
//     }
//   })
//
// The list is registered on the app in app.ts (`defineApp({ ..., functions })`).
export const functions: readonly AnyTangoFunction[] = []
