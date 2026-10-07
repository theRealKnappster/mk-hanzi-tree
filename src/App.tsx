import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart3,
  BookOpen,
  Headphones,
  Moon,
  PencilLine,
  RotateCcw,
  Sun,
  Volume2,
  X,
} from "lucide-react";
import hsk1WordsData from "./data/hsk1.json";
import hsk2WordsData from "./data/hsk2.json";
import WritingPractice from "./practice/WritingPractice";
import AppBackup, { PROGRESS_KEY } from "./AppBackup";

type Pathway = "writing" | "sound" | "meaning";
type WordPathway = Exclude<Pathway, "writing">;

type StrokeKey = keyof typeof STROKES;

type Tone = 1 | 2 | 3 | 4 | 5;

type HskWord = {
  word: string;
  syllables: string[];
  tones: Tone[];
  meaning: string;
  level: 1 | 2;
};

type HanziItem = {
  character: string;
  pinyin: string;
  meaning: string;
  tone: Tone;
  strokes?: StrokeKey[];
  note: string;
  contextWord: string;
  contextPinyin: string;
  contextMeaning: string;
};

type CoreHanziItem = Omit<HanziItem, "contextWord" | "contextPinyin" | "contextMeaning">;

type CharacterProgress = Record<Pathway, number> & {
  attempts: Record<Pathway, number>;
  correct: Record<Pathway, number>;
};

type WordProgress = Record<Pathway, number> & {
  attempts: Record<Pathway, number>;
  correct: Record<Pathway, number>;
};

export type StoredProgress = {
  introduced: number;
  sessions: number;
  totalPrompts: number;
  characters: Record<string, CharacterProgress>;
  words: Record<string, WordProgress>;
};

type Prompt =
  | { pathway: "writing"; itemIndex: number }
  | { pathway: "writing"; wordIndex: number }
  | { pathway: WordPathway; wordIndex: number };

type WriterInstance = {
  animateCharacter: (options?: { onComplete?: () => void }) => void;
  animateStroke: (strokeNum: number, options?: { onComplete?: () => void }) => void;
  quiz: (options?: {
    onMistake?: (data: { strokeNum: number }) => void;
    onCorrectStroke?: (data: { strokeNum: number }) => void;
    onComplete?: () => void;
    showHintAfterMisses?: number;
  }) => void;
};

type CharacterJson = {
  strokes: string[];
  medians: number[][][];
  radStrokes?: number[];
};

const STORAGE_KEY = PROGRESS_KEY;
const LEGACY_STORAGE_SUFFIX = "-hanzi-lab-progress-v1";
const SESSION_LENGTH = 12;
const APP_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const STROKES = {
  heng: { mark: "一", hanzi: "横", pinyin: "héng", english: "horizontal", direction: "left to right" },
  shu: { mark: "丨", hanzi: "竖", pinyin: "shù", english: "vertical", direction: "top to bottom" },
  pie: { mark: "丿", hanzi: "撇", pinyin: "piě", english: "left-falling", direction: "down and left" },
  na: { mark: "㇏", hanzi: "捺", pinyin: "nà", english: "right-falling", direction: "down and right" },
  dian: { mark: "丶", hanzi: "点", pinyin: "diǎn", english: "dot", direction: "a short downward press" },
  ti: { mark: "㇀", hanzi: "提", pinyin: "tí", english: "rising", direction: "up and right" },
  heng_zhe: { mark: "㇕", hanzi: "横折", pinyin: "héng zhé", english: "horizontal-turn", direction: "right, then turn down" },
  shu_gou: { mark: "亅", hanzi: "竖钩", pinyin: "shù gōu", english: "vertical-hook", direction: "down, then hook" },
  wan_gou: { mark: "㇁", hanzi: "弯钩", pinyin: "wān gōu", english: "curved hook", direction: "curve down, then hook" },
  pie_dian: { mark: "㇛", hanzi: "撇点", pinyin: "piě diǎn", english: "left-fall–dot", direction: "fall left, then continue right" },
  heng_pie: { mark: "㇇", hanzi: "横撇", pinyin: "héng piě", english: "horizontal–left-fall", direction: "right, then turn down-left" },
  heng_gou: { mark: "乛", hanzi: "横钩", pinyin: "héng gōu", english: "horizontal-hook", direction: "right, then hook" },
  xie_gou: { mark: "㇂", hanzi: "斜钩", pinyin: "xié gōu", english: "slant-hook", direction: "slant down-right, then hook" },
  heng_zhe_gou: { mark: "㇆", hanzi: "横折钩", pinyin: "héng zhé gōu", english: "horizontal-turn-hook", direction: "right, turn down, then hook" },
  shu_wan_gou: { mark: "乚", hanzi: "竖弯钩", pinyin: "shù wān gōu", english: "vertical-curve-hook", direction: "down, curve right, then hook" },
} as const;

const STROKE_BUILDING_BLOCKS = [
  { mark: "一", hanzi: "横", pinyin: "héng", english: "horizontal", direction: "left to right" },
  { mark: "丨", hanzi: "竖", pinyin: "shù", english: "vertical", direction: "top to bottom" },
  { mark: "丿", hanzi: "撇", pinyin: "piě", english: "left-falling", direction: "down and left" },
  { mark: "㇏", hanzi: "捺", pinyin: "nà", english: "right-falling", direction: "down and right" },
  { mark: "丶", hanzi: "点", pinyin: "diǎn", english: "dot", direction: "a short downward press" },
  { mark: "㇀", hanzi: "提", pinyin: "tí", english: "rising", direction: "up and right" },
  { mark: "㇕", hanzi: "折", pinyin: "zhé", english: "turn", direction: "change direction without lifting" },
  { mark: "亅", hanzi: "钩", pinyin: "gōu", english: "hook", direction: "a hooked finish" },
] as const;

