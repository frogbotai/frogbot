import type { ForwardRefExoticComponent, RefAttributes, SVGProps } from 'react';

type SVGElementType =
  'circle' | 'ellipse' | 'g' | 'line' | 'path' | 'polygon' | 'polyline' | 'rect';

export type IconNode = [elementName: SVGElementType, attrs: Record<string, string>][];

export type SVGAttributes = Partial<SVGProps<SVGSVGElement>>;

type ElementAttributes = RefAttributes<SVGSVGElement> & SVGAttributes;

export interface LucideProps extends ElementAttributes {
  size?: string | number;
  absoluteStrokeWidth?: boolean;
}

export type LucideIcon = ForwardRefExoticComponent<
  Omit<LucideProps, 'ref'> & RefAttributes<SVGSVGElement>
>;
