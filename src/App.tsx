import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, PointerEvent, ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import "./App.css";
import { socket } from "./socket";
import { supabase } from "./supabaseClient";
import {
  dbProfileToLocalProfile,
  loadOrCreateProfile,
  saveProfilePatch,
  uploadProfileAvatar,
} from "./profileStore";
import { MUSIC_TRACKS } from "./musicData";
import type { BeatRiseNoteType } from "./musicData";

type Screen =
  | "home"
  | "tutorial"
  | "battleMenu"
  | "quickMatching"
  | "quickLobby"
  | "roomCodeInput"
  | "roomLobby"
  | "aiLobby"
  | "battle"
  | "result"
  | "event"
  | "audition";

type BattleMode = "quick" | "room" | "ai";
type Judge = "PERFECT" | "GREAT" | "GOOD" | "MISS" | "";
type OnlineSide = "A" | "B";

type Character = {
  id: string;
  name: string;
  emoji: string;
  color: string;
  role: string;
  passive: string;
  active: string;
  type: "buff" | "attack";
};

type MusicTrack = {
  id: string;
  title: string;
  bpm: number;
  difficulty: "EASY" | "NORMAL" | "HARD" | "EXPERT";
  audioSrc: string;
  startOffset: number;
  duration: number;
  beatNotes: {
    time: number;
    lane: 0 | 1 | 2 | 3;
    type: BeatRiseNoteType;
  }[];
  melodyNotes: {
    time: number;
    lane: 0 | 1 | 2 | 3;
    type: BeatRiseNoteType;
  }[];
  chart: {
    time: number;
    lane: 0 | 1 | 2 | 3;
    type: BeatRiseNoteType;
  }[];
};

type Profile = {
  nickname: string;
  avatar: string;
  border: "neon" | "gold" | "purple" | "plain";
  level: number;
  exp: number;
  followers: number;
  following: number;
  wins: number;
  losses: number;
};

type Note = {
  id: number;
  lane: 0 | 1 | 2 | 3;
  time: number;
  type: BeatRiseNoteType;
  hit: boolean;
  missed: boolean;
};

type ResultData = {
  victory: "VICTORY" | "DEFEAT" | "DRAW";
  myScore: number;
  rivalScore: number;
  perfect: number;
  great: number;
  good: number;
  miss: number;
  maxCombo: number;
  exp: number;
  coins: number;
  reason?: "timeUp" | "surrender" | "opponentSurrender";
};

type Friend = {
  id: string;
  nickname: string;
  avatar: string;
  mutual: boolean;
  giftedToday: boolean;
};

type Mail = {
  id: string;
  type: "follow" | "gift" | "reward";
  from: string;
  avatar: string;
  text: string;
  claimed: boolean;
};

type Mission = {
  id: string;
  title: string;
  desc: string;
  reward: string;
  done: boolean;
  claimed: boolean;
};

const PHONE_RATIO = "9 / 19.5";

const MAX_SELECTED_CHARACTERS = 2;
const NOTE_FALL_TIME = 2.25;
const NOTE_START_TOP = -10;
const NOTE_JUDGE_TOP = 82;
const NOTE_EXIT_AFTER = 0.95;

const PERFECT_WINDOW = 0.07;
const GREAT_WINDOW = 0.14;
const GOOD_WINDOW = 0.24;

const characters: Character[] = [
  {
    id: "rio",
    name: "리오",
    emoji: "💧",
    color: "#49dfff",
    role: "시야 방해",
    passive: "숏 노트 성공 시 피버 +10%",
    active: "상대 노트 시야 방해",
    type: "attack",
  },
  {
    id: "mika",
    name: "미카",
    emoji: "😈",
    color: "#ff4bc8",
    role: "멘탈 공격",
    passive: "콤보 20 이상일 때 피버 추가 증가",
    active: "상대 실수 확률 증가",
    type: "attack",
  },
  {
    id: "jet",
    name: "제트",
    emoji: "🌀",
    color: "#8b5cff",
    role: "좌우 반전",
    passive: "PERFECT 시 피버 추가 증가",
    active: "상대 레인 좌우 반전",
    type: "attack",
  },
  {
    id: "luna",
    name: "루나",
    emoji: "🌙",
    color: "#ffd36a",
    role: "피버 충전",
    passive: "숏 노트 성공 시 피버 2배",
    active: "5초간 판정 범위 증가",
    type: "buff",
  },
  {
    id: "kai",
    name: "카이",
    emoji: "🔥",
    color: "#ff713d",
    role: "폭발 점수",
    passive: "롱 노트 성공 시 피버 추가 증가",
    active: "8초간 점수 2배",
    type: "buff",
  },
];

const musicTracks = MUSIC_TRACKS as MusicTrack[];

const tutorialPages = [
  {
    title: "노트 치는 법",
    desc: "노트가 아래 판정선에 정확히 걸치는 순간 같은 레인을 누르면 돼.",
  },
  {
    title: "판정",
    desc: "판정은 PERFECT, GREAT, GOOD, MISS 네 단계로 표시돼.",
  },
  {
    title: "콤보와 배율",
    desc: "10콤보 x1.5, 20콤보 x2.0, 30콤보 x2.5로 점수 배율이 올라가.",
  },
  {
    title: "피버와 스킬",
    desc: "노트를 맞히면 피버 게이지가 차고, 100%가 되면 캐릭터 스킬을 사용할 수 있어.",
  },
  {
    title: "공격 성공",
    desc: "방해 스킬로 상대가 실수하면 내 화면 위쪽에 ‘공격 성공!’이 표시돼.",
  },
];

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function getRandomMusic() {
  return musicTracks[Math.floor(Math.random() * musicTracks.length)];
}

function getComboMultiplier(combo: number) {
  if (combo >= 30) return 2.5;
  if (combo >= 20) return 2;
  if (combo >= 10) return 1.5;
  return 1;
}

function getWinRate(wins: number, losses: number) {
  const total = wins + losses;
  if (total <= 0) return 0;
  return Math.round((wins / total) * 100);
}

