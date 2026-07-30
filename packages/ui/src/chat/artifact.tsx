'use client'

import { createContext, type Dispatch, type ReactNode, type SetStateAction,use, useCallback, useEffect, useState } from 'react'

import { type Artifact, type ArtifactPersistence, type ArtifactRegistryItem,resolveArtifact } from './artifact-registry'
import type { DataPartValue } from './data-part'

export interface ArtifactContextValue {
  artifact?: Artifact
  loadArtifact: (id: string) => Promise<Artifact | undefined>
  registry: readonly ArtifactRegistryItem[]
  saveArtifact: () => Promise<Artifact | undefined>
  setArtifact: Dispatch<SetStateAction<Artifact | undefined>>
}

const ArtifactContext = createContext<ArtifactContextValue | undefined>(undefined)

export function ArtifactProvider({ children, persistence, registry = [] }: { children: ReactNode; persistence?: ArtifactPersistence; registry?: readonly ArtifactRegistryItem[] }) {
  const [artifact, setArtifact] = useState<Artifact>()
  const loadArtifact = useCallback(async (id: string) => {
    const loaded = await persistence?.load(id)
    if (loaded) setArtifact(loaded)
    return loaded
  }, [persistence])
  async function saveArtifact() {
    if (!artifact || !persistence) return undefined
    const saved = await persistence.save(artifact)
    setArtifact(saved)
    return saved
  }
  return <ArtifactContext value={{ artifact, loadArtifact, registry, saveArtifact, setArtifact }}>{children}</ArtifactContext>
}

export function useArtifact(): ArtifactContextValue | undefined {
  return use(ArtifactContext)
}

export function ArtifactStreamPart({ part }: { part: DataPartValue }) {
  const context = useArtifact()
  const definition = resolveArtifact(context?.registry ?? [], part.type.slice(5))
  const setArtifact = context?.setArtifact

  useEffect(() => {
    if (!setArtifact || !definition?.onStreamPart) return
    if (definition.initialize) setArtifact((current) => current ?? definition.initialize?.())
    definition.onStreamPart({ setArtifact, streamPart: part })
  }, [definition, part, setArtifact])

  return null
}

function serialize(value: unknown) {
  if (typeof value === 'string') return value
  try { return JSON.stringify(value, null, 2) } catch { return String(value) }
}

export function ArtifactView({ artifact: artifactProp }: { artifact?: Artifact }) {
  const context = useArtifact()
  const artifact = artifactProp ?? context?.artifact
  if (!artifact) return null
  const definition = resolveArtifact(context?.registry ?? [], artifact.kind)
  if (definition && context) return <definition.render artifact={artifact} setArtifact={context.setArtifact} />
  return <div data-artifact-kind={artifact.kind} className="rounded-lg border border-border p-3"><strong>{artifact.title ?? artifact.kind}</strong><pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-xs">{serialize(artifact.content)}</pre></div>
}

export function ArtifactViewer({ id, onClose }: { id?: string; onClose?: () => void }) {
  const context = useArtifact()
  const loadArtifact = context?.loadArtifact
  useEffect(() => {
    if (id) void loadArtifact?.(id)
  }, [id, loadArtifact])
  if (!context?.artifact) return null
  return <aside data-artifact-viewer className="fixed inset-y-0 right-0 z-40 flex w-[min(48rem,90vw)] min-w-80 resize-x flex-col overflow-auto border-l border-border bg-background shadow-xl">
    <header className="flex items-center justify-between border-b border-border p-3"><strong>{context.artifact.title ?? context.artifact.kind}</strong><div className="flex gap-2"><button type="button" onClick={() => void context.saveArtifact()}>Save</button>{onClose && <button type="button" onClick={onClose}>Close</button>}</div></header>
    <div className="min-h-0 flex-1 overflow-auto p-4"><ArtifactView /></div>
  </aside>
}
