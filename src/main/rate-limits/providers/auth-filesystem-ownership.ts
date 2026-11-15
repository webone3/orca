import { AsyncLocalStorage } from 'node:async_hooks'

const ownership = new AsyncLocalStorage<Set<Promise<unknown>>>()

export function retainAuthFilesystemOperation(result: Promise<unknown>): void {
  const pending = ownership.getStore()
  if (!pending) {
    return
  }
  pending.add(result)
  const release = () => pending.delete(result)
  void result.then(release, release)
}

/** A caller deadline may abandon its wait, but ownership ends only at raw settlement. */
export async function withAuthFilesystemOwnership<T>(operation: () => Promise<T>): Promise<T> {
  const pending = new Set<Promise<unknown>>()
  return ownership.run(pending, async () => {
    try {
      return await operation()
    } finally {
      while (pending.size) {
        await Promise.allSettled(pending)
      }
    }
  })
}
