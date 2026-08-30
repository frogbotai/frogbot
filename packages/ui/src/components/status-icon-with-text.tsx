import type { ComponentType, SVGProps } from 'react';
export type StatusIconWithTextProps = {
  color?: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  text: string;
  textColor?: string;
  variant?: 'success' | 'error' | 'default' | 'secondary';
};
export function StatusIconWithText({
  color,
  icon: Icon,
  text,
  textColor,
  variant = 'default',
}: StatusIconWithTextProps) {
  return (
    <span
      className={`fb-status-icon-text fb-status-icon-text--${variant}`}
      style={{ backgroundColor: color }}
    >
      <Icon className="fb-status-icon-text__icon" style={{ color: textColor }} />
      <span style={{ color: textColor }}>{text}</span>
    </span>
  );
}
