import type {
  AfterChangeNodeHook as PayloadAfterChangeNodeHook,
  AfterReadNodeHook as PayloadAfterReadNodeHook,
  BeforeChangeNodeHook as PayloadBeforeChangeNodeHook,
  BeforeValidateNodeHook as PayloadBeforeValidateNodeHook,
  FeatureProviderProviderServer,
  FeatureProviderServer,
  HTMLConverter as PayloadHTMLConverter,
  NodeValidation as PayloadNodeValidation,
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
import type { Field, FrogbotRequest } from 'frogbot';
import type { JsonObject } from 'payload';

export type ExtractSerializedNode<TNode extends LexicalNode> = ReturnType<TNode['exportJSON']>;

type WithNode<TArgs, TNode extends SerializedLexicalNode> = Omit<TArgs, 'node' | 'req'> & {
  node: TNode;
  req: FrogbotRequest;
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

export type HTMLConverter<TNode extends SerializedLexicalNode = SerializedLexicalNode> = Omit<
  PayloadHTMLConverter<TNode>,
  'converter'
> & {
  converter: (
    args: Omit<Parameters<PayloadHTMLConverter<TNode>['converter']>[0], 'node' | 'req'> & {
      node: TNode;
      req: FrogbotRequest | null | undefined;
    },
  ) => ReturnType<PayloadHTMLConverter<TNode>['converter']>;
};

export type NodeWithHooks<
  TNode extends LexicalNode = LexicalNode,
  TSerializedNode extends SerializedLexicalNode = ExtractSerializedNode<TNode>,
> = {
  converters?: { html?: HTMLConverter<TSerializedNode> };
  getSubFields?: (args: { node?: TSerializedNode; req?: FrogbotRequest }) => Field[] | null;
  getSubFieldsData?: (args: { node: TSerializedNode; req: FrogbotRequest }) => JsonObject;
  graphQLPopulationPromises?: PopulationPromise<TSerializedNode>[];
  hooks?: {
    afterChange?: NodeHook<PayloadAfterChangeNodeHook<TSerializedNode>, TSerializedNode>[];
    afterRead?: NodeHook<PayloadAfterReadNodeHook<TSerializedNode>, TSerializedNode>[];
    beforeChange?: NodeHook<PayloadBeforeChangeNodeHook<TSerializedNode>, TSerializedNode>[];
    beforeValidate?: NodeHook<PayloadBeforeValidateNodeHook<TSerializedNode>, TSerializedNode>[];
  };
  node: Klass<TNode> | LexicalNodeReplacement | (new (...args: never[]) => TNode);
  validations?: NodeValidation<TSerializedNode>[];
};

type ServerNodeRegistration = Omit<NodeWithHooks<any, any>, 'node'> & {
  node: LexicalNodeReplacement | (new (...args: never[]) => unknown);
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
