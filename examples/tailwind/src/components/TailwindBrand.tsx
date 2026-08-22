export const TailwindIcon = () => (
  <div className="flex size-9 items-center justify-center rounded-lg border border-admin-border bg-admin-bg text-sm font-black text-admin-text shadow-sm">
    F
  </div>
);

export const TailwindLogo = () => (
  <div className="flex items-center gap-3 rounded-xl border border-admin-border bg-elevation-0 px-4 py-3 text-admin-text shadow-sm">
    <TailwindIcon />
    <div className="flex flex-col">
      <span className="text-base font-bold tracking-tight">FrogBot</span>
      <span className="text-xs text-elevation-500">Tailwind CSS 4</span>
    </div>
  </div>
);
