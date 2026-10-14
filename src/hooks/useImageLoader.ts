import { type Accessor, onMount } from 'frameact';

import { type MaybeAccessor, read } from '../util/accessors';
import { preloadImage } from '../util/files';
import useAsync from './useAsync';

export type UseImageLoaderResult = {
  image: Accessor<HTMLImageElement | undefined>;
};

export default function useImageLoader(file?: MaybeAccessor<Blob | undefined>): UseImageLoaderResult {
  let urlRef: string | undefined;

  const { result: image } = useAsync(
    () => {
      const file2 = read(file);
      if (!file2) {
        return Promise.resolve(undefined);
      }

      if (urlRef) {
        URL.revokeObjectURL(urlRef);
      }

      const url = URL.createObjectURL(file2);
      urlRef = url;

      return preloadImage(url);
    },
    () => [read(file)],
  );

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
