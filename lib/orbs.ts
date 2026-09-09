import type { ComponentType } from "react";

import { orb01Orb, Orb01 } from "@/components/orbs/orb-01";
import { orb02Orb, Orb02 } from "@/components/orbs/orb-02";
import { orb03Orb, Orb03 } from "@/components/orbs/orb-03";
import { orb04Orb, Orb04 } from "@/components/orbs/orb-04";
import { orb05Orb, Orb05 } from "@/components/orbs/orb-05";
import { orb06Orb, Orb06 } from "@/components/orbs/orb-06";
import { orb07Orb, Orb07 } from "@/components/orbs/orb-07";
import { orb08Orb, Orb08 } from "@/components/orbs/orb-08";
import { orb09Orb, Orb09 } from "@/components/orbs/orb-09";
import { orb10Orb, Orb10 } from "@/components/orbs/orb-10";
import { orb11Orb, Orb11 } from "@/components/orbs/orb-11";
import { orb12Orb, Orb12 } from "@/components/orbs/orb-12";
import { orb13Orb, Orb13 } from "@/components/orbs/orb-13";
import { orb14Orb, Orb14 } from "@/components/orbs/orb-14";
import { orb15Orb, Orb15 } from "@/components/orbs/orb-15";
import { orb16Orb, Orb16 } from "@/components/orbs/orb-16";
import { orb17Orb, Orb17 } from "@/components/orbs/orb-17";
import { orb18Orb, Orb18 } from "@/components/orbs/orb-18";
import { orb19Orb, Orb19 } from "@/components/orbs/orb-19";
import { orb20Orb, Orb20 } from "@/components/orbs/orb-20";
import { orb21Orb, Orb21 } from "@/components/orbs/orb-21";
import { orb22Orb, Orb22 } from "@/components/orbs/orb-22";
import { orb23Orb, Orb23 } from "@/components/orbs/orb-23";
import { orb24Orb, Orb24 } from "@/components/orbs/orb-24";
import { orb25Orb, Orb25 } from "@/components/orbs/orb-25";
import { orb26Orb, Orb26 } from "@/components/orbs/orb-26";
import { orb27Orb, Orb27 } from "@/components/orbs/orb-27";
import { orb28Orb, Orb28 } from "@/components/orbs/orb-28";
import { orb29Orb, Orb29 } from "@/components/orbs/orb-29";
import { orb30Orb, Orb30 } from "@/components/orbs/orb-30";
import { orb31Orb, Orb31 } from "@/components/orbs/orb-31";
import { orb32Orb, Orb32 } from "@/components/orbs/orb-32";
import { orb33Orb, Orb33 } from "@/components/orbs/orb-33";
import type {
  OrbVariant,
  ShaderOrbProps,
} from "@/components/orbs/orbkit-core-wgpu";

export interface OrbEntry {
  Component: ComponentType<Omit<ShaderOrbProps, "variant">>;
  variant: OrbVariant;
}

/** Every shipped orb, keyed by its registry slug — the docs and playground share this. */
export const ORBS: Record<string, OrbEntry> = {
  "orb-01": { Component: Orb01, variant: orb01Orb },
  "orb-02": { Component: Orb02, variant: orb02Orb },
  "orb-03": { Component: Orb03, variant: orb03Orb },
  "orb-04": { Component: Orb04, variant: orb04Orb },
  "orb-05": { Component: Orb05, variant: orb05Orb },
  "orb-06": { Component: Orb06, variant: orb06Orb },
  "orb-07": { Component: Orb07, variant: orb07Orb },
  "orb-08": { Component: Orb08, variant: orb08Orb },
  "orb-09": { Component: Orb09, variant: orb09Orb },
  "orb-10": { Component: Orb10, variant: orb10Orb },
  "orb-11": { Component: Orb11, variant: orb11Orb },
  "orb-12": { Component: Orb12, variant: orb12Orb },
  "orb-13": { Component: Orb13, variant: orb13Orb },
  "orb-14": { Component: Orb14, variant: orb14Orb },
  "orb-15": { Component: Orb15, variant: orb15Orb },
  "orb-16": { Component: Orb16, variant: orb16Orb },
  "orb-17": { Component: Orb17, variant: orb17Orb },
  "orb-18": { Component: Orb18, variant: orb18Orb },
  "orb-19": { Component: Orb19, variant: orb19Orb },
  "orb-20": { Component: Orb20, variant: orb20Orb },
  "orb-21": { Component: Orb21, variant: orb21Orb },
  "orb-22": { Component: Orb22, variant: orb22Orb },
  "orb-23": { Component: Orb23, variant: orb23Orb },
  "orb-24": { Component: Orb24, variant: orb24Orb },
  "orb-25": { Component: Orb25, variant: orb25Orb },
  "orb-26": { Component: Orb26, variant: orb26Orb },
  "orb-27": { Component: Orb27, variant: orb27Orb },
  "orb-28": { Component: Orb28, variant: orb28Orb },
  "orb-29": { Component: Orb29, variant: orb29Orb },
  "orb-30": { Component: Orb30, variant: orb30Orb },
  "orb-31": { Component: Orb31, variant: orb31Orb },
  "orb-32": { Component: Orb32, variant: orb32Orb },
  "orb-33": { Component: Orb33, variant: orb33Orb },
};
