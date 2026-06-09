import { spawn, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const BIN = resolve('packages/cli/dist/main.js')

const HANDLER_SOURCE = `let disposed = false
async function handler(request) {
  const url = new URL(request.url)
  if (url.pathname === '/disposed/') {
    return Response.json({ disposed })
  }
  return Response.json({ ok: true })
}
handler.dispose = async () => {
  disposed = true
  console.log('handler disposed')
}
export default handler
`

interface RunningServer {
  readonly child: ChildProcess
  readonly url: string
  stdout(): string
}

async function startServer(args: readonly string[], env: NodeJS.ProcessEnv): Promise<RunningServer> {
  const child = spawn(process.execPath, [BIN, 'serve', ...args], {
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'inherit']
  })
  const stdout = child.stdout
  if (stdout === null) {
    throw new Error('Child process stdout was not piped.')
  }
  let output = ''
  const url = await new Promise<string>((resolveUrl, rejectUrl) => {
    const timer = setTimeout(
      () => rejectUrl(new Error(`Server did not start. Output: ${output}`)),
      15000
    )
    stdout.on('data', (chunk: Buffer) => {
      output += chunk.toString('utf8')
      const match = /listening at (http:\/\/[^\s]+)/.exec(output)
      if (match?.[1] !== undefined) {
        clearTimeout(timer)
        resolveUrl(match[1])
      }
    })
    child.once('exit', (code) => {
      clearTimeout(timer)
      rejectUrl(new Error(`Server exited early with code ${code}. Output: ${output}`))
    })
  })
  return { child, url, stdout: () => output }
}

describe('tango serve process lifecycle', () => {
  it('reads PORT/HOST from env, drains on SIGTERM, and disposes the handler', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tango-serve-shutdown-'))
    try {
      const handlerPath = join(dir, 'handler.mjs')
      await writeFile(handlerPath, HANDLER_SOURCE)

      // Port 0 asks the OS for a free port; PORT env (not a flag) must be honored.
      const server = await startServer(['--handler', handlerPath], {
        PORT: '0',
        HOST: '127.0.0.1'
      })

      const response = await fetch(`${server.url}/anything/`)
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ ok: true })

      server.child.kill('SIGTERM')
      const [code, signal] = (await once(server.child, 'exit')) as [
        number | null,
        NodeJS.Signals | null
      ]

      // A handled SIGTERM exits cleanly instead of being killed by the signal.
      expect(signal).toBeNull()
      expect(code).toBe(0)
      expect(server.stdout()).toContain('Received SIGTERM; draining in-flight requests...')
      expect(server.stdout()).toContain('handler disposed')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  }, 30000)
})
