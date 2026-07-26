import type { ComponentType, Dispatch, ReactNode, SetStateAction } from 'react'
import type { DataPartValue } from './data-part'

export interface Artifact<T = unknown> {
  content: T
  id?: string
  kind: string
  title?: string
}

export interface ArtifactRendererProps<T = unknown> {
  artifact: Artifact<T>
  setArtifact: Dispatch<SetStateAction<Artifact<T> | undefined>>
}

export interface ArtifactRegistryItem<T = unknown> {
  actions?: readonly ReactNode[]
  description?: string
  initialize?: () => Artifact<T>
  kind: string
  onStreamPart?: (options: { setArtifact: Dispatch<SetStateAction<Artifact<T> | undefined>>; streamPart: DataPartValue }) => void
  render: ComponentType<ArtifactRendererProps<T>>
  toolbar?: readonly ReactNode[]
}

export interface ArtifactPersistence {
  load: (id: string) => Promise<Artifact | undefined>
  save: (artifact: Artifact) => Promise<Artifact>
}

export function resolveArtifact(registry: readonly ArtifactRegistryItem[], kind: string): ArtifactRegistryItem | undefined {
  return registry.find((item) => item.kind === kind)
}
