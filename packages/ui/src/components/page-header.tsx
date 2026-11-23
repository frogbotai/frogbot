import type { HTMLAttributes, ReactNode } from 'react';

export type PageHeaderProps = Omit<HTMLAttributes<HTMLElement>, 'title'> & {
  /** Buttons on the right: one primary action, the rest in a menu. */
  actions?: ReactNode;
  /** Content under the header, such as tabs. */
  after?: ReactNode;
  /** One line under the title that answers "what needs me?", such as `2 items to reorder`. */
  description?: ReactNode;
  /** The page title. */
  title: ReactNode;
};

/** The header of a custom view, laid out like the admin's own list and document headers. */
export function PageHeader({
  actions,
  after,
  className,
  description,
  title,
  ...props
}: PageHeaderProps) {
  return (
    <header className={`fb-page-header${className ? ` ${className}` : ''}`} {...props}>
      <div className="fb-page-header__content">
        <div className="fb-page-header__text">
          <h1 className="fb-page-header__title">{title}</h1>
          {description && <p className="fb-page-header__description">{description}</p>}
        </div>
        {actions && <div className="fb-page-header__actions">{actions}</div>}
      </div>
      {after && <div className="fb-page-header__after">{after}</div>}
    </header>
  );
}
