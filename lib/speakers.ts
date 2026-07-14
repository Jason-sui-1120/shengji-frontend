import type { SpeakerStat, TranscriptLine } from "../types";

type SpeakerLabelSource = Pick<TranscriptLine, "speakerSource" | "speakerConfidence">;

const SPEAKER_COLORS = [
  { bg: "#3B82F6", bgLight: "#EFF6FF" },
  { bg: "#10B981", bgLight: "#ECFDF5" },
  { bg: "#F59E0B", bgLight: "#FFFBEB" },
  { bg: "#8B5CF6", bgLight: "#F5F3FF" },
  { bg: "#EC4899", bgLight: "#FDF2F8" },
  { bg: "#06B6D4", bgLight: "#ECFEFF" },
];

export function getSpeakerColor(transcripts: TranscriptLine[], speakerName: string) {
  const speakers = getSpeakerStats(transcripts);
  const index = speakers.findIndex((s) => s.name === speakerName);
  return SPEAKER_COLORS[index % SPEAKER_COLORS.length] ?? SPEAKER_COLORS[0];
}

export function getSpeakerNumber(transcripts: TranscriptLine[], speakerName: string) {
  const speakers = getSpeakerStats(transcripts);
  const index = speakers.findIndex((s) => s.name === speakerName);
  return index >= 0 ? index + 1 : 1;
}

export function getSpeakerOptions(transcripts: TranscriptLine[]) {
  const defaults = ["说话人 1", "说话人 2", "说话人 3", "说话人 4", "主持人", "产品", "技术", "业务"];
  const existing = transcripts.map((line) => line.speaker).filter(Boolean);
  return Array.from(new Set([...existing, ...defaults]));
}

export function getSpeakerStats(transcripts: TranscriptLine[]): SpeakerStat[] {
  const stats = new Map<string, SpeakerStat>();
  const firstAppearIndex = new Map<string, number>();
  for (let i = 0; i < transcripts.length; i++) {
    const line = transcripts[i];
    if (!line.speaker) continue;
    if (!firstAppearIndex.has(line.speaker)) {
      firstAppearIndex.set(line.speaker, i);
    }
    const current = stats.get(line.speaker) || {
      name: line.speaker,
      count: 0,
      source: line.speakerSource,
      confidence: 0,
    };
    current.count += 1;
    current.confidence = Math.max(current.confidence, Number(line.speakerConfidence || 0));
    if (line.speakerSource === "manual") current.source = "manual";
    else if (!current.source || current.source === "pending") current.source = line.speakerSource;
    stats.set(line.speaker, current);
  }
  // 按首次出现顺序排序，重命名后保持原位置
  return [...stats.values()].sort((a, b) => (firstAppearIndex.get(a.name) ?? 0) - (firstAppearIndex.get(b.name) ?? 0));
}

export function getSpeakerSourceLabel(line: SpeakerLabelSource) {
  if (line.speakerSource === "embedding") return line.speakerConfidence ? `声纹 ${line.speakerConfidence}%` : "声纹识别";
  if (line.speakerSource === "diarization") {
    return line.speakerConfidence ? `模型 ${line.speakerConfidence}%` : "模型识别";
  }
  if (line.speakerSource === "local") return line.speakerConfidence ? `本地 ${line.speakerConfidence}%` : "本地识别";
  if (line.speakerSource === "manual") return "已纠正";
  return "识别中";
}

export function getSpeakerConfidenceLabel(line: SpeakerLabelSource) {
  if (!line.speakerConfidence) return line.speakerSource || "转写记录";
  return `${line.speakerSource || "识别"} ${line.speakerConfidence}%`;
}
