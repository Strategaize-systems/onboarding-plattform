// SLC-141 MT-2 (FEAT-060) — Block-Section-Komponente fuer PDF.
// Title (brand-primary) + Intro (italic muted) + Comment (KI-Verdichtung).

import React from "react";
import { View, Text } from "@react-pdf/renderer";
import { styles } from "../styles";

export interface BlockSectionData {
  key: string;
  title: string;
  intro?: string;
  comment: string;
}

interface Props {
  block: BlockSectionData;
}

export function BlockSectionPdf({ block }: Props) {
  return (
    <View style={styles.blockSection} wrap={false}>
      <Text style={styles.blockTitle}>{block.title}</Text>
      {block.intro ? <Text style={styles.blockIntro}>{block.intro}</Text> : null}
      <Text style={styles.blockComment}>{block.comment}</Text>
    </View>
  );
}
