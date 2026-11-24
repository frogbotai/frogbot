import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  OptionPill,
} from '@frogbotai/ui';
import type { WidgetServerProps } from 'frogbot';

const colors = ['blue', 'green', 'purple', 'pink', 'yellow', 'red'] as const;

/** Asana Home's projects: a compact tile per project that opens its tasks, and Create project. */
export async function ProjectsWidget({ permissions, req }: WidgetServerProps) {
  const { docs } = await req.frogbot.find({
    collection: 'projects',
    depth: 0,
    limit: 12,
    overrideAccess: false,
    req,
    select: { key: true, name: true },
    sort: 'name',
  });

  return (
    <Card className="asana-projects">
      <CardHeader>
        <CardTitle>Projects</CardTitle>
      </CardHeader>
      <CardContent className="asana-projects__grid">
        {permissions?.collections?.projects?.create ? (
          <a
            className="asana-projects__tile"
            href="/collections/projects/create"
          >
            <span
              aria-hidden
              className="asana-projects__icon asana-projects__icon--new"
            >
              +
            </span>
            Create project
          </a>
        ) : null}
        {docs.map((project, index) => (
          <a
            className="asana-projects__tile"
            href={`/collections/tasks?where[project][equals]=${project.id}`}
            key={project.id}
          >
            <OptionPill
              aria-hidden
              className="asana-projects__icon"
              color={colors[index % colors.length]}
            >
              {project.key.slice(0, 3)}
            </OptionPill>
            <span className="asana-projects__name">{project.name}</span>
          </a>
        ))}
      </CardContent>
    </Card>
  );
}
