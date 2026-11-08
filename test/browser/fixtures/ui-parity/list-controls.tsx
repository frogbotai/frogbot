import { createRoot } from 'react-dom/client';

import { List, ListItem } from '../../../../packages/ui/src/components/list';

createRoot(document.getElementById('root')!).render(
  <div id="g" style={{ width: 720, padding: 16 }}>
    <List>
      <ListItem
        href="#row"
        meta={
          <>
            <input aria-label="Meta checkbox" type="checkbox" />
            <select aria-label="Meta select">
              <option>One</option>
            </select>
            <label>
              <input type="checkbox" /> Meta label
            </label>
            <span role="button" tabIndex={0}>
              Meta role button
            </span>
          </>
        }
        subtitle={
          <>
            Due soon <input aria-label="Subtitle checkbox" type="checkbox" />
          </>
        }
        title="Row with controls"
      />
    </List>
  </div>,
);
