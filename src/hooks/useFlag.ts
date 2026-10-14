import { createSignal } from 'frameact';

// TODO(codemod): useFlag: a hook runs once; take accessors (() => x) for reactive parameters and return accessors
const useFlag = (initial = false, debugKey?: string): [boolean, NoneToVoidFunction, NoneToVoidFunction] => {
  const [value, setValue] = createSignal(initial);

  const setTrue = () => {
    setValue(true);
  };

  const setFalse = () => {
    setValue(false);
  };

  return [value, setTrue, setFalse];
};

export default useFlag;
