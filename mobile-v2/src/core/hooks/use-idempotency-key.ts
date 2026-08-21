import { useRef } from "react";
import { createIdempotencyKey } from "../api/planet-api";

// One key represents one user intent. If a request times out after the server
// committed it, retrying the same form must replay the original result rather
// than create a second Pet, record, care plan, medication, or share.
export function useIdempotencyKey() {
  const keyRef = useRef<string | undefined>(undefined);
  return {
    current: () => {
      keyRef.current ??= createIdempotencyKey();
      return keyRef.current;
    },
    reset: () => {
      keyRef.current = undefined;
    },
  };
}
