import { planetApi } from '../api/planet-api'
import { isApiError } from '../api/errors'
import { DEFAULT_CAPABILITIES, type Capabilities } from './contracts'

export async function readCapabilities(): Promise<Capabilities> {
  try {
    const remote = await planetApi.me.capabilities()
    return { ...DEFAULT_CAPABILITIES, ...remote }
  } catch (e) {
    // A missing endpoint is the only safe compatibility fallback. Network
    // failures must remain errors so Settings can show a retry path instead
    // of telling the user that a temporarily unreachable capability is absent.
    if (isApiError(e) && e.status === 404) {
      return DEFAULT_CAPABILITIES
    }
    throw e
  }
}
