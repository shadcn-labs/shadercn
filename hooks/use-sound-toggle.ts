"use client";

import { useAtom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import { useCallback } from "react";
import { useHotkeys } from "react-hotkeys-hook";

import { useFeedback } from "@/hooks/use-feedback";

export const soundEnabledAtom = atomWithStorage("shadercn-sound", true);

export const useSoundEnabled = () => useAtom(soundEnabledAtom);

export const useSoundToggle = () => {
  const [soundEnabled, setSoundEnabled] = useSoundEnabled();
  const feedbackOn = useFeedback({ sound: "toggleOn" });
  const feedbackOff = useFeedback({ sound: "toggleOff" });

  const toggleSound = useCallback(() => {
    const next = !soundEnabled;
    if (next) {
      feedbackOn();
    } else {
      feedbackOff();
    }
    setSoundEnabled(next);
  }, [soundEnabled, setSoundEnabled, feedbackOn, feedbackOff]);

  useHotkeys("s", () => toggleSound(), { preventDefault: true });

  return { toggleSound };
};
