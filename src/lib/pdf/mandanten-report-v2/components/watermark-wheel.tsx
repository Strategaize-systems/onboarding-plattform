// V8 SLC-150 MT-3 — Watermark-Wheel-Variante fuer Cover-Page-Hintergrund.
//
// Wrapper um Wheel-Component mit Position-Absolute + Low-Opacity-Container.
// Wheel selbst nutzt unveraenderte computeWheelPaths-Farben — Opazitaet
// kommt vom umgebenden View (View.opacity unterstuetzt @react-pdf v4).

import React from "react";
import { View } from "@react-pdf/renderer";

import { Wheel } from "../wheel";
import type { ModuleScores } from "@/lib/diagnose/types";

interface WatermarkWheelProps {
  moduleScores: ModuleScores;
  /** Pixel-Position rechts unten relativ zur Cover-Page. Default unten-rechts. */
  size?: number;
}

export function WatermarkWheel({ moduleScores, size = 380 }: WatermarkWheelProps) {
  return (
    <View
      style={{
        position: "absolute",
        right: -size * 0.25,
        bottom: -size * 0.25,
        opacity: 0.08,
      }}
    >
      <Wheel moduleScores={moduleScores} size={size} showLabels={false} />
    </View>
  );
}
