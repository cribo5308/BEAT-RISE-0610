import { io } from "socket.io-client";

export type OnlineSide = "A" | "B";

export type OnlineRoomPhase = "waiting" | "lobby" | "battle" | "result";

export type ServerRoomPlayer = {
  socketId: string;
  side: OnlineSide;
  ready: boolean;
  characters: string[];
  nickname: string;
  avatar: string;
};

export type ServerRoomState = {
  roomCode: string;
  phase: OnlineRoomPhase;
  players: ServerRoomPlayer[];
  hostSide: OnlineSide;
  musicId: string;
  scores: {
    A: number;
    B: number;
  };
  startedAt: number | null;
  noteSeed: number;
};

function getSocketServerUrl() {
  const envUrl = import.meta.env.VITE_SOCKET_SERVER_URL;

  if (envUrl) return envUrl;

  const { protocol, hostname } = window.location;

  // StackBlitz WebContainer 테스트용
  if (hostname.includes("webcontainer-api.io")) {
    const serverHostname = hostname.replace(/-(\d+)(--|-)/, "-3001$2");
    return `${protocol}//${serverHostname}`;
  }

  return "http://localhost:3001";
}

export const socket = io(getSocketServerUrl(), {
  autoConnect: true,
  transports: ["websocket", "polling"],
});
