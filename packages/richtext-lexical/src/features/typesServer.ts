import type {
  AfterChangeNodeHook as PayloadAfterChangeNodeHook,
  AfterReadNodeHook as PayloadAfterReadNodeHook,
  BeforeChangeNodeHook as PayloadBeforeChangeNodeHook,
  BeforeValidateNodeHook as PayloadBeforeValidateNodeHook,
  FeatureProviderProviderServer,
  FeatureProviderServer,
  NodeValidation as PayloadNodeValidation,
  NodeWithHooks as PayloadNodeWithHooks,
  PopulationPromise as PayloadPopulationPromise,
  ResolvedServerFeatureMap,
  ServerFeature as PayloadServerFeature,
  ServerFeatureProviderMap,
} from '@payloadcms/richtext-lexical';
import type {
  Klass,
  LexicalNode,
  LexicalNodeReplacement,
  SerializedLexicalNode,
} from '@payloadcms/richtext-lexical/lexical';
import type { Field, FrogBotRequest } from 'frogbot';
import type { JsonObject } from 'payload';

/**
 * The full serialized form of a node. `ReturnType` would pick Lexical's compact `exportJSON`
 * overload, so both overloads are matched, as Payload does.
 */
export type ExtractSerializedNode<TNode extends LexicalNode> = TNode['exportJSON'] extends {
  (compact?: false): infer Serialized extends SerializedLexicalNode;
  (compact: boolean): unknown;
}
  ? Serialized
  : never;

type JSONSchemaFn = NonNullable<PayloadNodeWithHooks['jsonSchema']>;

type WithNode<TArgs, TNode extends SerializedLexicalNode> = Omit<TArgs, 'node' | 'req'> & {
  node: TNode;
  req: FrogBotRequest;
};

type NodeHook<THook, TNode extends SerializedLexicalNode> = (
  args: WithNode<Parameters<Extract<THook, (args: never) => unknown>>[0], TNode>,
) => ReturnType<Extract<THook, (args: never) => unknown>>;

export type PopulationPromise<TNode extends SerializedLexicalNode = SerializedLexicalNode> = (
  args: WithNode<Parameters<PayloadPopulationPromise<TNode>>[0], TNode>,
) => void;

export type NodeValidation<TNode extends SerializedLexicalNode = SerializedLexicalNode> = (
  args: Omit<Parameters<PayloadNodeValidation<TNode>>[0], 'node'> & { node: TNode },
) => ReturnType<PayloadNodeValidation<TNode>>;

export type NodeWithHooks<
  TNode extends LexicalNode = LexicalNode,
  TSerializedNode extends SerializedLexicalNode = ExtractSerializedNode<TNode>,
> = {
  getSubFields?: (args: { node?: TSerializedNode; req?: FrogBotRequest }) => Field[] | null;
  getSubFieldsData?: (args: { node: TSerializedNode; req: FrogBotRequest }) => JsonObject;
  graphQLPopulationPromises?: PopulationPromise<TSerializedNode>[];
  hooks?: {
    afterChange?: NodeHook<PayloadAfterChangeNodeHook<TSerializedNode>, TSerializedNode>[];
    afterRead?: NodeHook<PayloadAfterReadNodeHook<TSerializedNode>, TSerializedNode>[];
    beforeChange?: NodeHook<PayloadBeforeChangeNodeHook<TSerializedNode>, TSerializedNode>[];
    beforeValidate?: NodeHook<PayloadBeforeValidateNodeHook<TSerializedNode>, TSerializedNode>[];
  };
  jsonSchema?: JSONSchemaFn;
  node: Klass<TNode> | LexicalNodeReplacement | (new (...args: never[]) => TNode);
  validations?: NodeValidation<TSerializedNode>[];
};

type AnyNodeCallback = (args: never) => unknown;

type ServerNodeRegistration = {
  getSubFields?: AnyNodeCallback;
  getSubFieldsData?: AnyNodeCallback;
  graphQLPopulationPromises?: AnyNodeCallback[];
  hooks?: Partial<
    Record<'afterChange' | 'afterRead' | 'beforeChange' | 'beforeValidate', AnyNodeCallback[]>
  >;
  jsonSchema?: JSONSchemaFn;
  node: LexicalNodeReplacement | (new (...args: never[]) => unknown);
  validations?: AnyNodeCallback[];
};

export type ServerFeature<ServerProps, ClientFeatureProps> = Omit<
  PayloadServerFeature<ServerProps, ClientFeatureProps>,
  'nodes'
> & {
  nodes?: ServerNodeRegistration[];
};

export type {
  FeatureProviderProviderServer,
  FeatureProviderServer,
  ResolvedServerFeatureMap,
  ServerFeatureProviderMap,
};