export default function App() {
  const [screen, setScreen] = useState<Screen>("home");
  const [battleMode, setBattleMode] = useState<BattleMode>("quick");

  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [nicknameDraft, setNicknameDraft] = useState("Guest");
  const [nicknameSaving, setNicknameSaving] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);

  const [onlineRoomCode, setOnlineRoomCode] = useState("");
  const [myOnlineSide, setMyOnlineSide] = useState<OnlineSide | null>(null);
  const [matchingText, setMatchingText] = useState("상대를 찾는 중...");

  const [onlineOpponentProfile, setOnlineOpponentProfile] = useState({
    nickname: "Rival",
    avatar: "R",
    border: "purple" as Profile["border"],
    level: 1,
  });

  const [profile, setProfile] = useState<Profile>({
    nickname: "Guest",
    avatar: "G",
    border: "neon",
    level: 1,
    exp: 0,
    followers: 0,
    following: 0,
    wins: 0,
    losses: 0,
  });

  const [gems, setGems] = useState(120);
  const [coins, setCoins] = useState(3200);

  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileEditOpen, setProfileEditOpen] = useState(false);
  const [profileEditTab, setProfileEditTab] = useState<
    "avatar" | "album" | "border"
  >("avatar");
  const [missionOpen, setMissionOpen] = useState(false);
  const [friendOpen, setFriendOpen] = useState(false);
  const [mailOpen, setMailOpen] = useState(false);

  const [tutorialSeen, setTutorialSeen] = useState(false);
  const [tutorialPage, setTutorialPage] = useState(0);

  const [sound, setSound] = useState(70);
  const [vibration, setVibration] = useState(true);

  const [turntableAngle, setTurntableAngle] = useState(0);
  const [pressedSector, setPressedSector] = useState<
    "battle" | "event" | "audition" | null
  >(null);

  const turntableRef = useRef<HTMLDivElement | null>(null);
  const battleFinishedRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const dragRef = useRef({
    dragging: false,
    moved: false,
    centerX: 0,
    centerY: 0,
    startAngle: 0,
    startTurntableAngle: 0,
    lastPointerAngle: 0,
    lastTime: 0,
    velocity: 0,
    inertiaFrame: 0,
  });

  const [roomCode, setRoomCode] = useState("BEAT");
  const [musicOpen, setMusicOpen] = useState(false);
  const [selectedMusic, setSelectedMusic] = useState<MusicTrack>(musicTracks[0]);

  const [selectedCharacters, setSelectedCharacters] = useState<string[]>(["rio"]);
  const [aiDifficulty, setAiDifficulty] = useState<"EASY" | "NORMAL" | "HARD">(
    "NORMAL"
  );
  const [aiCharacters, setAiCharacters] = useState<string[]>(["mika"]);

  const [battleStartedAt, setBattleStartedAt] = useState(0);
  const [battleElapsed, setBattleElapsed] = useState(0);
  const [notes, setNotes] = useState<Note[]>([]);
  const [myScore, setMyScore] = useState(0);
  const [rivalScore, setRivalScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const myScoreRef = useRef(0);
  const rivalScoreRef = useRef(0);
  const [maxCombo, setMaxCombo] = useState(0);
  const [fever, setFever] = useState(0);
  const [pressedLane, setPressedLane] = useState<number | null>(null);
  const [judge, setJudge] = useState<Judge>("");
  const [attackSuccess, setAttackSuccess] = useState(false);
  const [skillActive, setSkillActive] = useState<string | null>(null);

  const [perfectCount, setPerfectCount] = useState(0);
  const [greatCount, setGreatCount] = useState(0);
  const [goodCount, setGoodCount] = useState(0);
  const [missCount, setMissCount] = useState(0);
  const perfectCountRef = useRef(0);
const greatCountRef = useRef(0);
const goodCountRef = useRef(0);
const missCountRef = useRef(0);
const maxComboRef = useRef(0);

  const [result, setResult] = useState<ResultData | null>(null);

  const [friends, setFriends] = useState<Friend[]>([]);
  const [friendSearch, setFriendSearch] = useState("");

  const [mails, setMails] = useState<Mail[]>([]);

  const [missions, setMissions] = useState<Mission[]>([
    {
      id: "daily1",
      title: "첫 배틀 플레이",
      desc: "오늘 배틀을 1회 플레이",
      reward: "코인 100",
      done: false,
      claimed: false,
    },
    {
      id: "daily2",
      title: "콤보 연습",
      desc: "20콤보 이상 달성",
      reward: "코인 150",
      done: false,
      claimed: false,
    },
    {
      id: "daily3",
      title: "PERFECT 감각",
      desc: "PERFECT 10회 달성",
      reward: "젬 3",
      done: false,
      claimed: false,
    },
    {
      id: "daily4",
      title: "스킬 사용",
      desc: "피버 스킬 1회 사용",
      reward: "코인 100",
      done: false,
      claimed: false,
    },
    {
      id: "daily5",
      title: "결과 확인",
      desc: "결과 화면 확인",
      reward: "코인 100",
      done: false,
      claimed: false,
    },
  ]);

  const selectedCharacterObjects = useMemo(
    () =>
      selectedCharacters
        .map((id) => characters.find((c) => c.id === id))
        .filter(Boolean) as Character[],
    [selectedCharacters]
  );

  const expPercent = (profile.exp % 400) / 4;
  const winRate = getWinRate(profile.wins, profile.losses);
  const multiplier = getComboMultiplier(combo);
  const missionNotice = missions.some((m) => m.done && !m.claimed);
  const mailNotice = mails.some((m) => !m.claimed);
  const friendNotice = friends.some((f) => !f.mutual);

  useEffect(() => {
    let mounted = true;

    async function applyProfileFromSession(nextSession: Session | null) {
      setSession(nextSession);
      setAuthLoading(false);

      const user = nextSession?.user;

      if (!user) return;

      try {
        const dbProfile = await loadOrCreateProfile(user.id, user.email);

        if (!mounted) return;

        const localProfile = dbProfileToLocalProfile(dbProfile);

        setProfile(localProfile);
        setNicknameDraft(localProfile.nickname);
        setGems(dbProfile.gems);
        setCoins(dbProfile.coins);
      } catch (error) {
        console.log("프로필 불러오기 실패:", error);
      }
    }

    async function loadSession() {
      const { data, error } = await supabase.auth.getSession();

      if (!mounted) return;

      if (error) {
        console.log("Supabase session error:", error.message);
        setAuthLoading(false);
        return;
      }

      await applyProfileFromSession(data.session);
    }

    loadSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      applyProfileFromSession(nextSession);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    setNicknameDraft(profile.nickname);
  }, [profile.nickname, profileOpen]);

  useEffect(() => {
    function handleConnect() {
      console.log("✅ socket connected:", socket.id);
    }

    function handleConnectError(error: Error) {
      console.log("❌ socket connect error:", error.message);
    }

    function handleDisconnect() {
      console.log("⚠️ socket disconnected");
    }

    socket.on("connect", handleConnect);
    socket.on("connect_error", handleConnectError);
    socket.on("disconnect", handleDisconnect);

    return () => {
      socket.off("connect", handleConnect);
      socket.off("connect_error", handleConnectError);
      socket.off("disconnect", handleDisconnect);
    };
  }, []);

  useEffect(() => {
    function handleQuickMatchWaiting() {
      setMatchingText("상대를 찾는 중...");
      setScreen("quickMatching");
    }

    function handleQuickMatchFound(payload: {
      roomCode: string;
      side: OnlineSide;
      state: {
        musicId?: string;
        noteSeed?: number;
        players?: {
          side: OnlineSide;
          nickname: string;
          avatar: string;
          border?: Profile["border"];
          level?: number;
        }[];
      };
    }) {
      setOnlineRoomCode(payload.roomCode);
      setRoomCode(payload.roomCode);
      setMyOnlineSide(payload.side);
      updateOnlineOpponentProfile(payload.state?.players, payload.side);

      const matchedMusic = musicTracks.find(
        (track) => track.id === payload.state?.musicId
      );

      if (matchedMusic) {
        setSelectedMusic(matchedMusic);
      }

      setScreen("quickLobby");
    }

    function handleJoinedRoom(payload: {
      roomCode: string;
      side: OnlineSide;
      state: {
        musicId?: string;
        noteSeed?: number;
        players?: {
          side: OnlineSide;
          nickname: string;
          avatar: string;
          border?: Profile["border"];
          level?: number;
        }[];
      };
    }) {
      setOnlineRoomCode(payload.roomCode);
      setRoomCode(payload.roomCode);
      setMyOnlineSide(payload.side);
      updateOnlineOpponentProfile(payload.state?.players, payload.side);

      const matchedMusic = musicTracks.find(
        (track) => track.id === payload.state?.musicId
      );

      if (matchedMusic) {
        setSelectedMusic(matchedMusic);
      }

      setScreen("roomLobby");
    }

    function handleBattleStarted(payload: {
      roomCode: string;
      startedAt: number;
      musicId: string;
      noteSeed: number;
      scores: {
        A: number;
        B: number;
      };
    }) {
      const matchedMusic = musicTracks.find(
        (track) => track.id === payload.musicId
      );

      if (matchedMusic) {
        setSelectedMusic(matchedMusic);
      }

      const mode = screen === "roomLobby" ? "room" : "quick";
      startBattle(mode, payload.noteSeed);
    }

    function handleRoomState(payload: {
      roomCode: string;
      players?: {
        side: OnlineSide;
        nickname: string;
        avatar: string;
        border?: Profile["border"];
        level?: number;
      }[];
      scores?: {
        A: number;
        B: number;
      };
    }) {
      updateOnlineOpponentProfile(payload.players, myOnlineSide);

      if (!payload.scores || !myOnlineSide) return;

      const rivalSide = myOnlineSide === "A" ? "B" : "A";
const nextRivalScore = payload.scores[rivalSide];

rivalScoreRef.current = nextRivalScore;
setRivalScore(nextRivalScore);
    }

    function handleScoreSync(payload: {
      side: OnlineSide;
      score: number;
      scores: {
        A: number;
        B: number;
      };
    }) {
      if (!myOnlineSide) return;

      const rivalSide = myOnlineSide === "A" ? "B" : "A";

      if (payload.side === rivalSide) {
  rivalScoreRef.current = payload.score;
  setRivalScore(payload.score);
  return;
}

const nextRivalScore = payload.scores[rivalSide];
rivalScoreRef.current = nextRivalScore;
setRivalScore(nextRivalScore);
    }

    function handleAttackSuccess(payload: {
      fromSide: OnlineSide;
      targetSide: OnlineSide;
    }) {
      if (!myOnlineSide) return;

      if (payload.fromSide === myOnlineSide) {
        setAttackSuccess(true);
        setTimeout(() => setAttackSuccess(false), 900);
      }
    }

    function handleBattleEnded(payload: {
      reason?: "timeUp" | "surrender";
      surrenderSide?: OnlineSide | null;
      scores?: {
        A: number;
        B: number;
      };
    }) {
      if (screen !== "battle") return;

      if (payload.scores && myOnlineSide) {
  const rivalSide = myOnlineSide === "A" ? "B" : "A";
  const nextRivalScore = payload.scores[rivalSide];

  rivalScoreRef.current = nextRivalScore;
  setRivalScore(nextRivalScore);
}

      if (payload.reason === "surrender" && payload.surrenderSide) {
        if (payload.surrenderSide !== myOnlineSide) {
          finishBattle({
            opponentSurrendered: true,
            notifyServer: false,
          });
        }
      }
    }

    socket.on("quickMatchWaiting", handleQuickMatchWaiting);
    socket.on("quickMatchFound", handleQuickMatchFound);
    socket.on("joinedRoom", handleJoinedRoom);
    socket.on("battleStarted", handleBattleStarted);
    socket.on("roomState", handleRoomState);
    socket.on("scoreSync", handleScoreSync);
    socket.on("attackSuccess", handleAttackSuccess);
    socket.on("battleEnded", handleBattleEnded);

    return () => {
      socket.off("quickMatchWaiting", handleQuickMatchWaiting);
      socket.off("quickMatchFound", handleQuickMatchFound);
      socket.off("joinedRoom", handleJoinedRoom);
      socket.off("battleStarted", handleBattleStarted);
      socket.off("roomState", handleRoomState);
      socket.off("scoreSync", handleScoreSync);
      socket.off("attackSuccess", handleAttackSuccess);
      socket.off("battleEnded", handleBattleEnded);
    };
  }, [myOnlineSide, screen, selectedMusic]);

  function updateOnlineOpponentProfile(
    players:
      | {
          side: OnlineSide;
          nickname: string;
          avatar: string;
          border?: Profile["border"];
          level?: number;
        }[]
      | undefined,
    mySide: OnlineSide | null
  ) {
    if (!players || !mySide) return;

    const rival = players.find((player) => player.side !== mySide);

    if (!rival) return;

    setOnlineOpponentProfile({
      nickname: rival.nickname || "Rival",
      avatar: rival.avatar || "R",
      border: rival.border || "purple",
      level: Number(rival.level) || 1,
    });
  }

async function signInWithGoogle() {
  const redirectUrl =
    window.location.hostname === "localhost"
      ? "http://localhost:5173"
      : "https://beat-rise-0610.netlify.app";

  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: redirectUrl,
    },
  });

  if (error) {
    alert(`로그인 실패: ${error.message}`);
  }
}

