import { type ConfigFile, getProperty, objectProperty, quote, setProperty } from './config.js';
import { CliError } from './errors.js';

export function applyMeta(config: ConfigFile, projectName: string): void {
  const name = quote(projectName);
  const admin = objectProperty(config.object, 'admin');
  const meta = admin && objectProperty(admin, 'meta');

  if (
    (!admin && getProperty(config.object, 'admin')) ||
    (admin && !meta && getProperty(admin, 'meta'))
  ) {
    throw new CliError(
      `Can't set admin.meta.applicationName in ${config.path}: admin and admin.meta must be object literals.`,
    );
  }

  if (!admin || admin.getProperties().length === 0) {
    setProperty(config.object, 'admin', `{ meta: { applicationName: ${name} } }`);
  } else if (!meta || meta.getProperties().length === 0) {
    setProperty(admin, 'meta', `{ applicationName: ${name} }`);
  } else {
    setProperty(meta, 'applicationName', name);
  }
}
