export function NavIcon({ className, size }: { className?: string; size?: number }) {
  return (
    <svg
      className={className}
      data-testid="nav-component-icon"
      height={size}
      viewBox="0 0 20 20"
      width={size}
    >
      <circle cx="10" cy="10" fill="currentColor" r="6" />
    </svg>
  );
}