async function signInWithKakao() {
  const redirectUrl =
    window.location.hostname === "localhost"
      ? "http://localhost:5173"
      : "https://beat-rise-0610.netlify.app";

  const { error } = await supabase.auth.signInWithOAuth({
    provider: "kakao",
    options: {
      redirectTo: redirectUrl,
      scopes: "profile_nickname profile_image",
    },
  });

  if (error) {
    alert(`카카오 로그인 실패: ${error.message}`);
  }
}
  async function signOut() {
    const { error } = await supabase.auth.signOut();

    if (error) {
      alert(`로그아웃 실패: ${error.message}`);
      return;
    }

    setSession(null);
    setProfile({
      nickname: "Guest",
      avatar: "G",
      border: "neon",
      level: 1,
      exp: 0,
      followers: 0,
      following: 0,
      wins: 0,
      losses: 0,
    });
    setNicknameDraft("Guest");
    setGems(120);
    setCoins(3200);
  }

  async function saveNickname() {
    const nextNickname = nicknameDraft.trim().slice(0, 16);

    if (!nextNickname) {
      alert("닉네임을 입력해줘.");
      return;
    }

    setNicknameSaving(true);

    setProfile((prev) => ({
      ...prev,
      nickname: nextNickname,
      avatar:
        prev.avatar.startsWith("http") || prev.avatar.startsWith("data:image/")
          ? prev.avatar
          : nextNickname.slice(0, 1).toUpperCase(),
    }));

    if (session) {
      try {
        await saveProfilePatch(session.user.id, {
          nickname: nextNickname,
          avatar_text: nextNickname.slice(0, 1).toUpperCase(),
        });

        await supabase.auth.updateUser({
          data: {
            display_name: nextNickname,
            full_name: nextNickname,
            name: nextNickname,
          },
        });
      } catch (error) {
        alert("닉네임 저장에 실패했어.");
        console.log(error);
      }
    }

    setNicknameSaving(false);
  }

  async function changeProfileImageFromAlbum(
    event: ChangeEvent<HTMLInputElement>
  ) {
    const file = event.target.files?.[0];

    if (!file) return;

    if (!file.type.startsWith("image/")) {
      alert("이미지 파일만 선택할 수 있어.");
      return;
    }

    setAvatarUploading(true);

    try {
      if (session) {
        const publicUrl = await uploadProfileAvatar(session.user.id, file);

        setProfile((prev) => ({
          ...prev,
          avatar: publicUrl,
        }));

        await saveProfilePatch(session.user.id, {
          avatar_url: publicUrl,
        });
      } else {
        const reader = new FileReader();

        reader.onload = () => {
          const imageUrl = String(reader.result);

          setProfile((prev) => ({
            ...prev,
            avatar: imageUrl,
          }));

          setAvatarUploading(false);
        };

        reader.readAsDataURL(file);
        return;
      }
    } catch (error) {
      alert("프로필 사진 저장에 실패했어.");
      console.log(error);
    }

    setAvatarUploading(false);
  }

  function completeMission(id: string) {
    setMissions((prev) =>
      prev.map((m) => (m.id === id ? { ...m, done: true } : m))
    );
  }

  function claimMission(id: string) {
    setMissions((prev) =>
      prev.map((m) => {
        if (m.id !== id || !m.done || m.claimed) return m;

        if (m.reward.includes("젬")) {
          setGems((g) => {
            const nextGems = g + 3;

            if (session) {
              saveProfilePatch(session.user.id, {
                gems: nextGems,
              });
            }

            return nextGems;
          });
        } else {
          setCoins((c) => {
            const nextCoins = c + 100;

            if (session) {
              saveProfilePatch(session.user.id, {
                coins: nextCoins,
              });
            }

            return nextCoins;
          });
        }

        return { ...m, claimed: true };
      })
    );
  }

  function getPointerAngle(clientX: number, clientY: number) {
    const rad = Math.atan2(
      clientY - dragRef.current.centerY,
      clientX - dragRef.current.centerX
    );
    return (rad * 180) / Math.PI;
  }

  function getSectorFromPoint(clientX: number, clientY: number) {
    const rect = turntableRef.current?.getBoundingClientRect();
    if (!rect) return null;

    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const raw = (Math.atan2(clientY - cy, clientX - cx) * 180) / Math.PI;
    const angle = (raw - turntableAngle + 450) % 360;

    if (angle >= 300 || angle < 60) return "battle";
    if (angle >= 60 && angle < 180) return "audition";
    return "event";
  }

  function stopInertia() {
    if (dragRef.current.inertiaFrame) {
      cancelAnimationFrame(dragRef.current.inertiaFrame);
      dragRef.current.inertiaFrame = 0;
    }
  }

  function startInertia(initialVelocity: number) {
    let velocity = initialVelocity * 2.4;

    const step = () => {
      velocity *= 0.975;

      if (Math.abs(velocity) < 0.008) {
        dragRef.current.inertiaFrame = 0;
        return;
      }

      setTurntableAngle((prev) => prev + velocity * 22);
      dragRef.current.inertiaFrame = requestAnimationFrame(step);
    };

    dragRef.current.inertiaFrame = requestAnimationFrame(step);
  }

  function handleTurntableDown(event: PointerEvent<HTMLDivElement>) {
    stopInertia();

    const rect = event.currentTarget.getBoundingClientRect();
    const now = performance.now();
    const angle = getPointerAngle(event.clientX, event.clientY);

    dragRef.current = {
      ...dragRef.current,
      dragging: true,
      moved: false,
      centerX: rect.left + rect.width / 2,
      centerY: rect.top + rect.height / 2,
      startAngle: angle,
      startTurntableAngle: turntableAngle,
      lastPointerAngle: angle,
      lastTime: now,
      velocity: 0,
    };

    setPressedSector(getSectorFromPoint(event.clientX, event.clientY));
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleTurntableMove(event: PointerEvent<HTMLDivElement>) {
    if (!dragRef.current.dragging) return;

    const now = performance.now();
    const angle = getPointerAngle(event.clientX, event.clientY);
    const diff = (angle - dragRef.current.startAngle) * 2;

    if (Math.abs(diff) > 5) dragRef.current.moved = true;

    const dt = Math.max(8, now - dragRef.current.lastTime);
    const da = angle - dragRef.current.lastPointerAngle;

    dragRef.current.velocity = (da * 2) / dt;
    dragRef.current.lastPointerAngle = angle;
    dragRef.current.lastTime = now;

    setTurntableAngle(dragRef.current.startTurntableAngle + diff);
  }

  function handleTurntableUp(event: PointerEvent<HTMLDivElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    const moved = dragRef.current.moved;
    const velocity = dragRef.current.velocity;
    const sector = getSectorFromPoint(event.clientX, event.clientY);

    dragRef.current.dragging = false;
    setTimeout(() => setPressedSector(null), 130);

    if (moved) {
      startInertia(velocity);
      setTimeout(() => {
        dragRef.current.moved = false;
      }, 80);
      return;
    }

    if (sector === "battle") {
      if (!tutorialSeen) {
        setTutorialPage(0);
        setScreen("tutorial");
      } else {
        setScreen("battleMenu");
      }
    }

    if (sector === "event") setScreen("event");
    if (sector === "audition") setScreen("audition");
  }

  function finishTutorial() {
    setTutorialSeen(true);
    setScreen("battleMenu");
  }

  function toggleCharacter(id: string, target: "player" | "ai") {
    const setter = target === "player" ? setSelectedCharacters : setAiCharacters;

    setter((prev) => {
      if (prev.includes(id)) return prev.filter((v) => v !== id);
      if (prev.length >= MAX_SELECTED_CHARACTERS) return prev;
      return [...prev, id];
    });
  }

  function startBattle(mode: BattleMode, onlineSeed?: number) {
    battleFinishedRef.current = false;

    const chartNotes: Note[] = selectedMusic.chart.map((note, index) => ({
      id: index + 1,
      lane: note.lane,
      time: note.time,
      type: note.type,
      hit: false,
      missed: false,
    }));

    setBattleMode(mode);
    setNotes(chartNotes);
    setBattleStartedAt(performance.now());
    setBattleElapsed(0);
    setMyScore(0);
    setRivalScore(0);
    setCombo(0);
    setMaxCombo(0);
    myScoreRef.current = 0;
    rivalScoreRef.current = 0;
    setFever(0);
    setJudge("");
    setAttackSuccess(false);
    setSkillActive(null);
    setPerfectCount(0);
setGreatCount(0);
setGoodCount(0);
setMissCount(0);
setResult(null);

perfectCountRef.current = 0;
greatCountRef.current = 0;
goodCountRef.current = 0;
missCountRef.current = 0;
maxComboRef.current = 0;
    setScreen("battle");
    completeMission("daily1");

const audio = audioRef.current;

if (!audio) {
  alert("audioRef가 비어있어서 음악을 재생할 수 없어.");
} else {
  audio.pause();
  audio.src = selectedMusic.audioSrc;
  audio.muted = false;
  audio.volume = Math.max(0.6, Math.min(1, sound / 100));

  const startMusic = () => {
    try {
      audio.currentTime = selectedMusic.startOffset || 0;
    } catch (error) {
      console.log("음악 시작 위치 설정 실패:", error);
    }

    audio
      .play()
      .then(() => {
        console.log("음악 재생 성공");
      })
      .catch((error) => {
        alert(`음악 재생 실패: ${error.message}`);
        console.log("음악 재생 실패:", error);
      });
  };

  audio.onloadedmetadata = startMusic;
audio.onerror = () => {
  alert(`음악 파일을 불러오지 못했어.\n현재 불러온 주소: ${audio.src}`);
};

  audio.load();
}

    console.log("onlineSeed:", onlineSeed);
  }

  function syncOnlineScore(nextScore: number) {
    if ((battleMode !== "quick" && battleMode !== "room") || !onlineRoomCode) {
      return;
    }

    socket.emit("scoreSync", {
      roomCode: onlineRoomCode,
      score: nextScore,
    });
  }

 function handleMiss() {
  setJudge("MISS");
  setCombo(0);

  setMissCount((v) => {
    const next = v + 1;
    missCountRef.current = next;
    return next;
  });
}

  function hitLane(lane: number) {
    setPressedLane(lane);
    setTimeout(() => setPressedLane(null), 120);

    const current = battleElapsed;
    const target = notes
      .filter((n) => !n.hit && !n.missed && n.lane === lane)
      .sort((a, b) => Math.abs(a.time - current) - Math.abs(b.time - current))[0];

    if (!target) {
      handleMiss();
      return;
    }

    const diff = Math.abs(target.time - current);

    if (diff > GOOD_WINDOW) {
      handleMiss();
      return;
    }

    const nextJudge: Judge =
      diff <= PERFECT_WINDOW ? "PERFECT" : diff <= GREAT_WINDOW ? "GREAT" : "GOOD";

    const nextCombo = combo + 1;
    const lunaBonus = selectedCharacters.includes("luna") ? 2 : 1;
    const feverGain =
      nextJudge === "PERFECT" ? 12 * lunaBonus : nextJudge === "GREAT" ? 9 : 6;

    const baseScore =
      nextJudge === "PERFECT" ? 100 : nextJudge === "GREAT" ? 82 : 60;

    const scoreDelta =
      baseScore *
      getComboMultiplier(nextCombo) *
      (skillActive === "kai" ? 2 : 1);

    setNotes((prev) =>
      prev.map((n) => (n.id === target.id ? { ...n, hit: true } : n))
    );

    setJudge(nextJudge);
    setCombo(nextCombo);
   setMaxCombo((prev) => {
  const next = Math.max(prev, nextCombo);
  maxComboRef.current = next;
  return next;
});
    setFever((prev) => clamp(prev + feverGain, 0, 100));

    setMyScore((prev) => {
  const nextScore = Math.floor(prev + scoreDelta);
  myScoreRef.current = nextScore;
  syncOnlineScore(nextScore);
  return nextScore;
});

    if (nextJudge === "PERFECT") {
  setPerfectCount((v) => {
    const next = v + 1;
    perfectCountRef.current = next;
    return next;
  });
}

if (nextJudge === "GREAT") {
  setGreatCount((v) => {
    const next = v + 1;
    greatCountRef.current = next;
    return next;
  });
}

if (nextJudge === "GOOD") {
  setGoodCount((v) => {
    const next = v + 1;
    goodCountRef.current = next;
    return next;
  });
}

    if (nextCombo >= 20) completeMission("daily2");
    if (perfectCount + 1 >= 10) completeMission("daily3");
  }
  useEffect(() => {
    function handleBattleKeyDown(event: KeyboardEvent) {
      if (screen !== "battle") return;
      if (event.repeat) return;

      const key = event.key.toLowerCase();

      if (key === "d") {
        event.preventDefault();
        hitLane(0);
      }

      if (key === "f") {
        event.preventDefault();
        hitLane(1);
      }

      if (key === "j") {
        event.preventDefault();
        hitLane(2);
      }

      if (key === "k") {
        event.preventDefault();
        hitLane(3);
      }
    }

    window.addEventListener("keydown", handleBattleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleBattleKeyDown);
    };
  }, [screen, battleElapsed, notes, combo, skillActive]);
  function useSkill(character: Character) {
    if (fever < 100) return;

    setFever(0);
    setSkillActive(character.id);
    completeMission("daily4");

    if (character.type === "attack") {
      if ((battleMode === "quick" || battleMode === "room") && onlineRoomCode) {
        socket.emit("useSkill", {
          roomCode: onlineRoomCode,
          skillId: character.id,
          skillName: character.active,
        });

        socket.emit("attackSuccess", {
          roomCode: onlineRoomCode,
        });
      } else {
        setAttackSuccess(true);
        setTimeout(() => setAttackSuccess(false), 900);
        setRivalScore((prev) => Math.max(0, prev - 220));
      }
    }

    setTimeout(() => setSkillActive(null), 6000);
  }

  async function saveProgressToCloud(next: {
    level: number;
    exp: number;
    gems: number;
    coins: number;
    wins: number;
    losses: number;
  }) {
    if (!session) return;

    setProfileSaving(true);

    try {
      await saveProfilePatch(session.user.id, {
        level: next.level,
        exp: next.exp,
        gems: next.gems,
        coins: next.coins,
        wins: next.wins,
        losses: next.losses,
        followers: profile.followers,
        following: profile.following,
        border: profile.border,
      });
    } catch (error) {
      console.log("진행도 저장 실패:", error);
    }

    setProfileSaving(false);
  }

  function finishBattle(options?: {
    surrendered?: boolean;
    opponentSurrendered?: boolean;
    notifyServer?: boolean;
  }) {
    if (battleFinishedRef.current) return;
    battleFinishedRef.current = true;

    audioRef.current?.pause();

    const surrendered = options?.surrendered ?? false;
    const opponentSurrendered = options?.opponentSurrendered ?? false;
    const notifyServer = options?.notifyServer ?? true;

    const finalMy = myScoreRef.current;
    const finalRival = rivalScoreRef.current;

    let victory: ResultData["victory"];

    if (surrendered) {
      victory = "DEFEAT";
    } else if (opponentSurrendered) {
      victory = "VICTORY";
    } else {
      victory =
        finalMy === finalRival
          ? "DRAW"
          : finalMy > finalRival
            ? "VICTORY"
            : "DEFEAT";
    }

    const exp = surrendered ? 0 : victory === "VICTORY" ? 500 : 50;
    const rewardCoins = surrendered ? 0 : victory === "VICTORY" ? 150 : 30;

    const resultData: ResultData = {
      victory,
      myScore: finalMy,
      rivalScore: finalRival,
      perfect: perfectCountRef.current,
great: greatCountRef.current,
good: goodCountRef.current,
miss: missCountRef.current,
maxCombo: maxComboRef.current,
      exp,
      coins: rewardCoins,
      reason: surrendered
        ? "surrender"
        : opponentSurrendered
          ? "opponentSurrender"
          : "timeUp",
    };

    setResult(resultData);

    setProfile((prev) => {
      const nextExp = prev.exp + exp;
      const nextLevel = Math.floor(nextExp / 400) + 1;
      const nextWins = victory === "VICTORY" ? prev.wins + 1 : prev.wins;
      const nextLosses = victory === "DEFEAT" ? prev.losses + 1 : prev.losses;
      const nextCoins = coins + rewardCoins;

      saveProgressToCloud({
        level: nextLevel,
        exp: nextExp,
        gems,
        coins: nextCoins,
        wins: nextWins,
        losses: nextLosses,
      });

      return {
        ...prev,
        exp: nextExp,
        level: nextLevel,
        wins: nextWins,
        losses: nextLosses,
      };
    });

    setCoins((prev) => prev + rewardCoins);
    completeMission("daily5");

    if (
      notifyServer &&
      (battleMode === "quick" || battleMode === "room") &&
      onlineRoomCode
    ) {
      socket.emit("battleEnded", {
  roomCode: onlineRoomCode,
  reason: surrendered ? "surrender" : "timeUp",
  scores: {
    myScore: myScoreRef.current,
    rivalScore: rivalScoreRef.current,
    side: myOnlineSide,
  },
});
    }

    setScreen("result");
  }

  function surrenderBattle() {
    const confirmed = window.confirm("정말 항복할까요? 항복하면 즉시 패배 처리돼.");

    if (!confirmed) return;

    finishBattle({
      surrendered: true,
      notifyServer: true,
    });
  }

  useEffect(() => {
    if (screen !== "battle") return;

    let raf = 0;

    const loop = (time: number) => {
      const audio = audioRef.current;

      const audioElapsed =
        audio && !audio.paused
          ? audio.currentTime - selectedMusic.startOffset
          : (time - battleStartedAt) / 1000;

      const elapsed = clamp(audioElapsed, 0, selectedMusic.duration);

      setBattleElapsed(elapsed);

      if (battleMode === "ai") {
        const aiPower =
          aiDifficulty === "EASY" ? 68 : aiDifficulty === "NORMAL" ? 86 : 105;

     const nextAiScore = Math.max(
  0,
  Math.floor(elapsed * aiPower + Math.sin(elapsed * 1.7) * 90)
);

rivalScoreRef.current = nextAiScore;
setRivalScore(nextAiScore);
      }

      setNotes((prev) =>
        prev.map((n) => {
          if (n.hit || n.missed) return n;

          if (elapsed > n.time + GOOD_WINDOW) {
            setMissCount((v) => {
  const next = v + 1;
  missCountRef.current = next;
  return next;
});
setJudge("MISS");
setCombo(0);
            return { ...n, missed: true };
          }

          return n;
        })
      );

      if (elapsed >= selectedMusic.duration) {
        finishBattle({
          notifyServer: true,
        });
        return;
      }

      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);

    return () => cancelAnimationFrame(raf);
  }, [screen, battleStartedAt, battleMode, aiDifficulty, selectedMusic]);

  function getNoteStyle(note: Note) {
    const progress = 1 - (note.time - battleElapsed) / NOTE_FALL_TIME;
    const laneProgress = clamp(progress, 0, 1);

    const near = [15, 38.5, 61.5, 85];
    const far = [40, 47, 53, 60];

    const left = far[note.lane] + (near[note.lane] - far[note.lane]) * laneProgress;
    const top = NOTE_START_TOP + progress * (NOTE_JUDGE_TOP - NOTE_START_TOP);
    const scale = 0.38 + laneProgress * 0.92;

    return {
      left: `${left}%`,
      top: `${top}%`,
      transform: `translate(-50%, -50%) scale(${scale})`,
      opacity: progress < 0 || progress > 1.38 ? 0 : 1,
    };
  }

  function followFriend(friendId: string) {
    let shouldIncreaseFollowing = false;

    setFriends((prev) =>
      prev.map((f) => {
        if (f.id !== friendId) return f;
        if (!f.mutual) shouldIncreaseFollowing = true;
        return { ...f, mutual: true };
      })
    );

    if (shouldIncreaseFollowing) {
      setProfile((prev) => ({
        ...prev,
        following: prev.following + 1,
      }));
    }
  }

  function sendGift(friendId: string) {
    setFriends((prev) =>
      prev.map((f) => (f.id === friendId ? { ...f, giftedToday: true } : f))
    );
  }

  function claimMail(mailId: string) {
    setMails((prev) =>
      prev.map((m) => {
        if (m.id !== mailId || m.claimed) return m;
        if (m.type === "gift") setGems((g) => g + 5);
        return { ...m, claimed: true };
      })
    );
  }

  return (
    <main className="app" style={{ ["--phone-ratio" as string]: PHONE_RATIO }}>
      <section className="phone">
        <audio ref={audioRef} preload="auto" playsInline />

        {screen === "home" && (
          <div className="screen homeScreen">
            <button className="profileMini" onClick={() => setProfileOpen(true)}>
              <div className={`avatarFrame ${profile.border}`}>
                <AvatarView value={profile.avatar} />
              </div>
              <div className="profileMiniText">
                <strong>{profile.nickname}</strong>
                <span>Lv.{profile.level}</span>
                <div className="expTrack">
                  <div style={{ width: `${expPercent}%` }} />
                </div>
              </div>
            </button>

            <div className="currencyBar">
              <span>💎 {gems}</span>
              <span>🪙 {coins}</span>
            </div>

            <div className="sideMenu">
              <button onClick={() => setMenuOpen(true)}>☰</button>
              <button
                className={missionNotice ? "hasNotice" : ""}
                onClick={() => setMissionOpen(true)}
              >
                🎯
              </button>
              <button
                className={friendNotice ? "hasNotice" : ""}
                onClick={() => setFriendOpen(true)}
              >
                👥
              </button>
              <button
                className={mailNotice ? "hasNotice" : ""}
                onClick={() => setMailOpen(true)}
              >
                ✉️
              </button>
            </div>

            <div className="turntableWrap">
              <div
                ref={turntableRef}
                className={`turntable pressed-${pressedSector ?? "none"}`}
                style={{ transform: `rotate(${turntableAngle}deg)` }}
                onPointerDown={handleTurntableDown}
                onPointerMove={handleTurntableMove}
                onPointerUp={handleTurntableUp}
                onPointerCancel={handleTurntableUp}
              >
                <div className="turntableLabel battleLabel">배틀</div>
                <div className="turntableLabel eventLabel">이벤트</div>
                <div className="turntableLabel auditionLabel">오디션</div>
                <div className="turntableCore">BR</div>
              </div>
            </div>

            <nav className="bottomNav">
              <button>댄서</button>
              <button>인벤토리</button>
              <button className="active">홈</button>
              <button>상점</button>
              <button>스케줄</button>
            </nav>
          </div>
        )}

        {screen === "tutorial" && (
          <div className="screen tutorialScreen">
            <button className="backButton" onClick={() => setScreen("home")}>
              ←
            </button>
            <p className="eyebrow">TUTORIAL</p>
            <h1>{tutorialPages[tutorialPage].title}</h1>
            <div className="tutorialCard">
              <strong>
                {tutorialPage + 1} / {tutorialPages.length}
              </strong>
              <p>{tutorialPages[tutorialPage].desc}</p>
            </div>
            <div className="tutorialDots">
              {tutorialPages.map((_, i) => (
                <span key={i} className={i === tutorialPage ? "active" : ""} />
              ))}
            </div>
            <button
              className="primaryButton bottomAction"
              onClick={() => {
                if (tutorialPage >= tutorialPages.length - 1) finishTutorial();
                else setTutorialPage((v) => v + 1);
              }}
            >
              {tutorialPage >= tutorialPages.length - 1 ? "배틀 시작하기" : "다음"}
            </button>
          </div>
        )}

        {screen === "battleMenu" && (
          <div className="screen battleMenuScreen">
            <button className="backButton" onClick={() => setScreen("home")}>
              ←
            </button>
            <p className="eyebrow">BATTLE</p>
            <h1>배틀 선택</h1>

            <button
              className="battleModeCard"
              onClick={() => {
                setBattleMode("quick");
                setMatchingText("상대를 찾는 중...");
                setScreen("quickMatching");

                socket.emit("quickMatch", {
                  nickname: profile.nickname,
                  avatar: profile.avatar,
                  border: profile.border,
                  level: profile.level,
                });
              }}
            >
              <strong>빠른 대전</strong>
              <span>랜덤 상대를 찾아서 배틀</span>
            </button>

            <button
              className="battleModeCard"
              onClick={() => {
                setBattleMode("room");
                setScreen("roomCodeInput");
              }}
            >
              <strong>배틀 룸</strong>
              <span>방 코드를 입력하여 친구와 함께 배틀</span>
            </button>

            <button
              className="battleModeCard"
              onClick={() => {
                setBattleMode("ai");
                setScreen("aiLobby");
              }}
            >
              <strong>AI 배틀</strong>
              <span>인공지능과 연습 배틀</span>
            </button>
          </div>
        )}

        {screen === "quickMatching" && (
          <div className="screen quickMatchingScreen">
            <button
              className="backButton"
              onClick={() => {
                socket.emit("cancelQuickMatch");
                setScreen("battleMenu");
              }}
            >
              ←
            </button>

            <p className="eyebrow">QUICK MATCH</p>
            <h1>빠른 대전</h1>

            <div className="matchingCard">
              <div className="matchingSpinner" />
              <strong>{matchingText}</strong>
              <span>다른 플레이어가 빠른 대전에 들어오면 자동으로 매칭돼.</span>
            </div>
          </div>
        )}

        {screen === "roomCodeInput" && (
          <div className="screen roomCodeInputScreen">
            <button className="backButton" onClick={() => setScreen("battleMenu")}>
              ←
            </button>

            <p className="eyebrow">BATTLE ROOM</p>
            <h1>방 코드 입력</h1>
            <p className="subText">
              친구와 같은 방 코드를 입력하면 같은 배틀 룸으로 입장해.
            </p>

            <div className="bigRoomCodeBox">
              <label>ROOM CODE</label>
              <input
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                maxLength={8}
                placeholder="BEAT"
              />
            </div>

            <div className="roomGuideBox">
              <p>방을 먼저 만든 사람이 방장이 돼.</p>
              <p>방장은 로비에서 음악을 선택하거나 랜덤으로 고를 수 있어.</p>
              <p>양쪽 모두 캐릭터 선택 후 준비하면 배틀이 시작돼.</p>
            </div>

            <button
              className="primaryButton bottomAction"
              onClick={() => {
                setBattleMode("room");
                socket.emit("createOrJoinRoom", {
                  roomCode,
                  nickname: profile.nickname,
                  avatar: profile.avatar,
                  border: profile.border,
                  level: profile.level,
                });
              }}
            >
              입장하기
            </button>
          </div>
        )}

        {screen === "quickLobby" && (
          <LobbyScreen
            title="빠른 대전"
            subtitle="상대가 매칭됐어. 캐릭터를 선택하고 준비해."
            profile={profile}
            opponentName={onlineOpponentProfile.nickname}
            opponentAvatar={onlineOpponentProfile.avatar}
            opponentBorder={onlineOpponentProfile.border}
            opponentLevel={onlineOpponentProfile.level}
            selectedMusic={selectedMusic}
            setSelectedMusic={setSelectedMusic}
            musicOpen={musicOpen}
            setMusicOpen={setMusicOpen}
            selectedCharacters={selectedCharacters}
            toggleCharacter={(id) => toggleCharacter(id, "player")}
            onBack={() => {
              socket.emit("leaveRoom");
              setScreen("battleMenu");
            }}
            onStart={() => {
              if (!onlineRoomCode) return;

              socket.emit("selectCharacters", {
                roomCode: onlineRoomCode,
                characters: selectedCharacters,
              });

              socket.emit("playerReady", {
                roomCode: onlineRoomCode,
                ready: true,
              });
            }}
            startLabel="준비 완료"
          />
        )}

        {screen === "roomLobby" && (
          <LobbyScreen
            title="배틀 룸"
            subtitle="방장이 음악을 고르고 양쪽이 준비하면 시작돼."
            profile={profile}
            opponentName={onlineOpponentProfile.nickname}
            opponentAvatar={onlineOpponentProfile.avatar}
            opponentBorder={onlineOpponentProfile.border}
            opponentLevel={onlineOpponentProfile.level}
            roomCode={roomCode}
            setRoomCode={setRoomCode}
            selectedMusic={selectedMusic}
            setSelectedMusic={setSelectedMusic}
            musicOpen={musicOpen}
            setMusicOpen={setMusicOpen}
            selectedCharacters={selectedCharacters}
            toggleCharacter={(id) => toggleCharacter(id, "player")}
            onBack={() => {
              socket.emit("leaveRoom");
              setScreen("battleMenu");
            }}
            onStart={() => {
              if (!onlineRoomCode) return;

              socket.emit("selectCharacters", {
                roomCode: onlineRoomCode,
                characters: selectedCharacters,
              });

              socket.emit("playerReady", {
                roomCode: onlineRoomCode,
                ready: true,
              });
            }}
            startLabel="준비 완료"
          />
        )}

        {screen === "aiLobby" && (
          <div className="screen lobbyScreen">
            <button className="backButton" onClick={() => setScreen("battleMenu")}>
              ←
            </button>
            <p className="eyebrow">AI BATTLE</p>
            <h1>AI 배틀 설정</h1>

            <div className="profileVersus compact">
              <ProfileCard profile={profile} />
              <div className="vsMark">VS</div>
              <button
                className="aiProfileCard"
                onClick={() =>
                  setAiDifficulty((prev) =>
                    prev === "EASY" ? "NORMAL" : prev === "NORMAL" ? "HARD" : "EASY"
                  )
                }
              >
                <div className="avatarFrame purple">
                  <div className="avatar">AI</div>
                </div>
                <strong>Beat AI</strong>
                <span>{aiDifficulty}</span>
              </button>
            </div>

            <MusicSelector
              selectedMusic={selectedMusic}
              setSelectedMusic={setSelectedMusic}
              musicOpen={musicOpen}
              setMusicOpen={setMusicOpen}
            />

            <div className="aiCharacterScrollArea">
              <CharacterSelector
                title="내 캐릭터"
                selectedCharacters={selectedCharacters}
                toggleCharacter={(id) => toggleCharacter(id, "player")}
              />

              <CharacterSelector
                title="AI 캐릭터"
                selectedCharacters={aiCharacters}
                toggleCharacter={(id) => toggleCharacter(id, "ai")}
              />
            </div>

            <button
              className="primaryButton aiFloatingStart"
              disabled={!selectedCharacters.length || !aiCharacters.length}
              onClick={() => startBattle("ai")}
            >
              AI 배틀 시작
            </button>
          </div>
        )}

        {screen === "battle" && (
          <div className="screen battleScreen">
            <div className="battleHeader">
              <div className="battleProfile">
                <div className={`avatarFrame small ${profile.border}`}>
                  <AvatarView value={profile.avatar} />
                </div>
                <span>{profile.nickname}</span>
              </div>

          <div className="battleScore">
  <strong>
    {myScore} : {rivalScore}
  </strong>
  <span>
    {Math.max(0, selectedMusic.duration - battleElapsed).toFixed(1)}s
  </span>
</div>

              <div className="battleProfile right">
                <span>
                  {battleMode === "ai" ? "Beat AI" : onlineOpponentProfile.nickname}
                </span>
                <div
                  className={`avatarFrame small ${
                    battleMode === "ai" ? "purple" : onlineOpponentProfile.border
                  }`}
                >
                  {battleMode === "ai" ? (
                    <div className="avatar">AI</div>
                  ) : (
                    <AvatarView value={onlineOpponentProfile.avatar} />
                  )}
                </div>
              </div>
            </div>

            <div className="battleMusicName">{selectedMusic.title}</div>

            <button className="surrenderButton" onClick={surrenderBattle}>
              항복
            </button>

            <div className="perspectiveStage">
              <div className="feverRail top">
                <div style={{ width: `${fever}%` }} />
              </div>

              <div className="lanePerspective">
                <div className="laneOuter left" />
                <div className="laneOuter right" />

                <div className="laneDivider l1" />
                <div className="laneDivider l2" />
                <div className="laneDivider l3" />
                <div className="judgeBar" />

                {notes
                  .filter(
                    (note) =>
                      !note.hit &&
                      !note.missed &&
                      battleElapsed >= note.time - NOTE_FALL_TIME &&
                      battleElapsed <= note.time + NOTE_EXIT_AFTER
                  )
                  .map((note) => (
                    <div
  key={note.id}
  className={`battleNote ${note.type === "melody" ? "melodyNote" : "beatNote"}`}
  style={getNoteStyle(note)}
/>
                  ))}

                {[0, 1, 2, 3].map((lane) => (
                  <button
                    key={lane}
                    className={`hitZone lane${lane} ${
                      pressedLane === lane ? "pressed" : ""
                    }`}
                    onPointerDown={() => hitLane(lane)}
                  />
                ))}
              </div>

              {attackSuccess && <div className="attackSuccess">공격 성공!</div>}

              <div className="judgeFeedback">
                <strong>{judge}</strong>
                <span>{combo} COMBO</span>
                <em>x{multiplier.toFixed(1)}</em>
              </div>

              {fever >= 100 && (
                <div className="skillDrawer">
                  {selectedCharacterObjects.map((character) => (
                    <button
                      key={character.id}
                      className="skillButton"
                      style={{ borderColor: character.color }}
                      onClick={() => useSkill(character)}
                    >
                      <span>{character.emoji}</span>
                      <strong>{character.active}</strong>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {screen === "result" && result && (
          <div className="screen resultScreen">
            <p className="eyebrow">BATTLE RESULT</p>
            <h1>{result.victory}</h1>

            {result.reason === "surrender" && (
              <p className="resultReason">항복으로 패배했습니다.</p>
            )}

            {result.reason === "opponentSurrender" && (
              <p className="resultReason">상대가 항복했습니다.</p>
            )}

            <div className="resultScoreBox">
              <div>
                <small>MY SCORE</small>
                <strong>{result.myScore}</strong>
              </div>
              <div>
                <small>RIVAL</small>
                <strong>{result.rivalScore}</strong>
              </div>
            </div>

            <div className="judgeResultGrid">
              <div>
                <span>PERFECT</span>
                <strong>{result.perfect}</strong>
              </div>
              <div>
                <span>GREAT</span>
                <strong>{result.great}</strong>
              </div>
              <div>
                <span>GOOD</span>
                <strong>{result.good}</strong>
              </div>
              <div>
                <span>MISS</span>
                <strong>{result.miss}</strong>
              </div>
            </div>

            <div className="rewardBox">
              <div>
                <span>MAX COMBO</span>
                <strong>{result.maxCombo}</strong>
              </div>
              <div>
                <span>EXP</span>
                <strong>+{result.exp}</strong>
              </div>
              <div>
                <span>COIN</span>
                <strong>+{result.coins}</strong>
              </div>
            </div>

            <div className="opponentFollowBox">
              <div className={`avatarFrame ${onlineOpponentProfile.border}`}>
                <AvatarView value={onlineOpponentProfile.avatar} />
              </div>
              <div>
                <strong>{onlineOpponentProfile.nickname}</strong>
                <span>상대 프로필 보기</span>
              </div>
              <button>팔로우</button>
            </div>

            <button className="primaryButton" onClick={() => setScreen("battleMenu")}>
              다시 배틀
            </button>
            <button className="ghostButton" onClick={() => setScreen("home")}>
              홈으로
            </button>
          </div>
        )}

        {screen === "event" && (
          <Placeholder
            title="이벤트"
            desc="이벤트 모드는 나중에 추가할 예정이야."
            onBack={() => setScreen("home")}
          />
        )}

        {screen === "audition" && (
          <Placeholder
            title="오디션"
            desc="오디션 / 캐릭터 뽑기 모드는 나중에 추가할 예정이야."
            onBack={() => setScreen("home")}
          />
        )}

        {profileOpen && (
          <Modal onClose={() => setProfileOpen(false)}>
            <div className="profileBigArea">
              <div className={`avatarFrame big ${profile.border}`}>
                <AvatarView value={profile.avatar} />
              </div>
              <button
                className="editProfileButton"
                onClick={() => setProfileEditOpen(true)}
              >
                ✎
              </button>
            </div>

            <h2>{profile.nickname}</h2>
            <p>
              승률 {winRate}% · {profile.wins}승 {profile.losses}패
            </p>

            <div className="nicknameEditBox">
              <label>닉네임 변경</label>
              <div>
                <input
                  value={nicknameDraft}
                  maxLength={16}
                  onChange={(e) => setNicknameDraft(e.target.value)}
                  placeholder="닉네임 입력"
                />
                <button disabled={nicknameSaving} onClick={saveNickname}>
                  {nicknameSaving ? "저장중" : "저장"}
                </button>
              </div>
              <small>로그인 여부와 상관없이 변경할 수 있어.</small>
            </div>

            {profileSaving && <p className="emptyText">계정 정보 저장 중...</p>}

            <div className="profileStats">
              <div>
                <strong>{profile.followers}</strong>
                <span>팔로워</span>
              </div>
              <div>
                <strong>{profile.following}</strong>
                <span>팔로우</span>
              </div>
            </div>

           {authLoading ? (
  <button className="profileLoginButton" disabled>
    로그인 확인 중...
  </button>
) : session ? (
  <button className="profileLoginButton" onClick={signOut}>
    로그아웃
  </button>
) : (
  <div className="loginButtonGroup">
    <button className="profileLoginButton" onClick={signInWithGoogle}>
      Google 계정으로 로그인
    </button>

    <button className="kakaoLoginButton" onClick={signInWithKakao}>
      카카오 계정으로 로그인
    </button>
  </div>
)}
            <div className="recordPreview">
              <h3>최근 전적</h3>
              <div>
                {profile.wins + profile.losses > 0
                  ? `${profile.wins}승 ${profile.losses}패`
                  : "아직 전적이 없습니다."}
              </div>
            </div>
          </Modal>
        )}

        {profileEditOpen && (
          <Modal onClose={() => setProfileEditOpen(false)}>
            <h2>프로필 편집</h2>

            <div className="tabRow">
              <button
                className={profileEditTab === "avatar" ? "active" : ""}
                onClick={() => setProfileEditTab("avatar")}
              >
                기본
              </button>

              <button
                className={profileEditTab === "album" ? "active" : ""}
                onClick={() => setProfileEditTab("album")}
              >
                앨범
              </button>

              <button
                className={profileEditTab === "border" ? "active" : ""}
                onClick={() => setProfileEditTab("border")}
              >
                테두리
              </button>
            </div>

            {profileEditTab === "avatar" && (
              <div className="avatarPickGrid">
                {["G", "D", "R", "M", "J", "L", "K"].map((avatar) => (
                  <button
                    key={avatar}
                    onClick={() => {
                      setProfile((p) => ({
                        ...p,
                        avatar,
                      }));

                      if (session) {
                        saveProfilePatch(session.user.id, {
                          avatar_text: avatar,
                          avatar_url: null,
                        });
                      }
                    }}
                  >
                    {avatar}
                  </button>
                ))}
              </div>
            )}

            {profileEditTab === "album" && (
              <div className="albumUploadBox">
                <div className={`avatarFrame big ${profile.border}`}>
                  <AvatarView value={profile.avatar} />
                </div>

                <label className="albumUploadButton">
                  {avatarUploading ? "업로드 중..." : "앨범에서 사진 선택"}
                  <input
                    type="file"
                    accept="image/*"
                    disabled={avatarUploading}
                    onChange={changeProfileImageFromAlbum}
                  />
                </label>

                <p>
                  로그인 상태면 계정에 저장되고, 로그인 전에는 현재 화면에서만
                  적용돼.
                </p>
              </div>
            )}

            {profileEditTab === "border" && (
              <div className="avatarPickGrid">
                {["neon", "gold", "purple", "plain"].map((border) => (
                  <button
                    key={border}
                    onClick={() => {
                      const nextBorder = border as Profile["border"];

                      setProfile((p) => ({
                        ...p,
                        border: nextBorder,
                      }));

                      if (session) {
                        saveProfilePatch(session.user.id, {
                          border: nextBorder,
                        });
                      }
                    }}
                  >
                    {border}
                  </button>
                ))}
              </div>
            )}
          </Modal>
        )}

        {menuOpen && (
          <Modal onClose={() => setMenuOpen(false)} className="menuModal">
            <h2>메뉴</h2>
            <div className="settingRow">
              <span>사운드</span>
              <input
                type="range"
                min="0"
                max="100"
                value={sound}
                onChange={(e) => setSound(Number(e.target.value))}
              />
            </div>
            <div className="settingRow">
              <span>진동</span>
              <button
                className={vibration ? "switch on" : "switch"}
                onClick={() => setVibration((v) => !v)}
              >
                {vibration ? "ON" : "OFF"}
              </button>
            </div>
            <button className="menuListButton" onClick={() => setScreen("tutorial")}>
              튜토리얼 다시 보기
            </button>
            <button className="menuListButton">고객 지원</button>
            {session ? (
  <button className="menuListButton danger" onClick={signOut}>
    로그아웃
  </button>
) : (
  <>
    <button className="menuListButton" onClick={signInWithGoogle}>
      Google 로그인
    </button>

    <button className="menuListButton kakaoMenuButton" onClick={signInWithKakao}>
      카카오 로그인
    </button>
  </>
)}
          </Modal>
        )}

        {missionOpen && (
          <Modal onClose={() => setMissionOpen(false)}>
            <h2>일일 미션</h2>
            <div className="missionList">
              {missions.map((m) => (
                <div key={m.id} className="missionItem">
                  <div>
                    <strong>{m.title}</strong>
                    <span>{m.desc}</span>
                    <small>{m.reward}</small>
                  </div>
                  <button
                    disabled={!m.done || m.claimed}
                    onClick={() => claimMission(m.id)}
                  >
                    {m.claimed ? "완료" : m.done ? "받기" : "진행중"}
                  </button>
                </div>
              ))}
            </div>
          </Modal>
        )}

        {friendOpen && (
          <Modal onClose={() => setFriendOpen(false)}>
            <h2>친구</h2>
            <div className="friendSearch">
              <input
                value={friendSearch}
                onChange={(e) => setFriendSearch(e.target.value)}
                placeholder="친구 닉네임 검색"
              />
              <button
                onClick={() => {
                  const nextName = friendSearch.trim();
                  if (!nextName) return;

                  setFriends((prev) => [
                    ...prev,
                    {
                      id: Date.now().toString(),
                      nickname: nextName,
                      avatar: nextName[0].toUpperCase(),
                      mutual: false,
                      giftedToday: false,
                    },
                  ]);

                  setProfile((prev) => ({
                    ...prev,
                    following: prev.following + 1,
                  }));

                  setFriendSearch("");
                }}
              >
                팔로우
              </button>
            </div>

            <h3>맞팔 친구</h3>
            <div className="friendList">
              {friends.filter((f) => f.mutual).length === 0 && (
                <p className="emptyText">아직 맞팔 친구가 없어.</p>
              )}

              {friends
                .filter((f) => f.mutual)
                .map((f) => (
                  <div key={f.id} className="friendItem">
                    <div className="avatarFrame small purple">
                      <AvatarView value={f.avatar} />
                    </div>
                    <strong>{f.nickname}</strong>
                    <button disabled={f.giftedToday} onClick={() => sendGift(f.id)}>
                      {f.giftedToday ? "완료" : "젬 선물"}
                    </button>
                  </div>
                ))}
            </div>

            <h3>내가 팔로우한 사람</h3>
            <div className="friendList">
              {friends
                .filter((f) => !f.mutual)
                .map((f) => (
                  <div key={f.id} className="friendItem">
                    <div className="avatarFrame small">
                      <AvatarView value={f.avatar} />
                    </div>
                    <strong>{f.nickname}</strong>
                    <button onClick={() => followFriend(f.id)}>맞팔 처리</button>
                  </div>
                ))}
            </div>
          </Modal>
        )}

        {mailOpen && (
          <Modal onClose={() => setMailOpen(false)}>
            <h2>우편함</h2>
            <div className="mailList">
              {mails.length === 0 && <p className="emptyText">우편이 없어.</p>}

              {mails.map((m) => (
                <div key={m.id} className="mailItem">
                  <div className="avatarFrame small purple">
                    <AvatarView value={m.avatar} />
                  </div>
                  <div>
                    <strong>{m.from}</strong>
                    <span>{m.text}</span>
                  </div>
                  <button disabled={m.claimed} onClick={() => claimMail(m.id)}>
                    {m.claimed ? "확인" : m.type === "gift" ? "받기" : "보기"}
                  </button>
                </div>
              ))}
            </div>
          </Modal>
        )}
      </section>
    </main>
  );
}

function AvatarView({ value }: { value: string }) {
  if (
    value.startsWith("http") ||
    value.startsWith("data:image/") ||
    value.startsWith("/")
  ) {
    return <img className="avatarImage" src={value} alt="profile" />;
  }

  return <div className="avatar">{value}</div>;
}

function Modal({
  children,
  onClose,
  className = "",
}: {
  children: ReactNode;
  onClose: () => void;
  className?: string;
}) {
  return (
    <div className="modalBackdrop" onClick={onClose}>
      <div
        className={`profileModal ${className}`}
        onClick={(e) => e.stopPropagation()}
      >
        <button className="modalClose" onClick={onClose}>
          ×
        </button>
        {children}
      </div>
    </div>
  );
}

function ProfileCard({ profile }: { profile: Profile }) {
  return (
    <div className="lobbyProfileCard">
      <div className={`avatarFrame ${profile.border}`}>
        <AvatarView value={profile.avatar} />
      </div>
      <strong>{profile.nickname}</strong>
      <span>Lv.{profile.level}</span>
    </div>
  );
}

function MusicSelector({
  selectedMusic,
  setSelectedMusic,
  musicOpen,
  setMusicOpen,
}: {
  selectedMusic: MusicTrack;
  setSelectedMusic: (track: MusicTrack) => void;
  musicOpen: boolean;
  setMusicOpen: (value: boolean) => void;
}) {
  return (
    <div className="musicBox">
      <div className="sectionTitle">
        <button className="musicToggle" onClick={() => setMusicOpen(!musicOpen)}>
          <strong>{selectedMusic.title}</strong>
          <span>
            BPM {Math.round(selectedMusic.bpm)} · {selectedMusic.difficulty}
          </span>
        </button>
        <button onClick={() => setSelectedMusic(getRandomMusic())}>랜덤</button>
      </div>

      {musicOpen && (
        <div className="musicList">
          {musicTracks.map((track) => (
            <button
              key={track.id}
              className={selectedMusic.id === track.id ? "active" : ""}
              onClick={() => {
                setSelectedMusic(track);
                setMusicOpen(false);
              }}
            >
              <strong>{track.title}</strong>
              <span>
                BPM {Math.round(track.bpm)} · {track.difficulty}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function CharacterSelector({
  title,
  selectedCharacters,
  toggleCharacter,
}: {
  title: string;
  selectedCharacters: string[];
  toggleCharacter: (id: string) => void;
}) {
  const picked = selectedCharacters
    .map((id) => characters.find((c) => c.id === id))
    .filter(Boolean) as Character[];

  return (
    <div className="characterSelectBox">
      <div className="sectionTitle">
        <strong>{title}</strong>
        <span>{selectedCharacters.length}/2 선택</span>
      </div>

      <div className="selectedCharacterPreview horizontal">
        {[0, 1].map((slot) => {
          const c = picked[slot];

          return (
            <div key={slot} className="selectedHero">
              {c ? (
                <>
                  <div className="heroFace" style={{ background: c.color }}>
                    {c.emoji}
                  </div>
                  <div>
                    <strong>{c.name}</strong>
                    <span>{c.passive}</span>
                    <small>{c.active}</small>
                  </div>
                </>
              ) : (
                <p>선택 슬롯</p>
              )}
            </div>
          );
        })}
      </div>

      <div className="characterFaceGrid">
        {characters.map((c) => (
          <button
            key={c.id}
            className={selectedCharacters.includes(c.id) ? "selected" : ""}
            onClick={() => toggleCharacter(c.id)}
          >
            <span style={{ background: c.color }}>{c.emoji}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function LobbyScreen({
  title,
  subtitle,
  profile,
  opponentName,
  opponentAvatar,
  opponentBorder = "purple",
  opponentLevel = 1,
  selectedMusic,
  setSelectedMusic,
  musicOpen,
  setMusicOpen,
  selectedCharacters,
  toggleCharacter,
  roomCode,
  setRoomCode,
  startLabel,
  onBack,
  onStart,
}: {
  title: string;
  subtitle: string;
  profile: Profile;
  opponentName: string;
  opponentAvatar: string;
  opponentBorder?: Profile["border"];
  opponentLevel?: number;
  selectedMusic: MusicTrack;
  setSelectedMusic: (track: MusicTrack) => void;
  musicOpen: boolean;
  setMusicOpen: (value: boolean) => void;
  selectedCharacters: string[];
  toggleCharacter: (id: string) => void;
  roomCode?: string;
  setRoomCode?: (code: string) => void;
  startLabel: string;
  onBack: () => void;
  onStart: () => void;
}) {
  return (
    <div className="screen lobbyScreen">
      <button className="backButton" onClick={onBack}>
        ←
      </button>
      <p className="eyebrow">BATTLE READY</p>
      <h1>{title}</h1>
      <p className="subText">{subtitle}</p>

      <div className="profileVersus compact">
        <ProfileCard profile={profile} />
        <div className="vsMark">VS</div>
        <div className="lobbyProfileCard">
          <div className={`avatarFrame ${opponentBorder}`}>
            <AvatarView value={opponentAvatar} />
          </div>
          <strong>{opponentName}</strong>
          <span>Lv.{opponentLevel}</span>
        </div>
      </div>

      {roomCode !== undefined && setRoomCode && (
        <div className="roomCodeBox">
          <span>방 코드</span>
          <input
            value={roomCode}
            onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
            maxLength={8}
          />
        </div>
      )}

      <MusicSelector
        selectedMusic={selectedMusic}
        setSelectedMusic={setSelectedMusic}
        musicOpen={musicOpen}
        setMusicOpen={setMusicOpen}
      />

      <CharacterSelector
        title="캐릭터 선택"
        selectedCharacters={selectedCharacters}
        toggleCharacter={toggleCharacter}
      />

      <button
        className="primaryButton bottomAction"
        disabled={!selectedCharacters.length}
        onClick={onStart}
      >
        {startLabel}
      </button>
    </div>
  );
}

function Placeholder({
  title,
  desc,
  onBack,
}: {
  title: string;
  desc: string;
  onBack: () => void;
}) {
  return (
    <div className="screen placeholderScreen">
      <button className="backButton" onClick={onBack}>
        ←
      </button>
      <h1>{title}</h1>
      <p>{desc}</p>
    </div>
  );
}