const TONES = {
  1: { mark: "ˉ", name: "first tone", chinese: "阴平 yīnpíng", shape: "high and level", contour: "55", glyph: "→" },
  2: { mark: "ˊ", name: "second tone", chinese: "阳平 yángpíng", shape: "rising", contour: "35", glyph: "↗" },
  3: { mark: "ˇ", name: "third tone", chinese: "上声 shǎngshēng", shape: "low, then rising", contour: "214", glyph: "↘↗" },
  4: { mark: "ˋ", name: "fourth tone", chinese: "去声 qùshēng", shape: "sharp fall", contour: "51", glyph: "↘" },
  5: { mark: "·", name: "neutral tone", chinese: "轻声 qīngshēng", shape: "light and short", contour: "varies", glyph: "•" },
} as const;

const CORE_HANZI: CoreHanziItem[] = [
  { character: "一", pinyin: "yī", meaning: "one", tone: 1, strokes: ["heng"], note: "This same horizontal stroke appears at the start of 二 and 三." },
  { character: "二", pinyin: "èr", meaning: "two", tone: 4, strokes: ["heng", "heng"], note: "Write the shorter top stroke first, then the longer bottom stroke." },
  { character: "三", pinyin: "sān", meaning: "three", tone: 1, strokes: ["heng", "heng", "heng"], note: "The middle line is shortest. Write all three from top to bottom." },
  { character: "十", pinyin: "shí", meaning: "ten", tone: 2, strokes: ["heng", "shu"], note: "The horizontal stroke crosses first; the vertical stroke comes second." },
  { character: "人", pinyin: "rén", meaning: "person", tone: 2, strokes: ["pie", "na"], note: "Its compressed side form, 亻, appears in 你 (you) and 他 (he)." },
  { character: "大", pinyin: "dà", meaning: "big", tone: 4, strokes: ["heng", "pie", "na"], note: "Compare it with 人 (person): the added horizontal stroke opens the shape." },
  { character: "小", pinyin: "xiǎo", meaning: "small", tone: 3, strokes: ["shu_gou", "pie", "dian"], note: "Write the center hook first, followed by the two smaller side strokes." },
  { character: "中", pinyin: "zhōng", meaning: "middle", tone: 1, strokes: ["shu", "heng_zhe", "heng", "shu"], note: "The vertical stroke passes through 口 (mouth), creating 中 (middle)." },
  { character: "国", pinyin: "guó", meaning: "country", tone: 2, strokes: ["shu", "heng_zhe", "heng", "heng", "shu", "heng", "dian", "heng"], note: "The enclosure 囗 surrounds 玉. Close the bottom of the enclosure last." },
  { character: "女", pinyin: "nǚ", meaning: "woman", tone: 3, strokes: ["pie_dian", "pie", "heng"], note: "女 becomes the left-side component of 好 (good)." },
  { character: "子", pinyin: "zǐ", meaning: "child", tone: 3, strokes: ["heng_pie", "wan_gou", "heng"], note: "子 appears on the right side of 好 (good)." },
  { character: "好", pinyin: "hǎo", meaning: "good", tone: 3, strokes: ["pie_dian", "pie", "ti", "heng_pie", "wan_gou", "heng"], note: "好 is built from 女 (woman) on the left and 子 (child) on the right." },
  { character: "我", pinyin: "wǒ", meaning: "I / me", tone: 3, strokes: ["pie", "heng", "shu_gou", "ti", "xie_gou", "pie", "dian"], note: "A high-frequency character worth writing often." },
  { character: "你", pinyin: "nǐ", meaning: "you", tone: 3, strokes: ["pie", "shu", "pie", "heng_gou", "shu_gou", "pie", "dian"], note: "Person-side 亻 plus 尔." },
  { character: "他", pinyin: "tā", meaning: "he / him", tone: 1, strokes: ["pie", "shu", "heng_zhe_gou", "shu", "shu_wan_gou"], note: "Person-side 亻 plus 也." },
];

const HSK1_WORDS: HskWord[] = (hsk1WordsData as Omit<HskWord, "level">[]).map((word) => ({ ...word, level: 1 }));
const HSK2_WORDS: HskWord[] = (hsk2WordsData as Omit<HskWord, "level">[]).map((word) => ({ ...word, level: 2 }));
const HSK_WORDS = [...HSK1_WORDS, ...HSK2_WORDS];
const coreCharacters = new Set(CORE_HANZI.map((item) => item.character));
const expandedHanzi: HanziItem[] = [];
const expandedCharacters = new Set<string>();

for (const word of HSK_WORDS) {
  [...word.word].forEach((character, characterIndex) => {
    if (coreCharacters.has(character) || expandedCharacters.has(character)) return;
    expandedCharacters.add(character);
    expandedHanzi.push({
      character,
      pinyin: word.syllables[characterIndex].toLowerCase(),
      meaning: word.meaning,
      tone: word.tones[characterIndex],
      note: word.word === character
        ? `${character} is an HSK ${word.level} word meaning “${word.meaning}.”`
        : `${character} appears in ${word.word} (${word.syllables.join(" ")}), meaning “${word.meaning}.”`,
      contextWord: word.word,
      contextPinyin: word.syllables.join(" "),
      contextMeaning: word.meaning,
    });
  });
}

