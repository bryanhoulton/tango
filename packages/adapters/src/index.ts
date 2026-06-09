import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { Buffer } from 'node:buffer'

export type WebHandler = (request: Request) => Promise<Response> | Response

export interface ServeOptions {
  readonly host?: string
  readonly port?: number
}

export interface DevServer {
  readonly server: Server
  readonly url: string
  close(): Promise<void>
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

async function bodyFromNode(req: IncomingMessage): Promise<string | undefined> {
  if (req.method === 'GET' || req.method === 'HEAD') {
    return undefined
  }

  const chunks: string[] = []
  for await (const chunk of req as AsyncIterable<unknown>) {
    if (typeof chunk === 'string') {
      chunks.push(chunk)
    } else if (chunk instanceof Uint8Array) {
      chunks.push(Buffer.from(chunk).toString('utf8'))
    } else {
      throw new Error('Unsupported request body chunk.')
    }
  }
  const body = chunks.join('')
  return body.length === 0 ? undefined : body
}

async function requestFromNode(req: IncomingMessage): Promise<Request> {
  const host = req.headers.host ?? 'localhost'
  const url = `http://${host}${req.url ?? '/'}`
  const body = await bodyFromNode(req)
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

export function createNodeServer(handler: WebHandler): Server {
  return createServer((req, res) => {
    void (async () => {
      try {
        const request = await requestFromNode(req)
        await writeResponse(res, await handler(request))
      } catch {
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
  const server = isServer(input) ? input : createNodeServer(input)

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
