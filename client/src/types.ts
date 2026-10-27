export type Suggestion = {
  moveId: number;
  uci: string;
  san: string;
  encounterCount: number;
  percentage: number;
  lastSeen: string | null;
  openingNames: string[];
};

export type HistoryMove = {
  ply: number;
  uci: string;
  san: string;
  fenBefore: string;
  fenAfter: string;
};

export type SessionInfo = {
  id: number;
  name: string | null;
  lessonName: string | null;
  status: 'active' | 'completed' | 'abandoned';
  startedAt: string;
  lastActivityAt: string;
  currentFen: string;
  ply: number;
};

export type GameStatus = {
  turn: 'w' | 'b';
  inCheck: boolean;
  isCheckmate: boolean;
  isStalemate: boolean;
  isDraw: boolean;
  isGameOver: boolean;
  statusText: string;
};

export type SessionState = {
  session: SessionInfo;
  fen: string;
  positionKey: string;
  maxPly: number;
  canUndo: boolean;
  canRedo: boolean;
  lastMove: { uci: string; san: string; from: string; to: string } | null;
  history: HistoryMove[];
  suggestions: Suggestion[];
  game: GameStatus;
};

export type Opening = {
  id: number;
  name: string;
  source: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  plyCount?: number;
  pgn?: string;
  line: Array<{ ply: number; uci: string; san: string; fromKey: string; toKey: string }>;
};

export type ApiErrorShape = {
  error: string;
  details?: unknown;
};
