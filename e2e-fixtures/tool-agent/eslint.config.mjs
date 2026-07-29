import rootConfig from '../../eslint.config.js';

export default [
  ...rootConfig,
  {
    files: ['next.config.ts'],
    rules: { 'no-restricted-exports': 'off' },
  },
];
