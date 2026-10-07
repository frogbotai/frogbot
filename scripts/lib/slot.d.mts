export const SLOTS: number;

export const SLOT_DIR: string;

export const LAND_LOCK: { dir: string; slots: number; noun: string };

export function acquireSlot(
  name: string,
  options?: {
    dir?: string;
    slots?: number;
    noun?: string;
    pid?: number;
    interval?: number;
    log?: (line: string) => void;
  },
): Promise<() => void>;
