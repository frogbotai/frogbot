import type { ReactNode } from 'react';
export type TextWithIconProps = {
  children?: ReactNode;
  className?: string;
  icon: ReactNode;
  text: ReactNode;
};
export function TextWithIcon({ children, className, icon, text }: TextWithIconProps) {
  return (
    <div className={`fb-text-with-icon${className ? ` ${className}` : ''}`}>
      {icon}
      {text}
      {children}
    </div>
  );
}
