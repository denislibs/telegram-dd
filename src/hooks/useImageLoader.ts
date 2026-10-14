import { onMount } from 'frameact';

import { preloadImage } from '../util/files';
import useAsync from './useAsync';

export type UseImageLoaderResult = {
  image?: HTMLImageElement;
};

// TODO(codemod): useImageLoader: a hook runs once; take accessors (() => x) for reactive parameters and return accessors
export default function useImageLoader(file?: Blob): UseImageLoaderResult {
  let urlRef: string | undefined;

  const { result: image } = useAsync(() => {
    if (!file) {
      return Promise.resolve(undefined);
    }

    if (urlRef) {
      URL.revokeObjectURL(urlRef);
    }

    const url = URL.createObjectURL(file);
    urlRef = url;

    return preloadImage(url);
  }, [file]);

  onMount(() => {
    return () => {
      if (urlRef) {
        URL.revokeObjectURL(urlRef);
        urlRef = undefined;
      }
    };
  });

  return { image };
}
