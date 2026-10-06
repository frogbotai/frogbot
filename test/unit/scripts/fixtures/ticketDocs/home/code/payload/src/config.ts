export function buildConfig(config: object) {
  return { ...config, hooks: { afterChange: [] } };
}
