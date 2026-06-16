export type BeatRiseNoteType = "beat" | "melody";

export type BeatRiseChartNote = {
  time: number;
  lane: 0 | 1 | 2 | 3;
  type: BeatRiseNoteType;
};

const beatLanePattern = [1, 2, 1, 3, 0, 2, 1, 2] as const;
const melodyLanePattern = [3, 2, 0, 1, 3, 0, 2, 1, 3, 2, 1, 0] as const;

// 원곡 기준 30초 ~ 1분 30초 사용
// 게임에서는 time 0 = 원곡 30초 지점
export const FUTURE_BASS_START_OFFSET = 30;
export const FUTURE_BASS_DURATION = 60;
export const FUTURE_BASS_BPM = 152;

export const futureBassBeatTimes = [
  0.464, 0.882, 1.277, 1.672, 2.09, 2.485, 2.879, 3.274, 3.669, 4.087,
  4.481, 4.876, 5.294, 5.689, 6.084, 6.478, 6.896, 7.291, 7.686, 8.081,
  8.475, 8.893, 9.288, 9.683, 10.077, 10.495, 10.89, 11.285, 11.68, 12.098,
  12.492, 12.887, 13.282, 13.7, 14.095, 14.489, 14.884, 15.279, 15.673, 16.091,
  16.486, 16.881, 17.276, 17.694, 18.088, 18.483, 18.901, 19.296, 19.691, 20.085,
  20.48, 20.898, 21.293, 21.687, 22.082, 22.477, 22.895, 23.29, 23.684, 24.079,
  24.497, 24.892, 25.287, 25.681, 26.076, 26.471, 26.889, 27.283, 27.678, 28.096,
  28.491, 28.886, 29.28, 29.675, 30.093, 30.488, 30.883, 31.277, 31.672, 32.09,
  32.485, 32.903, 33.297, 33.692, 34.087, 34.482, 34.876, 35.294, 35.689, 36.084,
  36.479, 36.897, 37.291, 37.686, 38.081, 38.499, 38.893, 39.288, 39.683, 40.078,
  40.472, 40.89, 41.285, 41.68, 42.075, 42.493, 42.887, 43.282, 43.677, 44.095,
  44.489, 44.884, 45.279, 45.674, 46.068, 46.486, 46.881, 47.276, 47.671, 48.089,
  48.483, 48.878, 49.273, 49.691, 50.085, 50.48, 50.875, 51.293, 51.688, 52.082,
  52.477, 52.872, 53.29, 53.685, 54.079, 54.497, 54.892, 55.287, 55.681, 56.076,
  56.494, 56.889, 57.284, 57.678, 58.096, 58.491, 58.886, 59.281, 59.629,
];

export const futureBassMelodyTimes = [
  0.627, 1.022, 1.44, 1.834, 2.229, 2.624, 3.019, 3.437, 3.831, 4.226,
  4.621, 5.039, 5.828, 9.033, 9.427, 9.822, 10.24, 10.728, 11.029, 11.424,
  12.237, 13.026, 13.839, 15.534, 15.929, 16.231, 17.043, 17.531, 17.833, 21.432,
  21.827, 22.221, 22.639, 23.034, 23.429, 23.847, 24.242, 24.636, 25.031, 25.426,
  25.844, 26.239, 26.633, 27.028, 27.446, 27.841, 28.235, 28.63, 29.025, 29.443,
  29.838, 30.232, 30.627, 31.44, 31.835, 32.229, 33.019, 33.437, 33.831, 35.039,
  35.434, 35.828, 36.641, 37.036, 38.243, 38.638, 39.033, 39.451, 40.24, 41.448,
  41.819, 42.237, 43.05, 43.445, 44.629, 45.023, 45.418, 46.231, 46.626, 47.438,
  47.833, 48.228, 48.646, 49.041, 49.435, 49.853, 50.248, 50.643, 51.037, 51.432,
  51.85, 52.64, 53.127, 53.429, 53.847, 54.242, 54.637, 55.031, 55.426, 55.844,
  56.239, 57.028, 57.423,
];

export const futureBassBeatNotes: BeatRiseChartNote[] = futureBassBeatTimes.map(
  (time, index) => ({
    time,
    lane: beatLanePattern[index % beatLanePattern.length],
    type: "beat",
  })
);

export const futureBassMelodyNotes: BeatRiseChartNote[] =
  futureBassMelodyTimes.map((time, index) => ({
    time,
    lane: melodyLanePattern[index % melodyLanePattern.length],
    type: "melody",
  }));

export const futureBassChart: BeatRiseChartNote[] = [
  ...futureBassBeatNotes,
  ...futureBassMelodyNotes,
].sort((a, b) => a.time - b.time);

export const MUSIC_TRACKS = [
  {
    id: "future-bass-drop",
    title: "Future Bass Drop",
    bpm: FUTURE_BASS_BPM,
    difficulty: "HARD" as const,
    audioSrc: "https://beat-rise-0610.netlify.app/audio/alex-morgan-future-bass-drop-537458.mp3",
    startOffset: FUTURE_BASS_START_OFFSET,
    duration: FUTURE_BASS_DURATION,
    beatNotes: futureBassBeatNotes,
    melodyNotes: futureBassMelodyNotes,
    chart: futureBassChart,
  },
];
