import { type Accessor, createSignal } from 'frameact';

// Deviation: returns an accessor (frameact components run once); call sites read `isOpen()`.
const useFlag = (initial = false, debugKey?: string): [Accessor<boolean>, NoneToVoidFunction, NoneToVoidFunction] => {
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
