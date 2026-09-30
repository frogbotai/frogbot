import type { RootComponentServerProps } from 'frogbot';

function frogbotState(req: RootComponentServerProps['req']) {
  return req?.frogbot ? 'attached' : 'missing';
}

export function BeforeAccount({ req }: RootComponentServerProps) {
  return (
    <div data-frogbot={frogbotState(req)} data-testid="account-menu-probe" role="menuitem">
      Before account
    </div>
  );
}

export function AfterAccount({ req }: RootComponentServerProps) {
  return (
    <div data-frogbot={frogbotState(req)} data-testid="account-menu-probe" role="menuitem">
      After account
    </div>
  );
}

export function LogoutProbe({ req }: RootComponentServerProps) {
  return (
    <a
      data-frogbot={frogbotState(req)}
      data-testid="account-menu-probe"
      href="https://identity.example.com/sign-out"
      role="menuitem"
    >
      Sign out everywhere
    </a>
  );
}
