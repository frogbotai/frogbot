// The unit specs run on Node 22 (`engines.node`), which has these built-ins; `test/tsconfig.json`
// targets ES2022, which doesn't declare them.
/// <reference lib="es2023.array" />
/// <reference lib="esnext.array" />
/// <reference lib="esnext.promise" />