const HANZI: HanziItem[] = [
  ...CORE_HANZI.map((item) => ({
    ...item,
    contextWord: item.character,
    contextPinyin: item.pinyin,
    contextMeaning: item.meaning,
  })),
  ...expandedHanzi,
];

const HSK1_CHARACTER_COUNT = new Set(HSK1_WORDS.flatMap((word) => [...word.word])).size;
const wordIndexByText = new Map(HSK_WORDS.map((word, index) => [word.word, index]));
const hanziIndexByCharacter = new Map(HANZI.map((item, index) => [item.character, index]));

function isWordWritingPrompt(prompt: Prompt | undefined): prompt is { pathway: "writing"; wordIndex: number } {
  return prompt?.pathway === "writing" && "wordIndex" in prompt;
}

function wordPrompt(pathway: WordPathway, word: string): Prompt {
  const wordIndex = wordIndexByText.get(word);
  if (wordIndex === undefined) throw new Error(`Missing curriculum word: ${word}`);
  return { pathway, wordIndex };
}

const firstSession: Prompt[] = [
  { pathway: "writing", itemIndex: 0 },
  { pathway: "writing", itemIndex: 1 },
  wordPrompt("sound", "一"),
  { pathway: "writing", itemIndex: 2 },
  wordPrompt("meaning", "二"),
  wordPrompt("sound", "三"),
  { pathway: "writing", itemIndex: 3 },
  wordPrompt("meaning", "一"),
  { pathway: "writing", itemIndex: 4 },
  wordPrompt("sound", "十"),
  wordPrompt("meaning", "人"),
  { pathway: "writing", itemIndex: 0 },
];

function emptyCharacterProgress(): CharacterProgress {
  return {
    writing: 0,
    sound: 0,
    meaning: 0,
    attempts: { writing: 0, sound: 0, meaning: 0 },
    correct: { writing: 0, sound: 0, meaning: 0 },
  };
}

function emptyWordProgress(): WordProgress {
  return {
    writing: 0,
    sound: 0,
    meaning: 0,
    attempts: { writing: 0, sound: 0, meaning: 0 },
    correct: { writing: 0, sound: 0, meaning: 0 },
  };
}

function emptyProgress(): StoredProgress {
  return { introduced: 0, sessions: 0, totalPrompts: 0, characters: {}, words: {} };
}

function loadProgress(): StoredProgress {
  try {
    let raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const legacyKey = Object.keys(window.localStorage).find((key) => key.endsWith(LEGACY_STORAGE_SUFFIX));
      if (legacyKey) {
        raw = window.localStorage.getItem(legacyKey);
        if (raw) window.localStorage.setItem(STORAGE_KEY, raw);
        window.localStorage.removeItem(legacyKey);
      }
    }
    if (!raw) return emptyProgress();
    const parsed = JSON.parse(raw) as Partial<StoredProgress>;
    const normalized: StoredProgress = {
      ...emptyProgress(),
      ...parsed,
      characters: parsed.characters ?? {},
      words: parsed.words ?? {},
    };
    if (!parsed.words) {
      for (const word of HSK_WORDS) {
        if (word.word.length !== 1) continue;
        const legacy = normalized.characters[word.word];
        if (!legacy) continue;
        normalized.words[word.word] = {
          writing: 0,
          sound: legacy.sound,
          meaning: legacy.meaning,
          attempts: { writing: 0, sound: legacy.attempts.sound, meaning: legacy.attempts.meaning },
          correct: { writing: 0, sound: legacy.correct.sound, meaning: legacy.correct.meaning },
        };
      }
    }
    for (const [wordText, record] of Object.entries(normalized.words)) {
      const empty = emptyWordProgress();
      normalized.words[wordText] = {
        ...empty,
        ...record,
        attempts: { ...empty.attempts, ...record.attempts },
        correct: { ...empty.correct, ...record.correct },
      };
    }
    return normalized;
  } catch {
    return emptyProgress();
  }
}

function unlockedWordIndexes(introducedCount: number, hsk2Unlocked = introducedCount >= HSK1_CHARACTER_COUNT): number[] {
  const introducedCharacters = new Set(HANZI.slice(0, introducedCount).map((item) => item.character));
  return HSK_WORDS.flatMap((word, wordIndex) => {
    if (word.level === 2 && !hsk2Unlocked) return [];
    return [...word.word].every((character) => introducedCharacters.has(character)) ? [wordIndex] : [];
  });
}

function seededOptions<T>(correct: T, pool: T[], seed: number): T[] {
  const alternatives = pool.filter((value) => value !== correct);
  const distinct = [
    correct,
    alternatives[seed % alternatives.length],
    alternatives[(seed * 3 + 1) % alternatives.length],
  ].filter((value, index, values) => value !== undefined && values.indexOf(value) === index);
  for (const value of alternatives) {
    if (distinct.length === 3) break;
    if (!distinct.includes(value)) distinct.push(value);
  }
  const shift = seed % distinct.length;
  return [...distinct.slice(shift), ...distinct.slice(0, shift)];
}

