export type BeatRiseNoteType = "beat" | "melody";

export type BeatRiseChartNote = {
  time: number;
  lane: 0 | 1 | 2 | 3;
  type: BeatRiseNoteType;
};

export const FUTURE_BASS_START_OFFSET = 30;
export const FUTURE_BASS_DURATION = 60;
export const FUTURE_BASS_BPM = 152;

const BEAT = 60 / FUTURE_BASS_BPM;
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

// 쉬운 기본 리듬: 킥/스네어 중심
function addEasyGroove(
  notes: BeatRiseChartNote[],
  startBar: number,
  endBar: number
) {
  for (let bar = startBar; bar < endBar; bar += 1) {
    const base = bar * BAR;

    // 1박, 3박만 사용
    notes.push(makeNote(base + BEAT * 0, 1, "beat"));
    notes.push(makeNote(base + BEAT * 2, 2, "beat"));

    // 2마디마다 한 번만 장식 노트
    if (bar % 2 === 1) {
      notes.push(makeNote(base + BEAT * 3, 3, "melody"));
    }
  }
}

// 빌드업: 조금 더 리듬감 있게, 그래도 과하지 않게
function addBuildUp(
  notes: BeatRiseChartNote[],
  startBar: number,
  endBar: number
) {
  for (let bar = startBar; bar < endBar; bar += 1) {
    const base = bar * BAR;

    notes.push(makeNote(base + BEAT * 0, 0, "beat"));
    notes.push(makeNote(base + BEAT * 1.5, 1, "melody"));
    notes.push(makeNote(base + BEAT * 3, 2, "beat"));

    // 마지막 2마디만 살짝 긴장감 추가
    if (bar >= endBar - 2) {
      notes.push(makeNote(base + BEAT * 3.5, 3, "melody"));
    }
  }
}

// 드롭: 리듬 타는 느낌은 살리되 한 번에 많이 안 떨어지게
function addEasyDrop(
  notes: BeatRiseChartNote[],
  startBar: number,
  endBar: number
) {
  const patternA = [
    { beat: 0, lane: 1, type: "beat" },
    { beat: 1, lane: 3, type: "beat" },
    { beat: 2, lane: 0, type: "beat" },
    { beat: 3, lane: 2, type: "melody" },
  ] as const;

  const patternB = [
    { beat: 0, lane: 2, type: "beat" },
    { beat: 1, lane: 0, type: "beat" },
    { beat: 2, lane: 3, type: "beat" },
    { beat: 3, lane: 1, type: "melody" },
  ] as const;

  for (let bar = startBar; bar < endBar; bar += 1) {
    const base = bar * BAR;
    const pattern = bar % 2 === 0 ? patternA : patternB;

    pattern.forEach((item) => {
      notes.push(
        makeNote(
          base + BEAT * item.beat,
          item.lane,
          item.type as BeatRiseNoteType
        )
      );
    });

    // 4마디마다 마지막에 한 개만 포인트
    if (bar % 4 === 3) {
      notes.push(makeNote(base + BEAT * 3.5, 3, "melody"));
    }
  }
}

// 쉬어가는 구간
function addBreak(
  notes: BeatRiseChartNote[],
  startBar: number,
  endBar: number
) {
  for (let bar = startBar; bar < endBar; bar += 1) {
    const base = bar * BAR;

    notes.push(makeNote(base + BEAT * 0, 1, "beat"));

    if (bar % 2 === 0) {
      notes.push(makeNote(base + BEAT * 2, 2, "melody"));
    }
  }
}

function makeFutureBassChart() {
  const notes: BeatRiseChartNote[] = [];

  // 0~8초: 쉬운 인트로
  addEasyGroove(notes, 0, 5);

  // 8~16초: 빌드업
  addBuildUp(notes, 5, 10);

  // 16~34초: 드롭, 하지만 쉬운 패턴
  addEasyDrop(notes, 10, 22);

  // 34~44초: 드롭 반복
  addEasyDrop(notes, 22, 28);

  // 44~52초: 쉬어가는 구간
  addBreak(notes, 28, 33);

  // 52~60초: 마지막 드롭
  addEasyDrop(notes, 33, 38);

  return notes
    .filter((note) => note.time >= 0 && note.time <= FUTURE_BASS_DURATION)
    .sort((a, b) => a.time - b.time)
    .filter((note, index, array) => {
      const prev = array[index - 1];
      if (!prev) return true;

      // 너무 가까운 노트 제거
      return Math.abs(prev.time - note.time) >= 0.18;
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
    difficulty: "NORMAL" as const,
    audioSrc: "/audio/alex-morgan-future-bass-drop-537458.mp3",
    startOffset: FUTURE_BASS_START_OFFSET,
    duration: FUTURE_BASS_DURATION,
    beatNotes: futureBassBeatNotes,
    melodyNotes: futureBassMelodyNotes,
    chart: futureBassChart,
  },
];
