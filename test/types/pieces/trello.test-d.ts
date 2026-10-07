import { createTrello } from '@frogbotai/piece-trello';
import { expectTypeOf } from 'vitest';

const trello = createTrello({
  auth: { username: 'key', password: 'token', applicationSecret: 'secret' },
});

const _card = trello.createCard({ input: { boardId: 'board', listId: 'list', name: 'Task' } });

expectTypeOf<Parameters<typeof trello.createCard>[0]['input']>().toEqualTypeOf<{
  boardId: string;
  listId: string;
  name: string;
  description?: string | undefined;
  position?: 'top' | 'bottom' | undefined;
  labelIds?: string[] | undefined;
}>();

expectTypeOf<Awaited<typeof _card>['id']>().toEqualTypeOf<string>();
expectTypeOf<Awaited<typeof _card>['due']>().toEqualTypeOf<string | null | undefined>();

const _createCardRejectsGetCardAttachmentInput = () =>
  // @ts-expect-error createCard does not accept getCardAttachment input
  trello.createCard({ input: { cardId: 'card', attachmentId: 'attachment' } });

const _attachments = trello.listCardAttachments({ input: { cardId: 'card' } });

expectTypeOf<Awaited<typeof _attachments>[number]['url']>().toEqualTypeOf<string>();

expectTypeOf<keyof typeof trello.triggers>().toEqualTypeOf<
  'cardCreated' | 'cardMovedToList' | 'cardDeadline'
>();

expectTypeOf(trello.triggers.cardMovedToList.type).toEqualTypeOf<'webhook'>();
expectTypeOf(trello.triggers.cardDeadline.type).toEqualTypeOf<'polling'>();
