export type Position = { lat: number; lng: number };

export type UserRecord = {
  id?: string;
  _id?: string;
  username?: string;
  email?: string;
};

export type PlayerEntry = {
  playerId: string;
  userId: string;
  username: string | null;
  avatar?: string | null;
  isConnected: boolean;
};

export type NearbyTarget = {
  userId: string;
  distance: number;
};

export type ChatMessage = {
  userId: string;
  message: string;
  ts: number;
};

export type RoomRecord = {
  code: string;
  host?: { username?: string };
  players?: string[];
  maxPlayers?: number;
};
