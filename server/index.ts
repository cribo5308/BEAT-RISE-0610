import express from "express";
import cors from "cors";
import { createServer } from "http";
import { Server } from "socket.io";

type Side = "A" | "B";
type ProfileBorder = "neon" | "gold" | "purple" | "plain";

type RoomPhase = "waiting" | "lobby" | "battle" | "result";

type PlayerProfilePayload = {
  nickname?: string;
  avatar?: string;
  border?: ProfileBorder;
  level?: number;
};

type JoinPayload = PlayerProfilePayload & {
  roomCode?: string;
};

type QuickMatchPayload = PlayerProfilePayload;

type RoomPlayer = {
  socketId: string;
  side: Side;
  ready: boolean;
  characters: string[];
  nickname: string;
  avatar: string;
  border: ProfileBorder;
  level: number;
};

type RoomState = {
  roomCode: string;
  phase: RoomPhase;
  players: RoomPlayer[];
  hostSide: Side;
  musicId: string;
  scores: {
    A: number;
    B: number;
  };
  startedAt: number | null;
  noteSeed: number;
};

const PORT = Number(process.env.PORT || 3001);

const app = express();

app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST"],
  })
);

app.get("/", (_req, res) => {
  res.send("Beat Rise Socket.IO server is running.");
});

const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
  transports: ["websocket", "polling"],
});

const rooms = new Map<string, RoomState>();

const quickQueue: {
  socketId: string;
  profile: PlayerProfilePayload;
}[] = [];

function normalizeRoomCode(roomCode: string) {
  return (roomCode || "BEAT").trim().toUpperCase().slice(0, 8);
}

