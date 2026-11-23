// src/components/SubscribersField.tsx
'use client';

import { Fact, FactList, Value } from '@frogbotai/ui';
import { useField } from '@frogbotai/ui/admin';
import type { NumberFieldClientProps } from 'frogbot';

export const SubscribersField = ({ field, path }: NumberFieldClientProps) => {
  const { value } = useField<number>({ path });

  return (
    <FactList layout="stacked">
      <Fact label={String(field.label ?? 'Subscribers')}>
        <Value format="compact" value={value} />
      </Fact>
    </FactList>
  );
};
