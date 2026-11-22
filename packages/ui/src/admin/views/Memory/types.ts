export type MemoryItem = {
  id: string;
  key?: string;
  text: string;
  pinned: boolean;
  updatedAt: string;
};

export type MemoryViewClientProps = {
  apiPath: string;
  pageSize: number;
  initialMemories: MemoryItem[];
  initialHasNextPage: boolean;
  initialError?: string;
};
