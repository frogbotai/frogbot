import type { HTMLAttributes } from 'react';

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`fb-card${className ? ` ${className}` : ''}`} {...props} />;
}
export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`fb-card__header${className ? ` ${className}` : ''}`} {...props} />;
}
export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={`fb-card__title${className ? ` ${className}` : ''}`} {...props} />;
}
export function CardDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={`fb-card__description${className ? ` ${className}` : ''}`} {...props} />;
}
export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`fb-card__content${className ? ` ${className}` : ''}`} {...props} />;
}
export function CardFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`fb-card__footer${className ? ` ${className}` : ''}`} {...props} />;
}