function buildAdaptiveSession(progress: StoredProgress): Prompt[] {
  const currentIntroduced = Math.max(progress.introduced, 5);
  const curriculumBoundary = currentIntroduced < HSK1_CHARACTER_COUNT ? HSK1_CHARACTER_COUNT : HANZI.length;
  const introduceThrough = Math.min(curriculumBoundary, currentIntroduced + 2);
  const prompts: Prompt[] = [];

  for (let index = currentIntroduced; index < introduceThrough; index += 1) {
    prompts.push({ pathway: "writing", itemIndex: index });
  }

  const candidates: Array<{ prompt: Prompt; score: number; tie: number }> = [];
  for (let itemIndex = 0; itemIndex < introduceThrough; itemIndex += 1) {
    const record = progress.characters[HANZI[itemIndex].character] ?? emptyCharacterProgress();
    candidates.push({
      prompt: { pathway: "writing", itemIndex },
      score: record.writing,
      tie: ((itemIndex + 1) * 7 + progress.sessions) % 17,
    });
  }

  const unlockedWords = unlockedWordIndexes(introduceThrough, currentIntroduced >= HSK1_CHARACTER_COUNT);
  const wordWritingCandidates: Array<{ prompt: Prompt; score: number; tie: number }> = [];
  for (const wordIndex of unlockedWords) {
    const word = HSK_WORDS[wordIndex];
    const record = progress.words[word.word] ?? emptyWordProgress();
    if (word.word.length > 1) {
      wordWritingCandidates.push({
        prompt: { pathway: "writing", wordIndex },
        score: record.writing,
        tie: ((wordIndex + 1) * 13 + progress.sessions) % 29,
      });
    }
    (["sound", "meaning"] as WordPathway[]).forEach((pathway, offset) => {
      candidates.push({
        prompt: { pathway, wordIndex },
        score: record[pathway],
        tie: ((wordIndex + 1) * 11 + offset * 5 + progress.sessions) % 23,
      });
    });
  }

  wordWritingCandidates.sort((a, b) => a.score - b.score || a.tie - b.tie);
  if (wordWritingCandidates[0] && prompts.length < SESSION_LENGTH) prompts.push(wordWritingCandidates[0].prompt);
  candidates.push(...wordWritingCandidates.slice(1));

  candidates.sort((a, b) => a.score - b.score || a.tie - b.tie);
  for (const candidate of candidates) {
    if (prompts.length >= SESSION_LENGTH) break;
    if (prompts.some((prompt) => JSON.stringify(prompt) === JSON.stringify(candidate.prompt))) continue;
    prompts.push(candidate.prompt);
  }
  return prompts;
}

function pathwayLabel(pathway: Pathway) {
  if (pathway === "writing") return "Wield the brush";
  if (pathway === "sound") return "Hear the spell";
  return "Spot the meaning";
}

function pathwayIcon(pathway: Pathway) {
  if (pathway === "writing") return <PencilLine aria-hidden="true" />;
  if (pathway === "sound") return <Headphones aria-hidden="true" />;
  return <span className="meaning-icon" aria-hidden="true">意</span>;
}

