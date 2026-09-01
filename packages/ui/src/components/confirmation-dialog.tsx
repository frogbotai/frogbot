'use client';
import { Button } from './button.js';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from './dialog.js';
export type ConfirmationDialogProps = {
  description?: string;
  loadingText?: string;
  onCancel?: () => void;
  onConfirm?: () => void;
  onOpenChange?: (open: boolean) => void;
  open?: boolean;
  primaryButtonText: string;
  secondaryButtonText: string;
  showLoadingOverlay?: boolean;
  title: string;
};
export function ConfirmationDialog({
  description,
  loadingText = 'Loading...',
  onCancel,
  onConfirm,
  onOpenChange,
  open,
  primaryButtonText,
  secondaryButtonText,
  showLoadingOverlay = false,
  title,
}: ConfirmationDialogProps) {
  const close = (callback?: () => void) => {
    callback?.();
    onOpenChange?.(false);
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel?.();
        onOpenChange?.(next);
      }}
    >
      <DialogContent className="fb-confirmation-dialog">
        <DialogTitle>{title}</DialogTitle>
        {description && <DialogDescription>{description}</DialogDescription>}
        <DialogFooter>
          <Button variant="secondary" onClick={() => close(onCancel)} disabled={showLoadingOverlay}>
            {secondaryButtonText}
          </Button>
          <Button onClick={() => close(onConfirm)} disabled={showLoadingOverlay}>
            {primaryButtonText}
          </Button>
        </DialogFooter>
        {showLoadingOverlay && (
          <div className="fb-confirmation-dialog__loading" role="status">
            {loadingText}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
