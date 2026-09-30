import type { FieldAccess, FieldAccessArgs, FrogBot, TextField } from 'frogbot';
import type { FieldAccessArgs as PayloadFieldAccessArgs } from 'payload';
import { expectTypeOf } from 'vitest';

type Post = { id: string; title: string };
type Siblings = { title: string };

declare const args: FieldAccessArgs<Post, Siblings>;

expectTypeOf(args.blockData).toEqualTypeOf<PayloadFieldAccessArgs<Post, Siblings>['blockData']>();
expectTypeOf(args.doc).toEqualTypeOf<Post | undefined>();
expectTypeOf(args.siblingData).toEqualTypeOf<Partial<Siblings> | undefined>();
expectTypeOf(args.req.frogbot).toEqualTypeOf<FrogBot>();
expectTypeOf(args.req).not.toHaveProperty('payload');

const access: FieldAccess<Post, Siblings> = ({ blockData, doc, siblingData, req }) => {
  expectTypeOf(blockData).toEqualTypeOf<PayloadFieldAccessArgs<Post, Siblings>['blockData']>();
  expectTypeOf(doc).toEqualTypeOf<Post | undefined>();
  expectTypeOf(siblingData).toEqualTypeOf<Partial<Siblings> | undefined>();
  expectTypeOf(req.frogbot).toEqualTypeOf<FrogBot>();

  return Boolean(req.frogbot);
};

const text: TextField = {
  access: {
    create: access,
    read: ({ blockData, req }) => {
      expectTypeOf(blockData).toEqualTypeOf<PayloadFieldAccessArgs['blockData']>();

      expectTypeOf(req).not.toHaveProperty('payload');

      return Boolean(req.frogbot);
    },
    update: access,
  },
  name: 'title',
  type: 'text',
};

expectTypeOf(text).toMatchTypeOf<TextField>();
