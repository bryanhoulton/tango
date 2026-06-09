// Vercel entrypoint (Node.js runtime). All paths are rewritten here by
// vercel.json; Tango owns the routing internally. Delete this file and
// vercel.json if you only deploy with the Dockerfile.
import { vercelHandler } from '@tango-ts/adapters/vercel'

import { project } from '../src/project.js'

export default vercelHandler(project)
