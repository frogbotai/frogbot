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

const toKebabCase = (value: string) =>
  value
    .replace(/Icon$/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase();

export const iconRegistry = Object.fromEntries(
  Object.entries(icons)
    .filter(([name]) => /^[A-Z].*Icon$/.test(name))
    .map(([name, icon]) => [toKebabCase(name), icon]),
) as Record<IconName, ComponentType<{ className?: string; size?: number }>>;

export const iconNames = Object.keys(iconRegistry).sort() as IconName[];
