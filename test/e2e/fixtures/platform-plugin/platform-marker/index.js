export default (config) => ({
  ...config,
  custom: { ...config.custom, platformMarker: 'fixture-platform-marker' },
});
