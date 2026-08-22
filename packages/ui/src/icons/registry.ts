import type { ComponentType } from 'react';

import * as icons from '../exports/icons.js';

type KebabCase<Value extends string> = Value extends `${infer First}${infer Rest}`
  ? Rest extends Uncapitalize<Rest>
    ? `${Lowercase<First>}${KebabCase<Rest>}`
    : `${Lowercase<First>}-${KebabCase<Rest>}`
  : Value;

type IconExportName = {
  [Name in keyof typeof icons]: Name extends `${infer Base}Icon`
    ? Base extends Capitalize<Base>
      ? Name
      : never
    : never;
}[keyof typeof icons];

export type IconName = IconExportName extends `${infer Base}Icon` ? KebabCase<Base> : never;

type IconComponent = ComponentType<{ className?: string; size?: number }>;

const isIconExportName = (name: string): name is IconExportName => /^[A-Z].*Icon$/.test(name);

const toKebabCase = <Name extends IconExportName>(value: Name) =>
  value
    .replace(/Icon$/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase() as Name extends `${infer Base}Icon` ? KebabCase<Base> : never;

const buildIconRegistry = () => {
  const registry: Partial<Record<IconName, IconComponent>> = {};
  for (const name of Object.keys(icons)) {
    if (isIconExportName(name)) registry[toKebabCase(name)] = icons[name];
  }
  return registry as Record<IconName, IconComponent>;
};

export const iconRegistry = buildIconRegistry();

export const iconNames = Object.keys(iconRegistry).sort() as IconName[];

export const isIconName = (value: string): value is IconName => value in iconRegistry;
