export type ShortcutProps = {
  className?: string;
  shortcutKey: string;
  shouldNotPreventDefault?: boolean;
  withCtrl?: boolean;
  withShift?: boolean;
};
export function Shortcut({ className, shortcutKey, withCtrl, withShift }: ShortcutProps) {
  const isEscape = shortcutKey.toLowerCase() === 'esc';
  const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.userAgent);
  const key = shortcutKey.charAt(0).toUpperCase() + shortcutKey.slice(1);
  return (
    <span className={`fb-shortcut${className ? ` ${className}` : ''}`}>
      {!isEscape && withCtrl && (isMac ? '⌘' : 'Ctrl')}
      {!isEscape && withShift && `${withCtrl ? ' + ' : ''}Shift`}
      {!isEscape && (withCtrl || withShift) && ' + '}
      {key}
    </span>
  );
}
