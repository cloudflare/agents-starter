import { useEffect, useRef } from "react";

const useClickOutside = (callback: () => void) => {
  const ref = useRef<any | null>(null);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        callback();
      }
    };

    document.addEventListener("click", handleClick);

    return () => {
      document.removeEventListener("click", handleClick);
    };
  }, [ref, callback]);

  return ref;
};

export default useClickOutside;
