import type { AfterErrorHook, Endpoint, FrogbotConfig, OnInit, Plugin } from 'frogbot';

type NotesFeaturesOptions = {
  afterError: AfterErrorHook;
  endpoint: Endpoint;
  task: NonNullable<NonNullable<FrogbotConfig['jobs']>['tasks']>[number];
};

export function notesFeaturesPlugin({ afterError, endpoint, task }: NotesFeaturesOptions): Plugin {
  return (config) => ({
    ...config,
    endpoints: [...(config.endpoints ?? []), endpoint],
    hooks: {
      ...config.hooks,
      afterError: [...(config.hooks?.afterError ?? []), afterError],
    },
    jobs: {
      ...config.jobs,
      tasks: [...(config.jobs?.tasks ?? []), task],
    },
  });
}

export function notesInitPlugin(initializeNotes: OnInit): Plugin {
  return (config) => {
    const onInit =
      config.onInit === undefined
        ? []
        : Array.isArray(config.onInit)
          ? config.onInit
          : [config.onInit];

    return {
      ...config,
      onInit: [...onInit, initializeNotes],
    };
  };
}