function createRandomRoomCode() {
  return `Q${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}

function normalizeBorder(border?: string): ProfileBorder {
  if (border === "gold" || border === "purple" || border === "plain") {
    return border;
  }

  return "neon";
}

function normalizeNickname(nickname?: string) {
  const trimmed = (nickname || "").trim();

  if (!trimmed) return "Guest";

  return trimmed.slice(0, 20);
}

function normalizeAvatar(avatar?: string, fallback = "G") {
  const trimmed = (avatar || "").trim();

  if (!trimmed) return fallback;

  return trimmed.slice(0, 3);
}

function normalizeLevel(level?: number) {
  const nextLevel = Number(level);

  if (!Number.isFinite(nextLevel) || nextLevel < 1) return 1;

  return Math.floor(nextLevel);
}

function createRoom(roomCode: string): RoomState {
  return {
    roomCode,
    phase: "waiting",
    players: [],
    hostSide: "A",
    musicId: "street",
    scores: {
      A: 0,
      B: 0,
    },
    startedAt: null,
    noteSeed: Math.floor(Math.random() * 1000000),
  };
}

function getPublicRoomState(room: RoomState) {
  return {
    roomCode: room.roomCode,
    phase: room.phase,
    players: room.players,
    hostSide: room.hostSide,
    musicId: room.musicId,
    scores: room.scores,
    startedAt: room.startedAt,
    noteSeed: room.noteSeed,
  };
}

function emitRoomState(roomCode: string) {
  const room = rooms.get(roomCode);
  if (!room) return;

  io.to(roomCode).emit("roomState", getPublicRoomState(room));
}

function removeFromQuickQueue(socketId: string) {
  const index = quickQueue.findIndex((item) => item.socketId === socketId);

  if (index >= 0) {
    quickQueue.splice(index, 1);
  }
}

function removePlayer(socketId: string) {
  removeFromQuickQueue(socketId);

  for (const [roomCode, room] of rooms.entries()) {
    const before = room.players.length;

    room.players = room.players.filter((player) => player.socketId !== socketId);

    if (room.players.length !== before) {
      if (room.players.length === 0) {
        rooms.delete(roomCode);
        return;
      }

      room.players = room.players.map((player, index) => ({
        ...player,
        side: index === 0 ? "A" : "B",
        ready: false,
      }));

      room.hostSide = "A";
      room.phase = "waiting";
      room.scores = {
        A: 0,
        B: 0,
      };
      room.startedAt = null;

      emitRoomState(roomCode);
      return;
    }
  }
}

function addPlayerToRoom(
  room: RoomState,
  socketId: string,
  payload?: PlayerProfilePayload
) {
  const alreadyInRoom = room.players.find((player) => player.socketId === socketId);

  if (alreadyInRoom) {
    return alreadyInRoom;
  }

  if (room.players.length >= 2) {
    return null;
  }

  const side: Side = room.players.length === 0 ? "A" : "B";

  const player: RoomPlayer = {
    socketId,
    side,
    ready: false,
    characters: [],
    nickname: normalizeNickname(payload?.nickname),
    avatar: normalizeAvatar(payload?.avatar, side),
    border: normalizeBorder(payload?.border),
    level: normalizeLevel(payload?.level),
  };

  room.players.push(player);
  room.phase = room.players.length >= 2 ? "lobby" : "waiting";

  return player;
}

io.on("connection", (socket) => {
  console.log("connected:", socket.id);

  socket.on("pingServer", () => {
    socket.emit("pongServer", {
      socketId: socket.id,
      time: Date.now(),
    });
  });

  socket.on("createOrJoinRoom", (payload: JoinPayload) => {
    removeFromQuickQueue(socket.id);

    const roomCode = normalizeRoomCode(payload.roomCode || "BEAT");

    let room = rooms.get(roomCode);

    if (!room) {
      room = createRoom(roomCode);
      rooms.set(roomCode, room);
    }

    const player = addPlayerToRoom(room, socket.id, {
      nickname: payload.nickname,
      avatar: payload.avatar,
      border: payload.border,
      level: payload.level,
    });

    if (!player) {
      socket.emit("roomFull", {
        roomCode,
      });
      return;
    }

    socket.join(roomCode);

    socket.emit("joinedRoom", {
      roomCode,
      side: player.side,
      state: getPublicRoomState(room),
    });

    emitRoomState(roomCode);
  });

  socket.on("quickMatch", (payload: QuickMatchPayload) => {
    console.log("quickMatch requested:", socket.id, payload);

    removeFromQuickQueue(socket.id);

    const opponentQueueItem = quickQueue.shift();

    if (!opponentQueueItem) {
      quickQueue.push({
        socketId: socket.id,
        profile: {
          nickname: normalizeNickname(payload.nickname),
          avatar: normalizeAvatar(payload.avatar, "G"),
          border: normalizeBorder(payload.border),
          level: normalizeLevel(payload.level),
        },
      });

      socket.emit("quickMatchWaiting", {
        socketId: socket.id,
      });

      return;
    }

    const opponentSocketId = opponentQueueItem.socketId;
    const opponentSocket = io.sockets.sockets.get(opponentSocketId);

    if (!opponentSocket || opponentSocket.disconnected) {
      quickQueue.push({
        socketId: socket.id,
        profile: {
          nickname: normalizeNickname(payload.nickname),
          avatar: normalizeAvatar(payload.avatar, "G"),
          border: normalizeBorder(payload.border),
          level: normalizeLevel(payload.level),
        },
      });

      socket.emit("quickMatchWaiting", {
        socketId: socket.id,
      });

      return;
    }

    const roomCode = createRandomRoomCode();
    const room = createRoom(roomCode);

    rooms.set(roomCode, room);

    const playerA = addPlayerToRoom(room, opponentSocketId, {
      nickname: opponentQueueItem.profile.nickname,
      avatar: opponentQueueItem.profile.avatar,
      border: opponentQueueItem.profile.border,
      level: opponentQueueItem.profile.level,
    });

    const playerB = addPlayerToRoom(room, socket.id, {
      nickname: payload.nickname,
      avatar: payload.avatar,
      border: payload.border,
      level: payload.level,
    });

    if (!playerA || !playerB) {
      socket.emit("quickMatchFailed");
      opponentSocket.emit("quickMatchFailed");
      return;
    }

    opponentSocket.join(roomCode);
    socket.join(roomCode);

    room.phase = "lobby";
    room.musicId = ["street", "rush", "wave", "neon"][
      Math.floor(Math.random() * 4)
    ];
    room.noteSeed = Math.floor(Math.random() * 1000000);

    opponentSocket.emit("quickMatchFound", {
      roomCode,
      side: playerA.side,
      state: getPublicRoomState(room),
    });

    socket.emit("quickMatchFound", {
      roomCode,
      side: playerB.side,
      state: getPublicRoomState(room),
    });

    emitRoomState(roomCode);
  });

  socket.on("cancelQuickMatch", () => {
    removeFromQuickQueue(socket.id);

    socket.emit("quickMatchCanceled");
  });

  socket.on(
    "selectCharacters",
    (payload: { roomCode: string; characters: string[] }) => {
      const roomCode = normalizeRoomCode(payload.roomCode);
      const room = rooms.get(roomCode);
      if (!room) return;

      const player = room.players.find((item) => item.socketId === socket.id);
      if (!player) return;

      player.characters = Array.isArray(payload.characters)
        ? payload.characters.slice(0, 2)
        : [];

      player.ready = false;

      emitRoomState(roomCode);
    }
  );

  socket.on("selectMusic", (payload: { roomCode: string; musicId: string }) => {
    const roomCode = normalizeRoomCode(payload.roomCode);
    const room = rooms.get(roomCode);
    if (!room) return;

    const player = room.players.find((item) => item.socketId === socket.id);
    if (!player) return;

    if (player.side !== room.hostSide) {
      socket.emit("notHost", {
        roomCode,
      });
      return;
    }

    room.musicId = payload.musicId || "street";
    room.noteSeed = Math.floor(Math.random() * 1000000);

    room.players = room.players.map((item) => ({
      ...item,
      ready: false,
    }));

    emitRoomState(roomCode);
  });

  socket.on("randomMusic", (payload: { roomCode: string }) => {
    const roomCode = normalizeRoomCode(payload.roomCode);
    const room = rooms.get(roomCode);
    if (!room) return;

    const player = room.players.find((item) => item.socketId === socket.id);
    if (!player) return;

    if (player.side !== room.hostSide) {
      socket.emit("notHost", {
        roomCode,
      });
      return;
    }

    const musicList = ["street", "rush", "wave", "neon"];
    room.musicId = musicList[Math.floor(Math.random() * musicList.length)];
    room.noteSeed = Math.floor(Math.random() * 1000000);

    room.players = room.players.map((item) => ({
      ...item,
      ready: false,
    }));

    emitRoomState(roomCode);
  });

  socket.on("playerReady", (payload: { roomCode: string; ready?: boolean }) => {
    const roomCode = normalizeRoomCode(payload.roomCode);
    const room = rooms.get(roomCode);
    if (!room) return;

    const player = room.players.find((item) => item.socketId === socket.id);
    if (!player) return;

    player.ready = payload.ready ?? true;

    emitRoomState(roomCode);

    const bothReady =
      room.players.length === 2 &&
      room.players.every((item) => item.ready && item.characters.length > 0);

    if (bothReady) {
      const startedAt = Date.now() + 1200;

      room.phase = "battle";
      room.startedAt = startedAt;
      room.scores = {
        A: 0,
        B: 0,
      };

      io.to(roomCode).emit("battleStarted", {
        roomCode,
        startedAt,
        musicId: room.musicId,
        noteSeed: room.noteSeed,
        scores: room.scores,
        state: getPublicRoomState(room),
      });

      emitRoomState(roomCode);
    }
  });

  socket.on(
    "noteResult",
    (payload: {
      roomCode: string;
      noteId: string | number;
      rating: string;
      scoreDelta: number;
      combo: number;
    }) => {
      const roomCode = normalizeRoomCode(payload.roomCode);
      const room = rooms.get(roomCode);
      if (!room) return;

      const player = room.players.find((item) => item.socketId === socket.id);
      if (!player) return;

      const side = player.side;
      const scoreDelta = Math.max(0, Math.floor(Number(payload.scoreDelta) || 0));

      room.scores[side] += scoreDelta;

      io.to(roomCode).emit("noteResult", {
        noteId: payload.noteId,
        side,
        rating: payload.rating,
        scoreDelta,
        combo: Number(payload.combo) || 0,
        scores: room.scores,
      });

      emitRoomState(roomCode);
    }
  );

  socket.on(
    "scoreSync",
    (payload: { roomCode: string; score: number }) => {
      const roomCode = normalizeRoomCode(payload.roomCode);
      const room = rooms.get(roomCode);
      if (!room) return;

      const player = room.players.find((item) => item.socketId === socket.id);
      if (!player) return;

      const side = player.side;
      room.scores[side] = Math.max(0, Math.floor(Number(payload.score) || 0));

      io.to(roomCode).emit("scoreSync", {
        side,
        score: room.scores[side],
        scores: room.scores,
      });

      emitRoomState(roomCode);
    }
  );

  socket.on(
    "useSkill",
    (payload: {
      roomCode: string;
      skillId: string;
      skillName: string;
    }) => {
      const roomCode = normalizeRoomCode(payload.roomCode);
      const room = rooms.get(roomCode);
      if (!room) return;

      const player = room.players.find((item) => item.socketId === socket.id);
      if (!player) return;

      const fromSide = player.side;
      const targetSide: Side = fromSide === "A" ? "B" : "A";
      const fireAt = Date.now() + 2000;

      io.to(roomCode).emit("skillActivated", {
        fromSide,
        targetSide,
        skillId: payload.skillId,
        skillName: payload.skillName,
        fireAt,
      });
    }
  );

  socket.on(
    "attackSuccess",
    (payload: {
      roomCode: string;
      fromSide?: Side;
      targetSide?: Side;
    }) => {
      const roomCode = normalizeRoomCode(payload.roomCode);
      const room = rooms.get(roomCode);
      if (!room) return;

      const player = room.players.find((item) => item.socketId === socket.id);
      if (!player) return;

      const fromSide = player.side;
      const targetSide: Side = fromSide === "A" ? "B" : "A";

      io.to(roomCode).emit("attackSuccess", {
        fromSide,
        targetSide,
      });
    }
  );

  socket.on("battleEnded", (payload: { roomCode: string }) => {
    const roomCode = normalizeRoomCode(payload.roomCode);
    const room = rooms.get(roomCode);
    if (!room) return;

    room.phase = "result";

    io.to(roomCode).emit("battleEnded", {
      scores: room.scores,
      state: getPublicRoomState(room),
    });

    emitRoomState(roomCode);
  });

  socket.on("leaveRoom", () => {
    removePlayer(socket.id);
  });

  socket.on("disconnect", () => {
    console.log("disconnected:", socket.id);
    removePlayer(socket.id);
  });
});

httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`Beat Rise server running on port ${PORT}`);
});
