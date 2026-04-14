export interface Tutorial {
  id: string;
  titleKey: string;
  descriptionKey: string;
  durationSeconds: number;
  thumbnailPath: string;
}

/**
 * Video path is constructed at runtime with locale:
 * /videos/tutorial-{id}-{locale}.mp4
 */
export function getTutorialVideoPath(id: string, locale: string): string {
  return `/videos/tutorial-${id}-${locale}.mp4`;
}

export const TUTORIALS: Tutorial[] = [
  {
    id: "01",
    titleKey: "learning.tutorials.t01.title",
    descriptionKey: "learning.tutorials.t01.description",
    durationSeconds: 0,
    thumbnailPath: "/videos/tutorial-01-thumb.svg",
  },
  {
    id: "02",
    titleKey: "learning.tutorials.t02.title",
    descriptionKey: "learning.tutorials.t02.description",
    durationSeconds: 0,
    thumbnailPath: "/videos/tutorial-02-thumb.svg",
  },
  {
    id: "03",
    titleKey: "learning.tutorials.t03.title",
    descriptionKey: "learning.tutorials.t03.description",
    durationSeconds: 0,
    thumbnailPath: "/videos/tutorial-03-thumb.svg",
  },
  {
    id: "04",
    titleKey: "learning.tutorials.t04.title",
    descriptionKey: "learning.tutorials.t04.description",
    durationSeconds: 0,
    thumbnailPath: "/videos/tutorial-04-thumb.svg",
  },
];
