'use client';

import { Button, useBulkUpload, useModal, useRouter, useTranslation } from '@payloadcms/ui';

/** Payload's list-header Bulk upload button, for upload collections that allow it. */
export function BulkUploadButton({ collectionSlug }: { collectionSlug: string }) {
  const { modalSlug, setCollectionSlug, setOnSuccess, setParentID } = useBulkUpload();
  const { openModal } = useModal();
  const router = useRouter();
  const { t } = useTranslation();

  const open = () => {
    setCollectionSlug(collectionSlug);
    setParentID(undefined);
    openModal(modalSlug);
    setOnSuccess(() => router.refresh());
  };

  return (
    <Button aria-label={t('upload:bulkUpload')} buttonStyle="pill" onClick={open} size="medium">
      {t('upload:bulkUpload')}
    </Button>
  );
}
