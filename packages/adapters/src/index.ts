import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { Buffer } from 'node:buffer'

import { consoleLogger, errorFields, type Logger } from '@tango-ts/http'

export type WebHandler = (request: Request) => Promise<Response> | Response

export interface NodeServerOptions {
  /** Where unhandled handler errors are reported. Defaults to `consoleLogger()`. */
  readonly logger?: Logger
  /**
   * Maximum request body size in bytes, enforced while streaming so oversized
   * uploads never fully buffer. Defaults to 10 MiB.
   */
  readonly maxBodyBytes?: number
}

export interface ServeOptions extends NodeServerOptions {
  readonly host?: string
  readonly port?: number
}

export interface DevServer {
  readonly server: Server
  readonly url: string
  close(): Promise<void>
}

const DEFAULT_MAX_BODY_BYTES = 10 * 1024 * 1024

class PayloadTooLarge extends Error {
  constructor() {
    super('Request body too large.')
    this.name = 'PayloadTooLarge'
  }
}

function headersFromNode(req: IncomingMessage): Headers {
  const headers = new Headers()
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) {
      continue
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        headers.append(key, item)
      }
    } else {
      headers.set(key, value)
    }
  }
  return headers
}

async function bodyFromNode(
  req: IncomingMessage,
  maxBodyBytes: number
): Promise<string | undefined> {
  if (req.method === 'GET' || req.method === 'HEAD') {
    return undefined
  }

  const declaredLength = Number(req.headers['content-length'] ?? 0)
  if (Number.isFinite(declaredLength) && declaredLength > maxBodyBytes) {
    throw new PayloadTooLarge()
  }

  const chunks: string[] = []
  let received = 0
  for await (const chunk of req as AsyncIterable<unknown>) {
    if (typeof chunk === 'string') {
      received += Buffer.byteLength(chunk)
      chunks.push(chunk)
    } else if (chunk instanceof Uint8Array) {
      received += chunk.byteLength
      chunks.push(Buffer.from(chunk).toString('utf8'))
    } else {
      throw new Error('Unsupported request body chunk.')
    }
    if (received > maxBodyBytes) {
      throw new PayloadTooLarge()
    }
  }
  const body = chunks.join('')
  return body.length === 0 ? undefined : body
}

async function requestFromNode(
  req: IncomingMessage,
  maxBodyBytes: number
): Promise<Request> {
  const host = req.headers.host ?? 'localhost'
  const url = `http://${host}${req.url ?? '/'}`
  const body = await bodyFromNode(req, maxBodyBytes)
  return new Request(url, {
    method: req.method ?? 'GET',
    headers: headersFromNode(req),
    body
  })
}

async function writeResponse(res: ServerResponse, response: Response): Promise<void> {
  res.statusCode = response.status
  response.headers.forEach((value, key) => {
    res.setHeader(key, value)
  })
  const body = await response.arrayBuffer()
  res.end(Buffer.from(body))
}

function errorResponse(): Response {
  return Response.json({ detail: 'Internal server error.' }, { status: 500 })
}

function payloadTooLargeResponse(): Response {
  return Response.json({ detail: 'Request body too large.' }, { status: 413 })
}

export function createNodeServer(
  handler: WebHandler,
  options: NodeServerOptions = {}
): Server {
  const logger = options.logger ?? consoleLogger()
  const maxBodyBytes = options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES
  return createServer((req, res) => {
    void (async () => {
      try {
        const request = await requestFromNode(req, maxBodyBytes)
        await writeResponse(res, await handler(request))
      } catch (err) {
        if (err instanceof PayloadTooLarge) {
          await writeResponse(res, payloadTooLargeResponse())
          return
        }
        // The generic 500 body never leaks details to the client, but the error
        // itself must be visible to operators.
        logger.error('Unhandled error while handling request', {
          method: req.method,
          path: req.url,
          ...errorFields(err)
        })
        await writeResponse(res, errorResponse())
      }
    })()
  })
}

function isServer(value: WebHandler | Server): value is Server {
  return typeof value !== 'function'
}

function addressUrl(server: Server, host: string): string {
  const address = server.address()
  if (address === null || typeof address === 'string') {
    throw new Error('Unable to determine dev server address.')
  }
  return `http://${host}:${address.port}`
}

export function serve(
  input: WebHandler | Server,
  options: ServeOptions = {}
): Promise<DevServer> {
  const host = options.host ?? '127.0.0.1'
  const port = options.port ?? 8000
  const server = isServer(input)
    ? input
    : createNodeServer(input, {
        logger: options.logger,
        maxBodyBytes: options.maxBodyBytes
      })

  return new Promise((resolve, reject) => {
    const onError = (err: Error): void => {
      server.off('error', onError)
      reject(err)
    }
    server.once('error', onError)
    server.listen(port, host, () => {
      server.off('error', onError)
      resolve({
        server,
        url: addressUrl(server, host),
        close: () =>
          new Promise<void>((closeResolve, closeReject) => {
            // Drop idle keep-alive sockets so close() resolves once in-flight
            // requests finish instead of hanging on idle connections.
            server.closeIdleConnections()
            server.close((err) => {
              if (err !== undefined) {
                closeReject(err)
              } else {
                closeResolve()
              }
            })
          })
      })
    })
  })
}
