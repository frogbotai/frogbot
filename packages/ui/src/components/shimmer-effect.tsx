'use client';
import { useEffect, useState } from 'react';
export type ShimmerEffectProps = {
  animationDelay?: string;
  className?: string;
  disableInlineStyles?: boolean;
  height?: number | string;
  width?: number | string;
};
export function ShimmerEffect({
  animationDelay = '0ms',
  className,
  disableInlineStyles = false,
  height = '60px',
  width = '100%',
}: ShimmerEffectProps) {
  return (
    <div
      className={`fb-shimmer${className ? ` ${className}` : ''}`}
      style={disableInlineStyles ? undefined : { height, width }}
    >
      <div className="fb-shimmer__shine" style={{ animationDelay }} />
    </div>
  );
}
export type StaggeredShimmersProps = {
  className?: string;
  count: number;
  height?: number | string;
  renderDelay?: number;
  shimmerDelay?: number | string;
  shimmerItemClassName?: string;
  width?: number | string;
};
export function StaggeredShimmers({
  className,
  count,
  height,
  renderDelay = 500,
  shimmerDelay = 25,
  shimmerItemClassName,
  width,
}: StaggeredShimmersProps) {
  const [visible, setVisible] = useState(renderDelay === 0);
  useEffect(() => {
    if (visible) return;
    const timer = window.setTimeout(() => setVisible(true), renderDelay);
    return () => window.clearTimeout(timer);
  }, [renderDelay, visible]);
  if (!visible) return null;
  const delay = typeof shimmerDelay === 'number' ? `${shimmerDelay}ms` : shimmerDelay;
  return (
    <div className={className}>
      {Array.from({ length: count }, (_, index) => (
        <div className={shimmerItemClassName} key={index}>
          <ShimmerEffect
            animationDelay={`calc(${index} * ${delay})`}
            height={height}
            width={width}
          />
        </div>
      ))}
    </div>
  );
}
