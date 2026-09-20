# Ticket 135 fence coverage

Each executable fence is assigned once to a complete sample module. Repeated fences in a section are successive extracts of the same module.

| Page                      | Executable fences in source order | Compiling module                                     |
| ------------------------- | --------------------------------- | ---------------------------------------------------- |
| `blocks.mdx`              | 1-3, 10-11                        | `blocks/config.ts`                                   |
| `blocks.mdx`              | 4, 6-9                            | `blocks/components.tsx`                              |
| `blocks.mdx`              | 5                                 | `blocks/server-components.tsx`                       |
| `custom-features.mdx`     | 1-2                               | `custom-features/pages.ts`                           |
| `custom-features.mdx`     | 3, 5-8, 10, 24                    | `custom-features/divider/feature.server.ts`          |
| `custom-features.mdx`     | 4                                 | `custom-features/divider/markdownTransformer.ts`     |
| `custom-features.mdx`     | 9, 11, 13, 15-17, 19-23           | `custom-features/divider/feature.client.tsx`         |
| `custom-features.mdx`     | 12                                | `custom-features/divider/nodes/DividerNode.tsx`      |
| `custom-features.mdx`     | 14                                | `custom-features/divider/plugin.tsx`                 |
| `custom-features.mdx`     | 18                                | `custom-features/divider/components/DividerIcon.tsx` |
| `views.mdx`               | 1, 3-6                            | `views/views.tsx`                                    |
| `views.mdx`               | 2                                 | `views/config.ts`                                    |
| `views.mdx`               | 7                                 | `views/ActiveView.tsx`                               |
| `views.mdx`               | 8                                 | `views/PostBody.tsx`                                 |
| `rendering-on-demand.mdx` | 1, 3                              | `rendering-on-demand.tsx`                            |
| `rendering-on-demand.mdx` | 2, 4                              | `rendering-on-demand-config.ts`                      |
