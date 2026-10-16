// FOUNDATION STUB: MediaEditor.async (telegram-tt src/components/ui/mediaEditor/MediaEditor.async.tsx) is ported with a later slice. It keeps tt's props so that
// the callers compile; it renders nothing.
// Deviation: the sync MediaEditor is not in src yet, so its OwnProps are copied here and exported from this file.
export type OwnProps = {
  isOpen: boolean;
  imageUrl?: string;
  mimeType?: string;
  filename?: string;
  onClose: VoidFunction;
  onSave: (file: File) => void;
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const MediaEditorAsync = (_props: OwnProps) => undefined;

export default MediaEditorAsync;
