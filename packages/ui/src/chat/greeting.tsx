import type { HTMLAttributes, ReactNode } from 'react';

const lateNightGreetings = [
  'Burning the midnight oil',
  'Still up? Impressive',
  'Night owl mode activated',
  'Welcome to the grind',
  'Coffee or willpower?',
];

export function greetingForHour(hour: number) {
  if (hour >= 0 && hour < 5) return lateNightGreetings[hour % lateNightGreetings.length];
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export interface GreetingProps extends HTMLAttributes<HTMLDivElement> {
  avatar?: string;
  logo?: ReactNode;
  name?: string;
  userName?: string;
}

export function Greeting({ avatar, className, logo, name, userName, ...props }: GreetingProps) {
  const greeting = greetingForHour(new Date().getHours());

  return (
    <div className={`fb-greeting${className ? ` ${className}` : ''}`} {...props}>
      <div className="fb-greeting__media">
        {avatar ? (
          <img src={avatar} alt={name ?? 'Assistant'} className="fb-greeting__avatar" />
        ) : (
          logo && <div className="fb-greeting__logo">{logo}</div>
        )}
      </div>
      <h3 className="fb-greeting__title">
        {greeting}
        {userName ? `, ${userName}` : ''}
      </h3>
    </div>
  );
}
