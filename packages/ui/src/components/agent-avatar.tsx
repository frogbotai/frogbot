import RobotIcon from '../icons/icons/RobotIcon.js';

export type AgentAvatarProps = {
  className?: string;
  /** The agent's name, for screen readers. */
  name?: string;
  /** Width and height in pixels. Default 24. */
  size?: number;
};

/** An AI agent's picture: a robot in a green rounded square, so agents read apart from round people. */
export function AgentAvatar({ className, name, size = 24 }: AgentAvatarProps) {
  return (
    <span
      aria-label={name ?? 'Agent'}
      className={`fb-agent-avatar${className ? ` ${className}` : ''}`}
      role="img"
      style={{ borderRadius: Math.max(4, Math.round(size * 0.28)), height: size, width: size }}
    >
      <RobotIcon aria-hidden size={Math.round(size * 0.65)} />
    </span>
  );
}
