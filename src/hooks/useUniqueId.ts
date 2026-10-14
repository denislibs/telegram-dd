import generateUniqueId from '../util/generateUniqueId';

export default function useUniqueId() {
  let idRef: string | undefined;

  if (!idRef) {
    idRef = generateUniqueId();
  }

  return idRef;
}
