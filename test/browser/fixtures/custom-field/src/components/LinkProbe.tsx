'use client';

import { Button, DropdownMenuItem } from '@frogbotai/ui';

export function LogoutLinkProbe() {
  return (
    <DropdownMenuItem asChild className="frogbot-account-menu__item">
      <a data-testid="link-probe-logout" href="/logout">
        Log out
      </a>
    </DropdownMenuItem>
  );
}

export function LoginLinkProbe() {
  return (
    <div>
      <Button asChild variant="outline">
        <a data-testid="login-link-probe" href="/help">
          Help
        </a>
      </Button>
      <Button data-testid="login-button-probe" type="button" variant="outline">
        Help
      </Button>
    </div>
  );
}