export default function Home() {
  const [progress, setProgress] = useState<StoredProgress | null>(null);
  const [started, setStarted] = useState(false);
  const [session, setSession] = useState<Prompt[]>([]);
  const [step, setStep] = useState(0);
  const [feedback, setFeedback] = useState<"correct" | "retry" | null>(null);
  const [showProgress, setShowProgress] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [showWritingPractice, setShowWritingPractice] = useState(false);
  const [dark, setDark] = useState(false);
  const [writerPhase, setWriterPhase] = useState<"watching" | "writing" | "between">("watching");
  const [writerReplay, setWriterReplay] = useState(0);
  const [wordCharacterIndex, setWordCharacterIndex] = useState(0);
  const [currentStrokeIndex, setCurrentStrokeIndex] = useState(0);
  const [currentStrokeCount, setCurrentStrokeCount] = useState(0);
  const writerTarget = useRef<HTMLDivElement>(null);
  const mistakeCount = useRef(0);
  const wordMistakeCount = useRef(0);

  useEffect(() => {
    setProgress(loadProgress());
    setDark(window.matchMedia("(prefers-color-scheme: dark)").matches);
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register(`${APP_BASE}/sw.js`).catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  }, [dark]);

  useEffect(() => {
    if (progress) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  }, [progress]);

  const current = session[step];
  const writingWord = isWordWritingPrompt(current) ? HSK_WORDS[current.wordIndex] : null;
  const activeWordCharacter = writingWord ? [...writingWord.word][wordCharacterIndex] : null;
  const itemIndex = current?.pathway === "writing"
    ? ("itemIndex" in current ? current.itemIndex : hanziIndexByCharacter.get(activeWordCharacter ?? ""))
    : undefined;
  const item = itemIndex === undefined ? null : HANZI[itemIndex];
  const word = current && current.pathway !== "writing" ? HSK_WORDS[current.wordIndex] : null;
  const tone = item ? TONES[item.tone] : null;
  const currentStroke = item?.strokes ? STROKES[item.strokes[currentStrokeIndex]] : null;
  const strokeCount = item?.strokes?.length ?? currentStrokeCount;
  const introducedCount = Math.max(progress?.introduced ?? 0, progress?.sessions ? 5 : 0);
  const optionPool = unlockedWordIndexes(Math.max(5, introducedCount)).map((wordIndex) => HSK_WORDS[wordIndex]);

  const options = useMemo(() => {
    if (!current || current.pathway === "writing" || !word) return [];
    if (current.pathway === "sound") {
      return seededOptions(word.word, optionPool.map((entry) => entry.word), current.wordIndex + step);
    }
    return seededOptions(word.meaning, optionPool.map((entry) => entry.meaning), current.wordIndex + step);
  }, [current, optionPool, step, word]);

  const recordResult = useCallback((correct: boolean, characterMistakes = 0, promptComplete = true, promptMistakes = characterMistakes) => {
    if (!current) return;
    setProgress((previous) => {
      if (!previous) return previous;
      const next = structuredClone(previous);
      const cleanCharacter = correct && characterMistakes === 0;
      if (current.pathway === "writing" && item) {
        const record = next.characters[item.character] ?? emptyCharacterProgress();
        record.attempts.writing += 1;
        if (correct) record.correct.writing += 1;
        record.writing = Math.max(0, Math.min(3, record.writing + (cleanCharacter ? 1 : characterMistakes > 2 ? -1 : 0)));
        next.characters[item.character] = record;
        if ("itemIndex" in current) next.introduced = Math.max(next.introduced, current.itemIndex + 1);
        if (writingWord && promptComplete) {
          const wordRecord = next.words[writingWord.word] ?? emptyWordProgress();
          const cleanWord = correct && promptMistakes === 0;
          wordRecord.attempts.writing += 1;
          if (correct) wordRecord.correct.writing += 1;
          wordRecord.writing = Math.max(0, Math.min(3, wordRecord.writing + (cleanWord ? 1 : promptMistakes > 2 ? -1 : 0)));
          next.words[writingWord.word] = wordRecord;
        }
      } else if (current.pathway !== "writing" && word) {
        const record = next.words[word.word] ?? emptyWordProgress();
        record.attempts[current.pathway] += 1;
        if (correct) record.correct[current.pathway] += 1;
        record[current.pathway] = Math.max(0, Math.min(3, record[current.pathway] + (correct ? 1 : 0)));
        next.words[word.word] = record;
      }
      if (promptComplete) next.totalPrompts += 1;
      return next;
    });
  }, [current, item, word, writingWord]);

  const advance = useCallback(() => {
    setFeedback(null);
    mistakeCount.current = 0;
    wordMistakeCount.current = 0;
    setWriterPhase("watching");
    setCurrentStrokeIndex(0);
    setWordCharacterIndex(0);
    if (step + 1 >= session.length) {
      setProgress((previous) => previous ? { ...previous, sessions: previous.sessions + 1 } : previous);
      setStep(session.length);
    } else {
      setStep((value) => value + 1);
    }
  }, [session.length, step]);

  const respond = (selected: string) => {
    if (!word || !current || current.pathway === "writing" || feedback) return;
    const answer = current.pathway === "sound" ? word.word : word.meaning;
    const correct = selected === answer;
    recordResult(correct);
    setFeedback(correct ? "correct" : "retry");
  };

  const spokenText = writingWord?.word ?? item?.character ?? word?.word ?? "";
  const speak = useCallback(() => {
    if (!spokenText || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(spokenText);
    const voices = window.speechSynthesis.getVoices();
    utterance.voice =
      voices.find((voice) => voice.lang.toLowerCase() === "zh-cn") ??
      voices.find((voice) => voice.lang.toLowerCase().startsWith("zh")) ??
      null;
    utterance.lang = "zh-CN";
    utterance.rate = 0.72;
    window.speechSynthesis.speak(utterance);
  }, [spokenText]);

  useEffect(() => {
    if (!started || !spokenText) return;
    const timer = window.setTimeout(speak, 280);
    return () => window.clearTimeout(timer);
  }, [speak, spokenText, started, step]);

  useEffect(() => {
    if (!feedback) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Enter") advance();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [advance, feedback]);

  useEffect(() => {
    if (showWritingPractice || !item || current?.pathway !== "writing" || !writerTarget.current) return;
    let cancelled = false;
    let betweenStrokesTimer: number | undefined;
    writerTarget.current.innerHTML = "";
    mistakeCount.current = 0;
    setCurrentStrokeIndex(0);
    setCurrentStrokeCount(item.strokes?.length ?? 0);
    import("hanzi-writer").then(async ({ default: HanziWriter }) => {
      const characterData = await HanziWriter.loadCharacterData(item.character) as CharacterJson | void;
      if (cancelled || !writerTarget.current || !characterData) return;
      const totalStrokes = characterData.strokes.length;
      setCurrentStrokeCount(totalStrokes);
      const instance = HanziWriter.create(writerTarget.current, item.character, {
        width: 284,
        height: 284,
        padding: 18,
        showOutline: true,
        showCharacter: false,
        strokeColor: dark ? "#f4efe8" : "#221f1c",
        outlineColor: dark ? "#403c37" : "#ded8cf",
        highlightColor: "#c85b44",
        radicalColor: "#5f7d70",
        drawingWidth: 8,
        strokeAnimationSpeed: 0.55,
        delayBetweenStrokes: 650,
        charDataLoader: (_character, onLoad) => {
          onLoad(characterData);
          return characterData;
        },
      }) as WriterInstance;
      const beginQuiz = () => {
        if (cancelled) return;
        setWriterPhase("writing");
        setCurrentStrokeIndex(0);
        instance.quiz({
          showHintAfterMisses: 2,
          onMistake: ({ strokeNum }) => {
            mistakeCount.current += 1;
            setCurrentStrokeIndex(strokeNum);
          },
          onCorrectStroke: ({ strokeNum }) => {
            setCurrentStrokeIndex(Math.min(strokeNum + 1, totalStrokes - 1));
          },
          onComplete: () => {
            const characterMistakes = mistakeCount.current;
            const totalMistakes = wordMistakeCount.current + characterMistakes;
            const hasAnotherCharacter = writingWord && wordCharacterIndex + 1 < [...writingWord.word].length;
            if (hasAnotherCharacter) {
              recordResult(true, characterMistakes, false);
              wordMistakeCount.current = totalMistakes;
              setWriterPhase("between");
            } else {
              recordResult(true, characterMistakes, true, totalMistakes);
              setFeedback(totalMistakes === 0 ? "correct" : "retry");
            }
          },
        });
      };
      const animateStroke = (strokeNum: number) => {
        if (cancelled) return;
        if (strokeNum >= totalStrokes) {
          betweenStrokesTimer = window.setTimeout(beginQuiz, 550);
          return;
        }
        setCurrentStrokeIndex(strokeNum);
        instance.animateStroke(strokeNum, {
          onComplete: () => {
            betweenStrokesTimer = window.setTimeout(() => animateStroke(strokeNum + 1), 650);
          },
        });
      };
      animateStroke(0);
    }).catch(() => setWriterPhase("writing"));
    return () => {
      cancelled = true;
      if (betweenStrokesTimer !== undefined) window.clearTimeout(betweenStrokesTimer);
    };
  }, [current, dark, item, recordResult, writerReplay, wordCharacterIndex, writingWord, showWritingPractice]);

  const continueWord = () => {
    mistakeCount.current = 0;
    setWriterPhase("watching");
    setCurrentStrokeIndex(0);
    setWordCharacterIndex((value) => value + 1);
  };

  const begin = () => {
    if (!progress) return;
    setSession(progress.sessions === 0 ? firstSession : buildAdaptiveSession(progress));
    setStep(0);
    setStarted(true);
    setShowProgress(false);
    setShowGuide(false);
    setFeedback(null);
    setWordCharacterIndex(0);
    wordMistakeCount.current = 0;
  };

  const reset = () => {
    const clean = emptyProgress();
    setProgress(clean);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
    setShowProgress(false);
    setStarted(false);
  };

  if (!progress) return <main className="loading-shell" aria-label="Loading" />;

  const completed = started && step >= session.length;
  const choiceFeedback = feedback && current?.pathway !== "writing";
  const pathwayAverages = (["writing", "sound", "meaning"] as Pathway[]).map((pathway) => {
    const values = pathway === "writing"
      ? [
          ...HANZI.slice(0, progress.introduced).map((entry) => progress.characters[entry.character]?.writing ?? 0),
          ...Object.values(progress.words).map((entry) => entry.writing ?? 0),
        ]
      : Object.values(progress.words).map((entry) => entry[pathway]);
    return {
      pathway,
      percent: values.length
        ? Math.round((values.reduce((sum, value) => sum + value, 0) / (values.length * 3)) * 100)
        : 0,
    };
  });

  return (
    <main className="app-shell">
      <header className="topbar">
        <button className="brand" disabled={showWritingPractice} onClick={() => { setStarted(false); setShowProgress(false); setShowGuide(false); }} aria-label="Home">
          <span className="brand-mark"><img src={`${APP_BASE}/monkey-king-icon.png`} alt="" /></span><span>Hanzi Tree</span>
        </button>
        <div className="top-actions">
          {!showWritingPractice && <>
            <button className="icon-button" onClick={() => { setStarted(false); setShowProgress(false); setShowGuide(false); setShowWritingPractice(true); }} aria-label="Writing practice"><PencilLine /></button>
            <button className="icon-button" onClick={() => { setShowGuide(true); setShowProgress(false); }} aria-label="Stroke and tone guide"><BookOpen /></button>
            <button className="icon-button" onClick={() => { setShowProgress(true); setShowGuide(false); }} aria-label="View progress"><BarChart3 /></button>
          </>}
          <button className="icon-button" onClick={() => setDark((value) => !value)} aria-label={dark ? "Use light mode" : "Use dark mode"}>
            {dark ? <Sun /> : <Moon />}
          </button>
        </div>
      </header>

      {showWritingPractice ? (
        <WritingPractice characters={HANZI} onClose={() => setShowWritingPractice(false)} />
      ) : showGuide ? (
        <section className="guide-view" aria-labelledby="guide-title">
          <button className="close-button" onClick={() => setShowGuide(false)} aria-label="Close guide"><X /></button>
          <p className="eyebrow">The sacred scrolls</p>
          <h1 id="guide-title">The Monkey King had 72 transformations.<br />Start with strokes and tones.</h1>

          <section className="guide-section" aria-labelledby="stroke-guide-title">
            <div className="guide-heading">
              <div><span>Brush moves</span><h2 id="stroke-guide-title">Know your strokes</h2></div>
              <p>Five basic directions combine with rises, turns, and hooks. 横折 is one stroke, because even the Great Sage must obey brush rules.</p>
            </div>
            <div className="stroke-guide-grid">
              {STROKE_BUILDING_BLOCKS.map((stroke) => (
                <div className="stroke-guide-card" key={stroke.hanzi}>
                  <span className="stroke-mark">{stroke.mark}</span>
                  <div><strong>{stroke.hanzi} <em>{stroke.pinyin}</em></strong><span>{stroke.english} · {stroke.direction}</span></div>
                </div>
              ))}
            </div>
          </section>

          <section className="guide-section" aria-labelledby="tone-guide-title">
            <div className="guide-heading">
              <div><span>Cloud calls</span><h2 id="tone-guide-title">Know your tones</h2></div>
              <p>Pitch changes meaning. Miss the tone and your magic cloud may carry you to the wrong mountain.</p>
            </div>
            <div className="tone-guide-list">
              {Object.values(TONES).map((toneItem) => (
                <div className="tone-guide-row" key={toneItem.name}>
                  <span className="tone-glyph">{toneItem.glyph}</span>
                  <div><strong>{toneItem.name}</strong><span>{toneItem.chinese}</span></div>
                  <div><strong>{toneItem.shape}</strong><span>pitch {toneItem.contour}</span></div>
                </div>
              ))}
            </div>
          </section>
        </section>
      ) : showProgress ? (
        <section className="progress-view" aria-labelledby="progress-title">
          <button className="close-button" onClick={() => setShowProgress(false)} aria-label="Close progress"><X /></button>
          <p className="eyebrow">Journey log</p>
          <h1 id="progress-title">Even immortals keep score.</h1>
          <div className="progress-summary">
            <div><strong>{progress.introduced}</strong><span>characters challenged</span></div>
            <div><strong>{Object.keys(progress.words).length}</strong><span>words encountered</span></div>
            <div><strong>{progress.sessions}</strong><span>chapters crossed</span></div>
          </div>
          <AppBackup progress={progress} onImport={(restored) => { setProgress(restored); setStarted(false); setSession([]); setStep(0); setFeedback(null); }} />
          <div className="pathway-bars">
            {pathwayAverages.map(({ pathway, percent }) => (
              <div className="pathway-row" key={pathway}>
                <div className="pathway-label">{pathwayIcon(pathway)}<span>{pathwayLabel(pathway)}</span></div>
                <div className="bar-track"><span style={{ width: `${percent}%` }} /></div>
                <span className="bar-value">{percent}%</span>
              </div>
            ))}
          </div>
          <div className="character-grid">
            {HANZI.map((entry, index) => {
              const score = progress.characters[entry.character];
              const strength = score ? Math.round((score.writing / 3) * 100) : 0;
              return (
                <div className={`character-tile ${index >= progress.introduced ? "locked" : ""}`} key={entry.character}>
                  <span>{index < progress.introduced ? entry.character : "·"}</span>
                  <small>{index < progress.introduced ? `${strength}%` : "later"}</small>
                </div>
              );
            })}
          </div>
          <button className="text-button" onClick={reset}><RotateCcw /> Erase the scrolls</button>
        </section>
      ) : !started ? (
        <section className="welcome-view">
          <div className="welcome-character"><img src={`${APP_BASE}/monkey-king-logo.png`} alt="The Monkey King writing the character 字 with a calligraphy brush" /></div>
          <p className="eyebrow">Training at Flower Fruit Mountain</p>
          <h1>See the character.<br />Wield the brush.</h1>
          <p className="welcome-copy">The Monkey King mastered 72 transformations. You only need one character at a time.</p>
          <button className="primary-button" onClick={begin}>{progress.sessions ? "Return to the road" : "Begin the journey"}</button>
          <p className="session-note">12 challenges · no heavenly bureaucracy</p>
          <button className="foundation-link" onClick={() => setShowWritingPractice(true)}><PencilLine /> Open writing practice</button>
          <button className="foundation-link" onClick={() => setShowProgress(true)}>Back up or transfer progress</button>
          <button className="foundation-link" onClick={() => setShowGuide(true)}><BookOpen /> Open the sacred scrolls</button>
        </section>
      ) : completed ? (
        <section className="complete-view">
          <div className="completion-ring"><img src={`${APP_BASE}/monkey-king-icon.png`} alt="" /></div>
          <p className="eyebrow">Chapter complete</p>
          <h1>The sutras can wait.</h1>
          <p>Even the Great Sage puts down the brush eventually.</p>
          <button className="primary-button" onClick={begin}>Cause more trouble</button>
          <button className="secondary-button" onClick={() => setShowProgress(true)}>Read the journey log</button>
        </section>
      ) : current && (item || word) ? (
        <section className="practice-view">
          <div className="session-progress" aria-label={`Prompt ${step + 1} of ${session.length}`}><span style={{ width: `${((step + 1) / session.length) * 100}%` }} /></div>
          <div className="prompt-heading">
            <span className={`pathway-badge ${current.pathway}`}>{pathwayIcon(current.pathway)} {pathwayLabel(current.pathway)}</span>
            <span className="step-count">{step + 1} / {session.length}</span>
          </div>

          {current.pathway === "writing" && item ? (
            <div className="writing-prompt">
              <div className="character-meta">
                <span className="pinyin">{writingWord ? writingWord.syllables.join(" ") : item.pinyin}</span>
                {!writingWord && tone && <span className="tone-chip"><strong>{tone.name}</strong> · {tone.shape}</span>}
                <span className="meaning">{writingWord ? writingWord.meaning : item.contextWord === item.character ? item.meaning : `in ${item.contextWord} · ${item.contextMeaning}`}</span>
                <button className="pronunciation-button" onClick={speak} aria-label={`Hear ${writingWord?.word ?? item.character} again`}><Volume2 /></button>
              </div>
              {writingWord && (
                <div className="word-tracing-context" aria-label={`Writing ${writingWord.word}, character ${wordCharacterIndex + 1} of ${[...writingWord.word].length}`}>
                  <span className="word-tracing-label">Complete the transformation</span>
                  <div className="word-tracing-characters">
                    {[...writingWord.word].map((character, index) => (
                      <div className={index === wordCharacterIndex ? "active" : index < wordCharacterIndex ? "complete" : ""} key={`${character}-${index}`}>
                        <strong>{character}</strong>
                        <small>{writingWord.syllables[index]}</small>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="writing-workspace">
                <div className="stroke-sidebar">
                  {currentStroke && (
                    <div className="current-stroke" aria-live="polite">
                      <span>Stroke {currentStrokeIndex + 1} of {strokeCount}</span>
                      <strong>{currentStroke.mark} {currentStroke.hanzi} <em>{currentStroke.pinyin}</em></strong>
                      <small>{currentStroke.english} · {currentStroke.direction}</small>
                    </div>
                  )}
                  {!currentStroke && strokeCount > 0 && (
                    <div className="current-stroke generic-stroke" aria-live="polite">
                      <span>Stroke {currentStrokeIndex + 1} of {strokeCount}</span>
                      <strong>Follow the highlighted path</strong>
                      <small>Direction and order are checked as you write.</small>
                    </div>
                  )}
                  <div className="stroke-sequence" aria-label="Stroke sequence">
                    {Array.from({ length: strokeCount }, (_, index) => {
                      const strokeKey = item.strokes?.[index];
                      const stroke = strokeKey ? STROKES[strokeKey] : null;
                      return <span className={index === currentStrokeIndex && !feedback && writerPhase !== "between" ? "active" : ""} key={`${item.character}-${index}`}>{index + 1}{stroke ? `. ${stroke.hanzi}` : ""}</span>;
                    })}
                  </div>
                  <p className="instruction">{writerPhase === "watching" ? `Watch the brush.${item.strokes ? " Name the move." : " Follow every turn."}` : writerPhase === "between" ? `${item.character} is ready.` : writingWord ? `Your turn. Write ${item.character} to build ${writingWord.word}.` : "Your turn. Wield the Pencil."}</p>
                  {writerPhase === "writing" && !feedback && (
                    <button className="replay-button" onClick={() => { setWriterPhase("watching"); setWriterReplay((value) => value + 1); }}>
                      <RotateCcw /> Monkey see, monkey replay
                    </button>
                  )}
                  {writerPhase === "between" && (
                    <button className="next-character-button" onClick={continueWord}>Next character</button>
                  )}
                </div>
                <div className="writer-frame"><div className="guide-lines" aria-hidden="true" /><div ref={writerTarget} className="writer-target" aria-label={writingWord ? `Write ${item.character} in ${writingWord.word}` : `Write ${item.character}`} /></div>
                <div className={`insight-column ${feedback ? "has-feedback" : ""}`}>
                  <aside className="learning-note">
                    <span>Monkey sees</span>
                    <p>{writingWord ? `${item.character} is character ${wordCharacterIndex + 1} of ${writingWord.word}. ${item.note}` : item.note}</p>
                  </aside>
                  {feedback && (
                    <div className={`answer-panel writing-result ${feedback}`} role="status">
                      <div>
                        <strong>{feedback === "correct" ? "Great Sage!" : "A little help from Guanyin."}</strong>
                        <span>{writingWord ? `${writingWord.syllables.join(" ")} · ${writingWord.meaning}` : `${item.contextPinyin} · ${item.contextMeaning}`}</span>
                      </div>
                      <button onClick={advance}>Onward west</button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : current.pathway === "sound" && word ? (
            <div className="choice-prompt">
              <p className="question">Which word do you hear?</p>
              <button className="sound-button" onClick={speak} aria-label="Play sound"><Volume2 /><span>Hear the spell</span></button>
              <div className="choice-grid characters">
                {options.map((option) => <button className={option.length > 1 ? "word-option" : ""} key={option} onClick={() => respond(option)} disabled={feedback !== null}>{option}</button>)}
              </div>
            </div>
          ) : word ? (
            <div className="choice-prompt">
              <div className="display-character">{word.word}</div>
              <div className="meaning-pronunciation">
                <span className="pinyin">{word.syllables.join(" ")}</span>
                <button className="pronunciation-button meaning-sound" onClick={speak} aria-label={`Hear ${word.word} again`}><Volume2 /><span>Hear again</span></button>
              </div>
              <p className="question">What does this word mean?</p>
              <div className="choice-grid meanings">
                {options.map((option) => <button key={option} onClick={() => respond(option)} disabled={feedback !== null}>{option}</button>)}
              </div>
            </div>
          ) : null}

          {choiceFeedback && word && (
            <div className={`answer-panel ${feedback}`} role="status">
              <div>
                <strong>{feedback === "correct" ? "Great Sage!" : `${word.word} means ${word.meaning}.`}</strong>
                <span>{word.syllables.join(" ")} · {word.meaning}</span>
              </div>
              <button onClick={advance}>Onward west</button>
            </div>
          )}
        </section>
      ) : null}
    </main>
  );
}
