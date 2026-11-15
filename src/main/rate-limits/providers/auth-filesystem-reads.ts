import { lstat, readFile, stat } from 'node:fs/promises'
import { parseWslUncPath } from '../../../shared/file-access/wsl-paths'
import { createAuthFilesystemOperation } from './auth-filesystem-operation'
import { retainAuthFilesystemOperation } from './auth-filesystem-ownership'

let pendingReadCount = 0

/** Share raw UNC reads until settlement; local paths bypass the UNC queue. */
function createAuthFilesystemReader<T>(read: (path: string) => Promise<T>) {
  const pending = new Map<string, Promise<T>>()
  return (path: string): Promise<T> => {
    if (!parseWslUncPath(path)) {
      return Promise.resolve().then(() => read(path))
    }
    const existing = pending.get(path)
    if (existing) {
      retainAuthFilesystemOperation(existing)
      return existing
    }
    if (pendingReadCount >= 64) {
      return Promise.reject(new Error('WSL auth reads unavailable'))
    }
    const result = createAuthFilesystemOperation(path, () => read(path)).result
    pending.set(path, result)
    pendingReadCount += 1
    const release = () => {
      pending.delete(path)
      pendingReadCount -= 1
    }
    void result.then(release, release)
    return result
  }
}

export const readAuthFileStat = createAuthFilesystemReader((path) => stat(path))
export const readAuthFileLstat = createAuthFilesystemReader((path) => lstat(path))
export const readAuthTextFile = createAuthFilesystemReader((path) => readFile(path, 'utf8'))
