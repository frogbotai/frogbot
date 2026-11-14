'use client';

import {
  createContext,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  use,
  useCallback,
  useEffect,
  useState,
} from 'react';

import { SidePanelBar, useSidePanelEscape } from '../components/side-panel-bar.js';
import {
  type Artifact,
  type ArtifactPersistence,
  type ArtifactRegistryItem,
  resolveArtifact,
} from './artifact-registry.js';
import type { DataPartValue } from './data-part.js';

export interface ArtifactContextValue {
  artifact?: Artifact;
  loadArtifact: (id: string) => Promise<Artifact | undefined>;
  registry: readonly ArtifactRegistryItem[];
  saveArtifact: () => Promise<Artifact | undefined>;
  setArtifact: Dispatch<SetStateAction<Artifact | undefined>>;
}

const ArtifactContext = createContext<ArtifactContextValue | undefined>(undefined);

export function ArtifactProvider({
  children,
  persistence,
  registry = [],
}: {
  children: ReactNode;
  persistence?: ArtifactPersistence;
  registry?: readonly ArtifactRegistryItem[];
}) {
  const [artifact, setArtifact] = useState<Artifact>();

  const loadArtifact = useCallback(
    async (id: string) => {
      const loaded = await persistence?.load(id);
      if (loaded) setArtifact(loaded);

      return loaded;
    },
    [persistence],
  );

  async function saveArtifact() {
    if (!artifact || !persistence) return undefined;
    const saved = await persistence.save(artifact);
    setArtifact(saved);

    return saved;
  }

  return (
    <ArtifactContext value={{ artifact, loadArtifact, registry, saveArtifact, setArtifact }}>
      {children}
    </ArtifactContext>
  );
}

export function useArtifact(): ArtifactContextValue | undefined {
  return use(ArtifactContext);
}

export function ArtifactStreamPart({ part }: { part: DataPartValue }) {
  const context = useArtifact();
  const definition = resolveArtifact(context?.registry ?? [], part.type.slice(5));
  const setArtifact = context?.setArtifact;

  useEffect(() => {
    if (!setArtifact || !definition?.onStreamPart) return;
    if (definition.initialize) setArtifact((current) => current ?? definition.initialize?.());
    definition.onStreamPart({ setArtifact, streamPart: part });
  }, [definition, part, setArtifact]);

  return null;
}

function serialize(value: unknown) {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function ArtifactView({ artifact: artifactProp }: { artifact?: Artifact }) {
  const context = useArtifact();
  const artifact = artifactProp ?? context?.artifact;
  if (!artifact) return null;
  const definition = resolveArtifact(context?.registry ?? [], artifact.kind);
  if (definition && context) {
    return <definition.render artifact={artifact} setArtifact={context.setArtifact} />;
  }

  return (
    <div data-artifact-kind={artifact.kind} className="fb-artifact">
      <strong>{artifact.title ?? artifact.kind}</strong>
      <pre className="fb-artifact__content">{serialize(artifact.content)}</pre>
    </div>
  );
}

/**
 * The chat's file viewer: a side panel with the shared side panel bar. The file's title is always
 * in the bar, Save sits in the status slot, expand widens the viewer to the window, and close and
 * Esc call `onClose`.
 */
export function ArtifactViewer({ id, onClose }: { id?: string; onClose?: () => void }) {
  const context = useArtifact();
  const loadArtifact = context?.loadArtifact;
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (id) void loadArtifact?.(id);
  }, [id, loadArtifact]);

  useSidePanelEscape(context?.artifact ? onClose : undefined);

  if (!context?.artifact) return null;

  return (
    <aside
      data-artifact-viewer
      className={`fb-artifact__viewer${expanded ? ' fb-artifact__viewer--expanded' : ''}`}
    >
      <SidePanelBar
        labels={{ expand: expanded ? 'Collapse' : 'Expand' }}
        onClose={onClose}
        onExpand={() => setExpanded((current) => !current)}
        status={
          <button
            className="fb-artifact__save"
            onClick={() => void context.saveArtifact()}
            type="button"
          >
            Save
          </button>
        }
        title={context.artifact.title ?? context.artifact.kind}
      />
      <div className="fb-artifact__body">
        <ArtifactView />
      </div>
    </aside>
  );
}
