"use client";

import { defineSound } from "@web-kits/audio";
import { useAtom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import { useCallback } from "react";
import { useHotkeys } from "react-hotkeys-hook";

import * as audio from "@/audio/core";

export const soundEnabledAtom = atomWithStorage("shadercn-sound", true);

export const useSoundEnabled = () => useAtom(soundEnabledAtom);

export const useSoundToggle = () => {
  const [soundEnabled, setSoundEnabled] = useAtom(soundEnabledAtom);

  const toggleSound = useCallback(() => {
    if (soundEnabled) {
      defineSound(audio._patch.sounds["toggle-off"])();
      setSoundEnabled(false);
    } else {
      setSoundEnabled(true);
      defineSound(audio._patch.sounds["toggle-on"])();
    }
  }, [soundEnabled, setSoundEnabled]);

  useHotkeys("s", () => toggleSound(), { preventDefault: true });

  return { toggleSound };
};
