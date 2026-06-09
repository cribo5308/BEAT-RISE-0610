import { supabase } from "./supabaseClient";

export type ProfileBorder = "neon" | "gold" | "purple" | "plain";

export type SavedProfile = {
  user_id: string;
  nickname: string;
  avatar_url: string | null;
  avatar_text: string;
  border: ProfileBorder;
  level: number;
  exp: number;
  gems: number;
  coins: number;
  followers: number;
  following: number;
  wins: number;
  losses: number;
};

export type LocalProfile = {
  nickname: string;
  avatar: string;
  border: ProfileBorder;
  level: number;
  exp: number;
  followers: number;
  following: number;
  wins: number;
  losses: number;
};

function getInitialAvatar(name: string) {
  return (name || "Guest").slice(0, 1).toUpperCase();
}

export function dbProfileToLocalProfile(row: SavedProfile): LocalProfile {
  return {
    nickname: row.nickname || "Guest",
    avatar: row.avatar_url || row.avatar_text || getInitialAvatar(row.nickname),
    border: row.border || "neon",
    level: row.level || 1,
    exp: row.exp || 0,
    followers: row.followers || 0,
    following: row.following || 0,
    wins: row.wins || 0,
    losses: row.losses || 0,
  };
}

export async function loadOrCreateProfile(userId: string, email?: string | null) {
  const { data: existing, error: selectError } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (selectError) throw selectError;

  if (existing) {
    return existing as SavedProfile;
  }

  const fallbackName = email?.split("@")[0] || "Guest";

  const newProfile = {
    user_id: userId,
    nickname: fallbackName,
    avatar_text: getInitialAvatar(fallbackName),
    avatar_url: null,
    border: "neon" as ProfileBorder,
    level: 1,
    exp: 0,
    gems: 120,
    coins: 3200,
    followers: 0,
    following: 0,
    wins: 0,
    losses: 0,
  };

  const { data, error } = await supabase
    .from("profiles")
    .insert(newProfile)
    .select("*")
    .single();

  if (error) throw error;

  return data as SavedProfile;
}

export async function saveProfilePatch(
  userId: string,
  patch: Partial<Omit<SavedProfile, "user_id">>
) {
  const { data, error } = await supabase
    .from("profiles")
    .update({
      ...patch,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .select("*")
    .single();

  if (error) throw error;

  return data as SavedProfile;
}

export async function uploadProfileAvatar(userId: string, file: File) {
  if (!file.type.startsWith("image/")) {
    throw new Error("이미지 파일만 업로드할 수 있어.");
  }

  const extension = file.name.split(".").pop() || "png";
  const filePath = `${userId}/avatar-${Date.now()}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from("avatars")
    .upload(filePath, file, {
      cacheControl: "3600",
      upsert: true,
    });

  if (uploadError) throw uploadError;

  const { data } = supabase.storage.from("avatars").getPublicUrl(filePath);

  return data.publicUrl;
}
