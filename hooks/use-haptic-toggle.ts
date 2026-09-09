"use client";

import { useAtom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import { useCallback } from "react";
import { useHotkeys } from "react-hotkeys-hook";

import { useFeedback } from "@/hooks/use-feedback";

const hapticsEnabledAtom = atomWithStorage("haptics-enabled", false);

export const useHapticsEnabled = () => useAtom(hapticsEnabledAtom);

export const useHapticsToggle = () => {
  const [hapticsEnabled, setHapticsEnabled] = useHapticsEnabled();
  const feedbackOn = useFeedback({ sound: "toggleOn" });
  const feedbackOff = useFeedback({ sound: "toggleOff" });

  const toggleHaptics = useCallback(() => {
    const next = !hapticsEnabled;
    if (next) {
      feedbackOn();
    } else {
      feedbackOff();
    }
    setHapticsEnabled(next);
  }, [hapticsEnabled, setHapticsEnabled, feedbackOn, feedbackOff]);

  useHotkeys("h", () => toggleHaptics(), { preventDefault: true });

  return { toggleHaptics };
};
