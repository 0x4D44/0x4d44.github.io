export type RouteType = "main" | "side";
export type Politeness = "safe polite" | "very polite" | "polite friendly" | "safe polite respectful" | "emergency direct" | string;

export interface PhraseVariant { label: string; japanese: string; }
export interface Phrase {
  id: string;
  japanese: string;
  kana: string;
  romaji: string;
  english: string;
  politeness: Politeness;
  usage: string;
  variants: PhraseVariant[];
}
export interface SignNote { id: string; text: string; reading: string; meaning: string; where: string; note: string; }
export interface GrammarNote { title: string; body: string; pattern: string; examples: string[]; }
export interface CultureNote { title: string; body: string; }
export interface RoleplayStep {
  npc: string;
  prompt: string;
  expectedPhraseIds: string[];
  acceptKeywords: string[];
  localMightSay: string;
  tip: string;
}
export interface Roleplay { title: string; setting: string; npcLine: string; userGoal: string; steps: RoleplayStep[]; }
export interface Chapter {
  id: string;
  order: number;
  routeType: RouteType;
  title: string;
  mapLabel: string;
  region: string;
  guideId: string;
  stamp: string;
  travelItem: string;
  unlockAfter: string | null;
  summary: string;
  goal: string;
  grammar: GrammarNote[];
  phrases: Phrase[];
  kana: { title: string; rows: string[] };
  signs: SignNote[];
  culture: CultureNote[];
  roleplay: Roleplay;
  confidence: string[];
}
export interface ReviewCard {
  id: string;
  sourceId: string;
  chapterId: string;
  type: "phrase" | "sign";
  front: string;
  back: string;
  prompt: string;
  due: number;
  intervalDays: number;
  ease: number;
  lapses: number;
  reps: number;
  lastGrade: string | null;
}
