import type { ComponentProps, ReactNode } from 'react';

/** Props for {@link List}: a plain `<ul>` of {@link ListItem} rows. */
export type ListProps = ComponentProps<'ul'>;

/** A calm list of rows, separated by hairlines, with no column borders or header. */
export function List({ className, ...props }: ListProps) {
  return <ul className={`fb-list${className ? ` ${className}` : ''}`} {...props} />;
}

/** Props for {@link ListItem}. With `href`, the whole row opens the link; links and buttons in `subtitle` or `meta` stay clickable on their own. */
export type ListItemProps = Omit<ComponentProps<'li'>, 'title'> & {
  /** Shown before the title, such as an icon or avatar. */
  leading?: ReactNode;
  title: ReactNode;
  /** A muted second line under the title. */
  subtitle?: ReactNode;
  /** Trailing details, right-aligned on wide rows and wrapped under the title on narrow ones. */
  meta?: ReactNode;
  href?: string;
};

/** One row of a {@link List}. */
export function ListItem({
  className,
  leading,
  title,
  subtitle,
  meta,
  href,
  ...props
}: ListItemProps) {
  const classes = `fb-list__item${href ? ' fb-list__item--link' : ''}${className ? ` ${className}` : ''}`;

  return (
    <li className={classes} {...props}>
      {leading ? <div className="fb-list__leading">{leading}</div> : null}
      <div className="fb-list__body">
        <div className="fb-list__title">
          {href ? (
            <a className="fb-list__link" href={href}>
              {title}
            </a>
          ) : (
            title
          )}
        </div>
        {subtitle ? <div className="fb-list__subtitle">{subtitle}</div> : null}
      </div>
      {meta ? <div className="fb-list__meta">{meta}</div> : null}
    </li>
  );
}
