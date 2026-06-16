export type BeatRiseNoteType = "beat" | "melody";

export type BeatRiseChartNote = {
  time: number;
  lane: 0 | 1 | 2 | 3;
  type: BeatRiseNoteType;
};

export const FUTURE_BASS_START_OFFSET = 30;
export const FUTURE_BASS_DURATION = 60;
export const FUTURE_BASS_BPM = 152;

const BEAT = 60 / FUTURE_BASS_BPM; // 약 0.395초
const BAR = BEAT * 4;

function t(value: number) {
  return Number(value.toFixed(3));
}

function clampTime(value: number) {
  return Math.max(0, Math.min(FUTURE_BASS_DURATION, t(value)));
}

function makeNote(
  time: number,
  lane: 0 | 1 | 2 | 3,
  type: BeatRiseNoteType
): BeatRiseChartNote {
  return {
    time: clampTime(time),
    lane,
    type,
  };
}

function addKickSnarePattern(
  notes: BeatRiseChartNote[],
  startBar: number,
  endBar: number,
  intensity: "light" | "normal" | "drop"
) {
  for (let bar = startBar; bar < endBar; bar += 1) {
    const base = bar * BAR;

    // 킥 느낌: 1박, 3박
    notes.push(makeNote(base + BEAT * 0, 1, "beat"));
    notes.push(makeNote(base + BEAT * 2, 2, "beat"));

    // 스네어 느낌: 2박, 4박
    notes.push(makeNote(base + BEAT * 1, 3, "beat"));
    notes.push(makeNote(base + BEAT * 3, 0, "beat"));

    if (intensity === "normal" || intensity === "drop") {
      // 중간 박자: 리듬감 추가
      notes.push(makeNote(base + BEAT * 0.5, 0, "melody"));
      notes.push(makeNote(base + BEAT * 2.5, 3, "melody"));
    }

    if (intensity === "drop") {
      // 드롭 구간: 8분음표/싱코페이션 느낌
      notes.push(makeNote(base + BEAT * 1.5, 2, "melody"));
      notes.push(makeNote(base + BEAT * 3.5, 1, "melody"));

      // 마디 끝 필인
      if (bar % 2 === 1) {
        notes.push(makeNote(base + BEAT * 3.25, 0, "melody"));
        notes.push(makeNote(base + BEAT * 3.75, 3, "melody"));
      }
    }
  }
}

function addBuildUp(
  notes: BeatRiseChartNote[],
  startBar: number,
  endBar: number
) {
  for (let bar = startBar; bar < endBar; bar += 1) {
    const base = bar * BAR;

    notes.push(makeNote(base + BEAT * 0, 0, "beat"));
    notes.push(makeNote(base + BEAT * 1, 1, "beat"));
    notes.push(makeNote(base + BEAT * 2, 2, "beat"));
    notes.push(makeNote(base + BEAT * 3, 3, "beat"));

    // 빌드업 후반으로 갈수록 촘촘하게
    if (bar >= startBar + 2) {
      notes.push(makeNote(base + BEAT * 0.5, 1, "melody"));
      notes.push(makeNote(base + BEAT * 1.5, 2, "melody"));
      notes.push(makeNote(base + BEAT * 2.5, 1, "melody"));
      notes.push(makeNote(base + BEAT * 3.5, 2, "melody"));
    }

    if (bar >= endBar - 2) {
      notes.push(makeNote(base + BEAT * 3.25, 0, "melody"));
      notes.push(makeNote(base + BEAT * 3.5, 1, "melody"));
      notes.push(makeNote(base + BEAT * 3.75, 2, "melody"));
    }
  }
}

function addDropHook(
  notes: BeatRiseChartNote[],
  startBar: number,
  endBar: number
) {
  const hookPattern = [
    { beat: 0, lane: 1, type: "beat" },
    { beat: 0.5, lane: 2, type: "melody" },
    { beat: 1, lane: 3, type: "beat" },
    { beat: 1.5, lane: 1, type: "melody" },
    { beat: 2, lane: 0, type: "beat" },
    { beat: 2.5, lane: 2, type: "melody" },
    { beat: 3, lane: 3, type: "beat" },
    { beat: 3.5, lane: 0, type: "melody" },
  ] as const;

  const hookPatternAlt = [
    { beat: 0, lane: 2, type: "beat" },
    { beat: 0.5, lane: 1, type: "melody" },
    { beat: 1, lane: 0, type: "beat" },
    { beat: 1.5, lane: 2, type: "melody" },
    { beat: 2, lane: 3, type: "beat" },
    { beat: 2.5, lane: 1, type: "melody" },
    { beat: 3, lane: 0, type: "beat" },
    { beat: 3.5, lane: 3, type: "melody" },
  ] as const;

  for (let bar = startBar; bar < endBar; bar += 1) {
    const base = bar * BAR;
    const pattern = bar % 2 === 0 ? hookPattern : hookPatternAlt;

    pattern.forEach((item) => {
      notes.push(
        makeNote(
          base + BEAT * item.beat,
          item.lane,
          item.type as BeatRiseNoteType
        )
      );
    });

    // 4마디마다 강조 필인
    if (bar % 4 === 3) {
      notes.push(makeNote(base + BEAT * 3.25, 0, "melody"));
      notes.push(makeNote(base + BEAT * 3.5, 1, "melody"));
      notes.push(makeNote(base + BEAT * 3.75, 2, "melody"));
    }
  }
}

function makeFutureBassChart() {
  const notes: BeatRiseChartNote[] = [];

  // 0~8초: 인트로, 너무 빽빽하지 않게
  addKickSnarePattern(notes, 0, 5, "light");

  // 8~16초: 빌드업
  addBuildUp(notes, 5, 10);

  // 16~34초: 드롭 메인 훅
  addDropHook(notes, 10, 22);

  // 34~44초: 드롭 반복 + 약간 여유
  addKickSnarePattern(notes, 22, 28, "drop");

  // 44~52초: 브릿지, 숨 쉴 구간
  addKickSnarePattern(notes, 28, 33, "normal");

  // 52~60초: 마지막 몰아치기
  addDropHook(notes, 33, 38);

  return notes
    .filter((note) => note.time >= 0 && note.time <= FUTURE_BASS_DURATION)
    .sort((a, b) => a.time - b.time)
    .filter((note, index, array) => {
      const prev = array[index - 1];
      if (!prev) return true;

      // 같은 레인에 너무 가까운 노트 중복 제거
      return !(prev.lane === note.lane && Math.abs(prev.time - note.time) < 0.08);
    });
}

export const futureBassChart: BeatRiseChartNote[] = makeFutureBassChart();

export const futureBassBeatNotes = futureBassChart.filter(
  (note) => note.type === "beat"
);

export const futureBassMelodyNotes = futureBassChart.filter(
  (note) => note.type === "melody"
);

export const MUSIC_TRACKS = [
  {
    id: "future-bass-drop",
    title: "Future Bass Drop",
    bpm: FUTURE_BASS_BPM,
    difficulty: "HARD" as const,
    audioSrc: "/audio/alex-morgan-future-bass-drop-537458.mp3",
    startOffset: FUTURE_BASS_START_OFFSET,
    duration: FUTURE_BASS_DURATION,
    beatNotes: futureBassBeatNotes,
    melodyNotes: futureBassMelodyNotes,
    chart: futureBassChart,
  },
];
