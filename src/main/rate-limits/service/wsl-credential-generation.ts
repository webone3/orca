import { stat } from 'node:fs/promises'
import { fileStatSignature } from '../../filesystem/file-stat-signature'
import {
  createAuthFilesystemOperation,
  type SharedAuthFilesystemOperation
} from '../providers/auth-filesystem-operation'

const probes = new Map<string, SharedAuthFilesystemOperation<string | null>>()

/** Non-secret file identity; share uncancellable UNC I/O until it settles. */
export async function wslCredentialGeneration(
  path: string,
  signal: AbortSignal
): Promise<string | null> {
  let probe = probes.get(path)
  if (!probe) {
    probe = createAuthFilesystemOperation(path, async () => {
      try {
        return fileStatSignature(await stat(path, { bigint: true }))
      } catch {
        return null
      }
    })
    probes.set(path, probe)
    const pending = probe
    const clear = () => {
      if (probes.get(path) === pending) {
        probes.delete(path)
      }
    }
    void probe.result.then(clear, clear)
  }
  try {
    return await probe.wait(AbortSignal.any([signal, AbortSignal.timeout(5_000)]))
  } catch {
    return null
  }
}
