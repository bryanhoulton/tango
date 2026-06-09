import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export default async function globalSetup(): Promise<void> {
  await execFileAsync('docker', ['compose', 'down', '-v'], {
    cwd: new URL('../..', import.meta.url),
    timeout: 120_000
  })
  await execFileAsync('docker', ['compose', 'up', '-d', '--wait'], {
    cwd: new URL('../..', import.meta.url),
    timeout: 120_000
  })
}
