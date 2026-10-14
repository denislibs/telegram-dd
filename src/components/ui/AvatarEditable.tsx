import type { ChangeEvent } from 'react';
import { createEffect, createMemo, createSignal } from 'frameact';

import buildClassName from '../../util/buildClassName';

import useLang from '../../hooks/useLang';

import Icon from '../common/icons/Icon';
import CropModal from './CropModal';

import './AvatarEditable.scss';

interface OwnProps {
  title?: string;
  disabled?: boolean;
  isForForum?: boolean;
  currentAvatarBlobUrl?: string;
  onChange: (file: File) => void;
}

const AvatarEditable = (props: OwnProps) => {
  const [selectedFile, setSelectedFile] = createSignal<File | undefined>(undefined);
  const [croppedBlobUrl, setCroppedBlobUrl] = createSignal<string | undefined>(props.currentAvatarBlobUrl);

  const lang = useLang();

  createEffect(
    () => props.currentAvatarBlobUrl,
    (currentAvatarBlobUrl2) => {
      setCroppedBlobUrl(currentAvatarBlobUrl2);
    },
  );

  function handleSelectFile(event: ChangeEvent<HTMLInputElement>) {
    const target = event.target;

    if (!target?.files?.[0]) {
      return;
    }

    setSelectedFile(target.files[0]);
    target.value = '';
  }

  const handleAvatarCrop = (croppedImg: File) => {
    setSelectedFile(undefined);
    props.onChange(croppedImg);

    if (croppedBlobUrl() && croppedBlobUrl() !== props.currentAvatarBlobUrl) {
      URL.revokeObjectURL(croppedBlobUrl()!);
    }
    setCroppedBlobUrl(URL.createObjectURL(croppedImg));
  };

  const handleModalClose = () => {
    setSelectedFile(undefined);
  };

  const labelClassName = createMemo(() =>
    buildClassName(croppedBlobUrl() && 'filled', props.disabled && 'disabled', props.isForForum && 'rounded-square'),
  );

  return (
    <div class="AvatarEditable">
      <label
        class={labelClassName()}
        role="button"
        tabIndex={0}
        title={props.title || lang('ChangeYourProfilePicture')}
      >
        <input type="file" onInput={handleSelectFile} accept="image/png, image/jpeg" />
        <Icon name="camera-add" />
        {croppedBlobUrl() && <img src={croppedBlobUrl()} draggable={false} alt="" />}
      </label>
      <CropModal file={selectedFile()} onClose={handleModalClose} onChange={handleAvatarCrop} />
    </div>
  );
};

export default AvatarEditable;
