export const SLOTS: number;

export const SLOT_DIR: string;

export function acquireSlot(
  name: string,
  options?: {
    dir?: string;
    slots?: number;
    pid?: number;
    interval?: number;
    log?: (line: string) => void;
  },
): Promise<() => void>;
