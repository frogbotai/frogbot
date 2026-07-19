// FrogBot's database adapter alias. Adapters are third-party packages
// (e.g. @payloadcms/db-mongodb, @payloadcms/db-postgres) that the user
// invokes and assigns to `db`. We accept whatever those packages return
// without referencing `payload` from the public surface; the internal
// mapping module is the only place that knows the precise runtime shape.
//
// The shape below matches every Payload-ecosystem adapter's factory
// return value: a small descriptor object whose `init` function binds
// the adapter to the host CMS at runtime.
//
// NOTE: the property name `payload` inside `init`'s args is NOT a
// FrogBot naming choice — it is the wire contract dictated by every
// adapter package. Renaming this key would break every adapter we
// accept. The type alias name (`DatabaseAdapter`) and where it surfaces
// in `FrogbotConfig` are ours; the shape belongs to the adapter
// ecosystem we deliberately stay compatible with.

export type DatabaseAdapter = {
  init: (args: { payload: any }) => unknown;
  defaultIDType: 'number' | 'text';
  name?: string;
  allowIDOnCreate?: boolean;
};
