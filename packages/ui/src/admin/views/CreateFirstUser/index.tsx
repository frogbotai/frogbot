import { CreateFirstUserView as PayloadCreateFirstUserView } from '@payloadcms/ui/views/CreateFirstUser';
import type { AdminViewServerProps } from 'payload';

import { SignInButtons } from '../../elements/SignInButtons/index.js';

export async function CreateFirstUserView(props: AdminViewServerProps) {
  const view = await PayloadCreateFirstUserView(props);

  return (
    <>
      {view}
      <div className="fb-create-first-user__sign-in">
        <SignInButtons payload={props.initPageResult.req.payload} />
      </div>
    </>
  );
}
