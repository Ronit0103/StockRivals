import React, { useState, useEffect, useRef, useMemo } from 'react';
import { io, Socket } from 'socket.io-client';
import { motion, AnimatePresence } from 'motion/react';
import { 
  TrendingUp, 
  TrendingDown, 
  Users, 
  Wallet, 
  ArrowRight, 
  Play, 
  Plus, 
  Minus, 
  RefreshCw,
  Trophy,
  Info,
  Zap,
  Landmark,
  Radio,
  Building2,
  Cpu,
  CreditCard,
  Code,
  Flame,
  Droplets,
  Bolt,
  Coins,
  Globe,
  Activity
} from 'lucide-react';

const STOCK_ICONS: Record<string, any> = {
  Zap,
  Landmark,
  Radio,
  Building2,
  Cpu,
  CreditCard,
  Code,
  Flame,
  Droplets,
  Bolt,
  Coins,
  Globe,
  Activity
};

// --- Constants ---
const INITIAL_CASH = 800000;
const MIN_BUY_AMOUNT = 1000;
const INITIAL_STOCK_PRICE = 100;
const ROUNDS_COUNT = 5;
const TURNS_PER_ROUND = 3;
const MIN_STOCK_PRICE = 10;
const CARD_VALUES = [-15, -10, -5, 5, 10, 15, 30];
const MARKET_CAP_PER_STOCK = 200000;

type WindfallType = 'SHARE_SUSPENDED' | 'LOAN_STOCK_MATURED' | 'DEBENTURE' | 'RIGHTS_ISSUE';

const WINDFALL_DETAILS: Record<WindfallType, { name: string, icon: string, description: string, label: string }> = {
  SHARE_SUSPENDED: { 
    name: 'Share Suspended', 
    icon: '🔒', 
    description: 'Revert a company price to start of turn.',
    label: 'Play Share Suspended'
  },
  LOAN_STOCK_MATURED: { 
    name: 'Loan Stock Matured', 
    icon: '💰', 
    description: 'Receive ₹1,00,000 cash.',
    label: 'Claim Loan Stock Matured (+₹1,00,000)'
  },
  DEBENTURE: { 
    name: 'Debenture', 
    icon: '📜', 
    description: 'Redeem insolvent shares at opening price.',
    label: 'Play Debenture — Redeem Bankrupt Shares at Opening Price'
  },
  RIGHTS_ISSUE: { 
    name: 'Rights Issue', 
    icon: '📋', 
    description: 'Buy 1 share for every 2 at ₹10.',
    label: 'Play Rights Issue'
  },
};

const STOCKS = [
  { id: 'HDFCBANK', name: 'HDFC Bank', icon: 'Landmark', initialPrice: 25, color: 'text-red-500', bgColor: 'bg-red-500/10', borderColor: 'border-red-500/20', cardGradient: 'from-red-600 to-red-900 border-red-400/30' },
  { id: 'ONGC', name: 'ONGC', icon: 'Droplets', initialPrice: 55, color: 'text-orange-500', bgColor: 'bg-orange-500/10', borderColor: 'border-orange-500/20', cardGradient: 'from-orange-600 to-orange-900 border-orange-400/30' },
  { id: 'TATA', name: 'TATA Motors', icon: 'Zap', initialPrice: 30, color: 'text-yellow-500', bgColor: 'bg-yellow-500/10', borderColor: 'border-yellow-500/20', cardGradient: 'from-yellow-600 to-yellow-900 border-yellow-400/30' },
  { id: 'ITC', name: 'ITC', icon: 'Flame', initialPrice: 40, color: 'text-emerald-500', bgColor: 'bg-emerald-500/10', borderColor: 'border-emerald-500/20', cardGradient: 'from-emerald-600 to-emerald-900 border-emerald-400/30' },
  { id: 'INFY', name: 'Infosys', icon: 'Cpu', initialPrice: 80, color: 'text-blue-500', bgColor: 'bg-blue-500/10', borderColor: 'border-blue-500/20', cardGradient: 'from-blue-600 to-blue-900 border-blue-400/30' },
  { id: 'RELIANCE', name: 'Reliance Industries', icon: 'Zap', initialPrice: 75, color: 'text-indigo-500', bgColor: 'bg-indigo-500/10', borderColor: 'border-indigo-500/20', cardGradient: 'from-indigo-600 to-indigo-900 border-indigo-400/30' },
  { id: 'SBIN', name: 'State Bank of India', icon: 'Building2', initialPrice: 60, color: 'text-violet-500', bgColor: 'bg-violet-500/10', borderColor: 'border-violet-500/20', cardGradient: 'from-violet-600 to-violet-900 border-violet-400/30' },
  { id: 'WOCKHARDT', name: 'Wockhardt', icon: 'Activity', initialPrice: 20, color: 'text-pink-500', bgColor: 'bg-pink-500/10', borderColor: 'border-pink-500/20', cardGradient: 'from-pink-600 to-pink-900 border-pink-400/30' },
];

// --- Types ---
type Stock = {
  id: string;
  name: string;
  price: number;
  history: number[];
  icon: string;
  availableShares: number;
  color: string;
  bgColor: string;
  borderColor: string;
  cardGradient: string;
  isInsolvent: boolean;
  chairmanId?: string;
};

type GameCard = {
  stockId: string;
  value: number;
};

type Player = {
  id: string;
  name: string;
  cash: number;
  portfolio: Record<string, number>;
  cards: GameCard[];
  windfallCard?: WindfallType;
  isHost: boolean;
  isReady: boolean;
  lastAction?: string;
};

type RevealStep = {
  stockId: string;
  originalCards: { playerId: string, value: number }[];
  vetoedCard?: { playerId: string, value: number };
  directorDiscarded?: { playerId: string, value: number };
  finalChange: number;
  newPrice: number;
  recovered?: boolean;
  becameInsolvent?: boolean;
};

type GameState = {
  status: 'setup' | 'lobby' | 'playing' | 'reveal' | 'ended';
  players: Player[];
  stocks: Stock[];
  round: number;
  turn: number;
  currentPlayerIndex: number;
  hostId: string;
  roomId: string;
  turnActionsCount: number;
  maxPlayers?: number;
  maxRounds?: number;
  revealSteps?: RevealStep[];
  windfallDeck: WindfallType[];
  suspendedStockId?: string;
  pendingRightsIssue?: {
    initiatorId: string;
    stockId: string;
    decisions: Record<string, boolean | null>; // playerId -> true/false/null
  };
};

// --- Game Logic Helpers ---
const generateCards = () => {
  const cards: GameCard[] = [];
  for (let i = 0; i < 10; i++) {
    const stock = STOCKS[Math.floor(Math.random() * STOCKS.length)];
    const value = CARD_VALUES[Math.floor(Math.random() * CARD_VALUES.length)];
    cards.push({ stockId: stock.id, value });
  }
  return cards;
};

const shuffle = <T,>(array: T[]): T[] => {
  const newArray = [...array];
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
};

const processAction = (state: GameState, playerId: string, action: any): GameState => {
  const newState = JSON.parse(JSON.stringify(state)) as GameState;
  const player = newState.players.find(p => p.id === playerId);
  if (!player) return state;

  if (action.type === 'buy') {
    const stock = newState.stocks.find(s => s.id === action.stockId);
    if (!stock) return state;

    if (stock.isInsolvent) {
      player.lastAction = `Failed: ${stock.id} is Insolvent`;
      return newState;
    }

    if (player.cash >= stock.price * action.amount && 
        action.amount >= MIN_BUY_AMOUNT && 
        action.amount % 1000 === 0 &&
        stock.availableShares >= action.amount) {
      
      const oldShares = player.portfolio[action.stockId] || 0;
      const newShares = oldShares + action.amount;
      
      player.cash -= stock.price * action.amount;
      player.portfolio[action.stockId] = newShares;
      stock.availableShares -= action.amount;
      player.lastAction = `Bought ${action.amount} ${stock.id}`;

      // Check for Chairman
      if (newShares >= 100000 && !stock.chairmanId) {
        stock.chairmanId = player.id;
      }
    }
  } else if (action.type === 'sell') {
    const stock = newState.stocks.find(s => s.id === action.stockId);
    if (!stock) return state;

    if (stock.isInsolvent) {
      player.lastAction = `Failed: ${stock.id} is Insolvent`;
      return newState;
    }

    const owned = player.portfolio[action.stockId] || 0;
    if (owned >= action.amount && action.amount % 1000 === 0) {
      player.cash += stock.price * action.amount;
      player.portfolio[action.stockId] = owned - action.amount;
      stock.availableShares += action.amount;
      player.lastAction = `Sold ${action.amount} ${stock.id}`;

      // If Chairman sells below 100k, they lose it? 
      // Rule says "first to reach 1,00,000 gets it; in a tie, the player who reached it first keeps it."
      // Usually Chairman is lost if you drop below. Let's assume they lose it.
      if (player.id === stock.chairmanId && player.portfolio[action.stockId] < 100000) {
        stock.chairmanId = undefined;
        // Check if anyone else qualifies now?
        const nextChairman = newState.players
          .filter(p => (p.portfolio[action.stockId] || 0) >= 100000)
          .sort((a, b) => 0) // We don't have time history, so just pick one or leave empty
          [0];
        if (nextChairman) stock.chairmanId = nextChairman.id;
      }
    }
  } else if (action.type === 'pass') {
    player.lastAction = 'Passed';
  } else if (action.type === 'play_windfall') {
    if (player.windfallCard !== action.cardType) return state;

    if (action.cardType === 'LOAN_STOCK_MATURED') {
      player.cash += 100000;
      player.lastAction = 'Played Loan Stock Matured (+₹1,00,000)';
      player.windfallCard = undefined;
    } else if (action.cardType === 'DEBENTURE') {
      let totalRedeemed = 0;
      newState.stocks.forEach(stock => {
        if (stock.isInsolvent) {
          const shares = player.portfolio[stock.id] || 0;
          if (shares > 0) {
            const initialStock = STOCKS.find(s => s.id === stock.id);
            const openingPrice = initialStock?.initialPrice || 100;
            const amount = shares * openingPrice;
            player.cash += amount;
            player.portfolio[stock.id] = 0;
            stock.availableShares += shares;
            totalRedeemed += amount;
          }
        }
      });
      player.lastAction = `Played Debenture (Redeemed ₹${totalRedeemed.toLocaleString()})`;
      player.windfallCard = undefined;
    } else if (action.cardType === 'RIGHTS_ISSUE') {
      const stock = newState.stocks.find(s => s.id === action.stockId);
      if (stock) {
        newState.pendingRightsIssue = {
          initiatorId: playerId,
          stockId: action.stockId,
          decisions: {}
        };
        newState.players.forEach(p => {
          if ((p.portfolio[action.stockId] || 0) > 0) {
            newState.pendingRightsIssue!.decisions[p.id] = null;
          }
        });
        player.lastAction = `Initiated Rights Issue for ${stock.id}`;
      }
    } else if (action.cardType === 'SHARE_SUSPENDED') {
      const stock = newState.stocks.find(s => s.id === action.stockId);
      if (stock) {
        newState.suspendedStockId = stock.id;
        const oldPrice = stock.history.length > 1 ? stock.history[stock.history.length - 2] : stock.price;
        stock.price = oldPrice;
        stock.history[stock.history.length - 1] = oldPrice;
        player.lastAction = `Suspended ${stock.id} price movement`;
        player.windfallCard = undefined;
      }
    }
    // Windfall actions don't move the turn automatically unless specified
    return newState;
  } else if (action.type === 'rights_issue_decision') {
    if (!newState.pendingRightsIssue) return state;
    newState.pendingRightsIssue.decisions[playerId] = action.participate;
    
    const allDecided = Object.values(newState.pendingRightsIssue.decisions).every(d => d !== null);
    if (allDecided) {
      const stockId = newState.pendingRightsIssue.stockId;
      const stock = newState.stocks.find(s => s.id === stockId)!;
      const initiatorIndex = newState.players.findIndex(p => p.id === newState.pendingRightsIssue!.initiatorId);
      const playersOrder = [
        ...newState.players.slice(initiatorIndex),
        ...newState.players.slice(0, initiatorIndex)
      ];
      
      playersOrder.forEach(p => {
        if (newState.pendingRightsIssue!.decisions[p.id]) {
          const currentShares = p.portfolio[stockId] || 0;
          const requestedShares = Math.floor(currentShares / 2000) * 1000; // Round down (e.g. 13,000 -> 6,000)
          const actualShares = Math.min(requestedShares, stock.availableShares);
          const cost = actualShares * 10;
          
          if (p.cash >= cost && actualShares > 0) {
            p.cash -= cost;
            p.portfolio[stockId] = currentShares + actualShares;
            stock.availableShares -= actualShares;
          }
        }
      });
      
      const initiator = newState.players.find(p => p.id === newState.pendingRightsIssue!.initiatorId);
      if (initiator) initiator.windfallCard = undefined;
      newState.pendingRightsIssue = undefined;
    }
    return newState;
  }

  // Move to next player
  newState.currentPlayerIndex = (newState.currentPlayerIndex + 1) % newState.players.length;
  newState.turnActionsCount += 1;

  // Check if turn is over
  if (newState.turnActionsCount >= newState.players.length) {
    newState.status = 'reveal';
  }

  return newState;
};

const calculateReveal = (state: GameState): GameState => {
  const newState = JSON.parse(JSON.stringify(state)) as GameState;
  const revealSteps: RevealStep[] = [];

  newState.stocks.forEach(stock => {
    const originalCards: { playerId: string, value: number }[] = [];
    newState.players.forEach(p => {
      p.cards.filter(c => c.stockId === stock.id).forEach(c => {
        originalCards.push({ playerId: p.id, value: c.value });
      });
    });

    let cardsToSum = [...originalCards];
    let vetoedCard: { playerId: string, value: number } | undefined;
    let directorDiscarded: { playerId: string, value: number } | undefined;

    // 1. Chairman Privilege (Priority)
    if (stock.chairmanId) {
      const negativeCards = cardsToSum.filter(c => c.value < 0).sort((a, b) => a.value - b.value);
      if (negativeCards.length > 0) {
        vetoedCard = negativeCards[0];
        const index = cardsToSum.findIndex(c => c === vetoedCard);
        if (index !== -1) cardsToSum.splice(index, 1);
      }
    }

    // 2. Director Privilege
    const directors = newState.players.filter(p => {
      const shares = p.portfolio[stock.id] || 0;
      return shares >= 50000 && shares < 100000 && p.id !== stock.chairmanId;
    });

    directors.forEach(director => {
      const directorCards = cardsToSum.filter(c => c.playerId === director.id);
      if (directorCards.length > 0) {
        const worstCard = directorCards.sort((a, b) => a.value - b.value)[0];
        directorDiscarded = worstCard;
        const index = cardsToSum.findIndex(c => c === worstCard);
        if (index !== -1) cardsToSum.splice(index, 1);
      }
    });

    const totalChange = cardsToSum.reduce((sum, c) => sum + c.value, 0);
    const oldPrice = stock.price;
    let newPrice = stock.price + totalChange;
    let recovered = false;
    let becameInsolvent = false;

    if (stock.isInsolvent) {
      if (totalChange > 0) {
        newPrice = 1;
        stock.isInsolvent = false;
        recovered = true;
      } else {
        newPrice = 0;
      }
    } else {
      if (newPrice <= 0) {
        newPrice = 0;
        stock.isInsolvent = true;
        becameInsolvent = true;
      }
    }

    stock.price = newPrice;
    stock.history.push(stock.price);

    revealSteps.push({
      stockId: stock.id,
      originalCards,
      vetoedCard,
      directorDiscarded,
      finalChange: totalChange,
      newPrice,
      recovered,
      becameInsolvent
    });
  });

  newState.revealSteps = revealSteps;

  return newState;
};

const startNextTurn = (state: GameState): GameState => {
  const newState = JSON.parse(JSON.stringify(state)) as GameState;

  // Reset for next turn
  newState.turnActionsCount = 0;
  newState.currentPlayerIndex = 0;
  newState.suspendedStockId = undefined; // Clear suspension for next turn
  newState.revealSteps = undefined; // Clear previous reveal

  newState.players.forEach(p => {
    p.lastAction = undefined;
    p.cards = generateCards();
  });

  newState.turn += 1;
  if (newState.turn > TURNS_PER_ROUND) {
    // End of round: discard unused windfall cards
    newState.players.forEach(p => {
      p.windfallCard = undefined;
    });

    newState.turn = 1;
    newState.round += 1;

    // Deal new windfall card at start of new round
    if (newState.round <= (newState.maxRounds || ROUNDS_COUNT)) {
      const randomPlayerIndex = Math.floor(Math.random() * newState.players.length);
      if (newState.windfallDeck.length > 0) {
        newState.players[randomPlayerIndex].windfallCard = newState.windfallDeck.pop();
      }
    }
  }

  if (newState.round > (newState.maxRounds || ROUNDS_COUNT)) {
    newState.status = 'ended';
  } else {
    newState.status = 'playing';
  }

  return newState;
};

// --- Helper Components ---
const TickerBackground = () => {
  const tickerItems = useMemo(() => {
    return [...STOCKS, ...STOCKS].map((stock, i) => ({
      ...stock,
      price: 100 + Math.floor(Math.random() * 500),
      change: (Math.random() * 10 - 5).toFixed(2)
    }));
  }, []);

  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none z-0 opacity-20">
      <div className="absolute top-0 left-0 w-full h-full flex flex-col justify-around py-10">
        {[0, 1, 2].map((row) => (
          <div key={row} className="flex whitespace-nowrap overflow-hidden">
            <motion.div
              animate={{ x: row % 2 === 0 ? [0, -1000] : [-1000, 0] }}
              transition={{ 
                duration: 30 + row * 5, 
                repeat: Infinity, 
                ease: "linear" 
              }}
              className="flex gap-12 items-center"
            >
              {tickerItems.map((item, i) => (
                <div key={`${row}-${i}`} className="flex items-center gap-3 font-mono">
                  <span className="text-zinc-700 font-black text-4xl">{item.id}</span>
                  <span className="text-zinc-800 text-2xl">₹{item.price}</span>
                  <span className={`text-xl font-bold ${parseFloat(item.change) >= 0 ? 'text-emerald-900' : 'text-rose-900'}`}>
                    {parseFloat(item.change) >= 0 ? '▲' : '▼'} {Math.abs(parseFloat(item.change))}%
                  </span>
                </div>
              ))}
            </motion.div>
          </div>
        ))}
      </div>
    </div>
  );
};

const STOCK_CARD_COLORS: Record<string, string> = {
  WOCKHARDT: 'from-pink-600 to-pink-900 border-pink-400/30',
  HDFCBANK: 'from-rose-600 to-rose-900 border-rose-400/30',
  TATA: 'from-amber-600 to-amber-900 border-amber-400/30',
  ITC: 'from-emerald-600 to-emerald-900 border-emerald-400/30',
  ONGC: 'from-orange-600 to-orange-900 border-orange-400/30',
  SBIN: 'from-violet-600 to-violet-900 border-violet-400/30',
  RELIANCE: 'from-blue-600 to-blue-900 border-blue-400/30',
  INFY: 'from-emerald-600 to-emerald-900 border-emerald-400/30',
};

const GameCardUI: React.FC<{ 
  card: GameCard, 
  index: number, 
  total: number, 
  isHovered: boolean, 
  onHover: (index: number | null) => void 
}> = ({ card, index, total, isHovered, onHover }) => {
  const stock = STOCKS.find(s => s.id === card.stockId);
  const Icon = STOCK_ICONS[stock?.icon || 'Activity'] || Activity;
  const cardColorClass = stock?.cardGradient || 'from-zinc-600 to-zinc-900 border-zinc-400/30';

  return (
    <motion.div
      layout
      initial={{ y: 50, opacity: 0 }}
      animate={{ 
        y: isHovered ? -15 : 0, 
        opacity: 1, 
        scale: isHovered ? 1.1 : 1,
        zIndex: isHovered ? 100 : index,
      }}
      transition={{ 
        type: 'spring', 
        stiffness: 300, 
        damping: 20,
        delay: index * 0.02 
      }}
      whileTap={{ scale: 1.2 }}
      onMouseEnter={() => onHover(index)}
      onMouseLeave={() => onHover(null)}
      className={`relative w-24 h-36 rounded-2xl border-2 shadow-2xl flex flex-col items-center justify-center p-3 cursor-pointer overflow-hidden group bg-gradient-to-br ${cardColorClass}`}
      style={{ 
        transformOrigin: 'center center',
        touchAction: 'none'
      }}
    >
      {/* Uno-style oval background */}
      <div className="absolute inset-0 flex items-center justify-center opacity-20 pointer-events-none">
        <div className="w-[120%] h-[70%] bg-white rounded-[100%] rotate-[-45deg]" />
      </div>

      <div className="flex flex-col items-center gap-1 relative z-10">
        <div className="w-14 h-14 rounded-full flex items-center justify-center bg-white shadow-xl border-2 border-black/5">
          <span className={`text-2xl font-black font-mono ${card.value >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
            {card.value > 0 ? '+' : ''}{card.value}
          </span>
        </div>
        <p className="text-[9px] font-black text-white uppercase tracking-tighter drop-shadow-md mt-1">{stock?.id}</p>
        <Icon size={12} className="text-white/70 mt-1" />
      </div>

      {/* Inner border */}
      <div className="absolute inset-2 border border-white/20 rounded-xl pointer-events-none" />
    </motion.div>
  );
};

const CardHand = ({ cards }: { cards: GameCard[] }) => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  if (!Array.isArray(cards)) return null;

  // Sort cards by stockId to keep same companies together
  const sortedCards = [...cards].sort((a, b) => a.stockId.localeCompare(b.stockId));

  return (
    <div className="flex flex-wrap justify-center items-center gap-3 px-2 mt-8 mb-4">
      <AnimatePresence mode="popLayout">
        {sortedCards.map((card, i) => (
          <GameCardUI 
            key={`${card.stockId}-${card.value}-${i}`} 
            card={card} 
            index={i} 
            total={sortedCards.length} 
            isHovered={hoveredIndex === i}
            onHover={setHoveredIndex}
          />
        ))}
      </AnimatePresence>
    </div>
  );
};

const LandscapeOverlay = () => {
  const [isPortrait, setIsPortrait] = useState(false);

  useEffect(() => {
    const checkOrientation = () => {
      setIsPortrait(window.innerHeight > window.innerWidth);
    };
    checkOrientation();
    window.addEventListener('resize', checkOrientation);
    return () => window.removeEventListener('resize', checkOrientation);
  }, []);

  if (!isPortrait) return null;

  return (
    <div className="fixed inset-0 z-[1000] bg-zinc-950 flex flex-col items-center justify-center p-8 text-center sm:hidden">
      <motion.div
        animate={{ rotate: 90 }}
        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        className="mb-8 text-orange-500"
      >
        <RefreshCw size={64} />
      </motion.div>
      <h2 className="text-2xl font-black italic text-white uppercase tracking-tighter mb-4">LANDSCAPE MODE REQUIRED</h2>
      <p className="text-zinc-500 font-mono text-xs uppercase tracking-[0.2em]">Please rotate your device for the best trading experience.</p>
    </div>
  );
};

// --- Main Component ---
export default function App() {
  const [username, setUsername] = useState('');
  const [roomId, setRoomId] = useState('');
  const [maxPlayers, setMaxPlayers] = useState(10);
  const [maxRounds, setMaxRounds] = useState(5);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const gameStateRef = useRef<GameState | null>(null);
  const [myId, setMyId] = useState('');
  const [error, setError] = useState('');

  // Sync ref with state
  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  // Local state for trading
  const [selectedStockId, setSelectedStockId] = useState(STOCKS[0].id);
  const [tradeAmount, setTradeAmount] = useState(1000);

  const isHost = gameState?.hostId === myId;
  const me = gameState?.players.find(p => p.id === myId);
  const isMyTurn = gameState?.status === 'playing' && gameState.players[gameState.currentPlayerIndex]?.id === myId;

  const totalPortfolioValue = useMemo(() => {
    if (!me || !gameState) return 0;
    return Object.entries(me.portfolio).reduce((sum: number, [id, amt]: [string, number]) => {
      const stock = gameState.stocks.find(s => s.id === id);
      return sum + (stock ? stock.price * amt : 0);
    }, 0);
  }, [me, gameState?.stocks]);

  // --- Socket Connection ---
  useEffect(() => {
    const newSocket = io();
    setSocket(newSocket);
    setMyId(newSocket.id || '');

    newSocket.on('connect', () => setMyId(newSocket.id || ''));
    
    newSocket.on('lobby_update', ({ roomId: serverRoomId, players, hostId, maxPlayers: serverMaxPlayers }) => {
      setGameState(prev => ({
        ...(prev || {
          status: 'lobby',
          players: [],
          stocks: [],
          round: 1,
          turn: 1,
          currentPlayerIndex: 0,
          hostId: '',
          roomId: serverRoomId,
          turnActionsCount: 0
        }),
        roomId: serverRoomId,
        maxPlayers: serverMaxPlayers,
        players: players.map((p: any) => ({
          ...p,
          cash: INITIAL_CASH,
          portfolio: {},
          cards: [],
          isHost: p.id === hostId
        })),
        hostId
      }));
    });

    newSocket.on('start_game', (state) => {
      setGameState(state);
    });

    newSocket.on('state_update', (state) => {
      setGameState(state);
    });

    newSocket.on('error_message', (msg) => {
      setError(msg);
      setTimeout(() => setError(''), 3000);
    });

    return () => {
      newSocket.disconnect();
    };
  }, []);

  // --- Host Logic: Process Actions ---
  useEffect(() => {
    if (!isHost || !socket) return;

    const handleAction = ({ playerId, action }: { playerId: string, action: any }) => {
      if (!gameStateRef.current) return;
      try {
        const nextState = processAction(gameStateRef.current, playerId, action);
        socket.emit('state_update', { roomId: gameStateRef.current.roomId, state: nextState });
      } catch (err) {
        console.error("Error processing action:", err);
      }
    };

    socket.on('action_received', handleAction);
    return () => {
      socket.off('action_received', handleAction);
    };
  }, [isHost, socket]);

  // --- Handlers ---
  const handleHost = () => {
    if (!username) return setError('Enter username');
    const id = Math.random().toString(36).substring(2, 7).toUpperCase();
    setRoomId(id);
    socket?.emit('join', { roomId: id, username, maxPlayers });
  };

  const handleJoin = () => {
    if (!username || !roomId) return setError('Enter username and room ID');
    socket?.emit('join', { roomId, username });
  };

  const handleStartGame = () => {
    if (!isHost || !gameState) return;
    const initialWindfallDeck = shuffle([
      'SHARE_SUSPENDED', 'SHARE_SUSPENDED',
      'LOAN_STOCK_MATURED', 'LOAN_STOCK_MATURED',
      'DEBENTURE', 'DEBENTURE',
      'RIGHTS_ISSUE', 'RIGHTS_ISSUE'
    ] as WindfallType[]);

    const players = gameState.players.map(p => ({
      ...p,
      cash: INITIAL_CASH,
      portfolio: {},
      cards: generateCards(),
      windfallCard: undefined
    }));

    // Deal one windfall card to a random player
    const randomPlayerIndex = Math.floor(Math.random() * players.length);
    players[randomPlayerIndex].windfallCard = initialWindfallDeck.pop();

    const initialState: GameState = {
      ...gameState,
      status: 'playing',
      roomId,
      maxRounds,
      windfallDeck: initialWindfallDeck,
      stocks: STOCKS.map(s => ({ 
        id: s.id, 
        name: s.name, 
        icon: s.icon, 
        price: s.initialPrice, 
        history: [s.initialPrice],
        availableShares: MARKET_CAP_PER_STOCK,
        color: s.color,
        bgColor: s.bgColor,
        borderColor: s.borderColor,
        isInsolvent: false
      })),
      players,
      round: 1,
      turn: 1,
      currentPlayerIndex: 0,
      turnActionsCount: 0
    };
    socket?.emit('start_game', { roomId, initialState });
  };

  const sendAction = (action: any) => {
    const isSpecialAction = action.type === 'rights_issue_decision' || (action.type === 'play_windfall' && action.cardType === 'SHARE_SUSPENDED');
    if (!isMyTurn && !isSpecialAction) return;
    socket?.emit('action', { roomId: gameState?.roomId, action });
  };

  const handleRevealNext = () => {
    if (!isHost || !gameState) return;
    let nextState;
    if (!gameState.revealSteps || gameState.revealSteps.length === 0) {
      nextState = calculateReveal(gameState);
    } else {
      nextState = startNextTurn(gameState);
    }
    socket?.emit('state_update', { roomId: gameState.roomId, state: nextState });
  };

  // --- UI Components ---

  if (!gameState || gameState.status === 'setup') {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center p-6 font-sans selection:bg-orange-500/30 overflow-hidden">
        <LandscapeOverlay />
        <TickerBackground />
        
        <div className="fixed inset-0 overflow-hidden pointer-events-none opacity-20">
          <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] bg-orange-600 rounded-full blur-[120px]" />
          <div className="absolute -bottom-[10%] -right-[10%] w-[40%] h-[40%] bg-zinc-800 rounded-full blur-[120px]" />
        </div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md space-y-12 relative z-10"
        >
          <div className="text-center space-y-4">
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.2, type: "spring" }}
              className="inline-block"
            >
              <div className="bg-orange-500/10 border border-orange-500/20 px-4 py-1 rounded-full mb-4">
                <span className="text-[10px] font-black uppercase tracking-[0.3em] text-orange-500">v1.1 Nifty Edition</span>
              </div>
            </motion.div>
            <h1 className="text-7xl font-black tracking-tighter italic text-white uppercase leading-[0.8] font-display">
              STOCK<br />
              <span className="text-orange-500">RIVALS</span>
            </h1>
            <p className="text-zinc-500 text-xs font-mono uppercase tracking-[0.4em] pt-2">The Ultimate Trading Floor</p>
          </div>

          <div className="space-y-6 bg-zinc-900/40 backdrop-blur-xl p-6 md:p-8 rounded-3xl md:rounded-[2.5rem] border border-white/5 shadow-2xl">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-3">
                <label className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-black ml-1">Identity</label>
                <input 
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder="CALLSIGN"
                  className="w-full bg-white/5 border border-white/5 rounded-2xl p-3 md:p-4 text-zinc-100 focus:ring-2 focus:ring-orange-500/50 transition-all font-mono placeholder:text-zinc-700 outline-none"
                />
              </div>
              <div className="space-y-3">
                <label className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-black ml-1">Max Players</label>
                <select 
                  value={maxPlayers}
                  onChange={e => setMaxPlayers(parseInt(e.target.value))}
                  className="w-full bg-white/5 border border-white/5 rounded-2xl p-3 md:p-4 text-zinc-100 focus:ring-2 focus:ring-orange-500/50 transition-all font-mono outline-none appearance-none cursor-pointer"
                >
                  {[...Array(11)].map((_, i) => (
                    <option key={i + 2} value={i + 2} className="bg-zinc-900">{i + 2}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-3">
              <label className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-black ml-1">Number of Rounds</label>
              <select 
                value={maxRounds}
                onChange={e => setMaxRounds(parseInt(e.target.value))}
                className="w-full bg-white/5 border border-white/5 rounded-2xl p-3 md:p-4 text-zinc-100 focus:ring-2 focus:ring-orange-500/50 transition-all font-mono outline-none appearance-none cursor-pointer"
              >
                {[3, 5, 7, 10, 12, 15, 20].map((r) => (
                  <option key={r} value={r} className="bg-zinc-900">{r} Rounds</option>
                ))}
              </select>
            </div>

            <div className="pt-4 space-y-4">
              <button 
                onClick={handleHost}
                className="w-full bg-orange-600 hover:bg-orange-500 text-white font-black py-3 md:py-4 rounded-2xl transition-all flex items-center justify-center gap-3 group shadow-lg shadow-orange-900/20"
              >
                HOST SESSION <Play size={18} fill="currentColor" className="group-hover:translate-x-1 transition-transform" />
              </button>
              
              <div className="relative py-2 flex items-center">
                <div className="flex-grow border-t border-white/5"></div>
                <span className="flex-shrink mx-4 text-[9px] text-zinc-600 font-black uppercase tracking-[0.3em]">Network Join</span>
                <div className="flex-grow border-t border-white/5"></div>
              </div>

              <div className="flex gap-2">
                <input 
                  value={roomId}
                  onChange={e => setRoomId(e.target.value.toUpperCase())}
                  placeholder="ROOM_ID"
                  className="flex-1 min-w-0 bg-white/5 border border-white/5 rounded-2xl p-3 md:p-4 text-zinc-100 focus:ring-2 focus:ring-orange-500/50 transition-all font-mono text-center placeholder:text-zinc-700 outline-none text-sm"
                />
                <button 
                  onClick={handleJoin}
                  className="w-20 md:w-24 flex-none bg-zinc-100 hover:bg-white text-zinc-950 font-black rounded-2xl transition-all uppercase tracking-widest text-[10px]"
                >
                  Join
                </button>
              </div>
            </div>
            {error && <p className="text-red-500 text-[10px] text-center font-mono font-bold uppercase tracking-widest animate-pulse">{error}</p>}
          </div>
        </motion.div>
      </div>
    );
  }

  if (gameState.status === 'lobby') {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6 flex flex-col items-center justify-center font-sans overflow-hidden">
        <LandscapeOverlay />
        <TickerBackground />
        
        <div className="fixed inset-0 overflow-hidden pointer-events-none opacity-10">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-orange-500 rounded-full blur-[200px]" />
        </div>

        <div className="w-full max-w-md space-y-10 relative z-10">
          <div className="flex justify-between items-end">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
                <p className="text-[10px] text-orange-500 font-black uppercase tracking-[0.3em]">Session Ready</p>
              </div>
              <h2 className="text-5xl font-black italic uppercase tracking-tighter font-display">ID: {gameState.roomId}</h2>
            </div>
            <div className="bg-white/5 px-4 py-2 rounded-2xl border border-white/5 flex items-center gap-3 backdrop-blur-md">
              <Users size={16} className="text-zinc-500" />
              <span className="text-sm font-mono font-black">{gameState.players.length}<span className="text-zinc-600">/{gameState.maxPlayers || 10}</span></span>
            </div>
          </div>

          <div className="bg-zinc-900/40 backdrop-blur-xl rounded-[2.5rem] border border-white/5 overflow-hidden shadow-2xl">
            <div className="p-6 border-b border-white/5 bg-white/5">
              <p className="text-[10px] text-zinc-500 font-black uppercase tracking-[0.2em]">Manifest / Active Players</p>
            </div>
            <div className="divide-y divide-white/5 max-h-[40vh] overflow-y-auto scrollbar-hide">
              {gameState.players.map((p, i) => (
                <motion.div 
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.1 }}
                  key={p.id} 
                  className="p-6 flex justify-between items-center group hover:bg-white/5 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-zinc-800 border border-white/5 flex items-center justify-center text-lg font-black text-zinc-400 group-hover:border-orange-500/30 transition-colors">
                      {p.name[0].toUpperCase()}
                    </div>
                    <div>
                      <span className={`text-lg font-black italic uppercase tracking-tight ${p.id === myId ? 'text-orange-500' : 'text-zinc-200'}`}>
                        {p.name}
                      </span>
                      {p.id === myId && <p className="text-[8px] font-black text-zinc-600 uppercase tracking-widest mt-0.5">Local Client</p>}
                    </div>
                  </div>
                  {p.isHost && (
                    <div className="flex items-center gap-2 bg-orange-500/10 px-3 py-1.5 rounded-xl border border-orange-500/20">
                      <div className="w-1.5 h-1.5 rounded-full bg-orange-500" />
                      <span className="text-[9px] text-orange-500 font-black uppercase tracking-widest">Host</span>
                    </div>
                  )}
                </motion.div>
              ))}
            </div>
          </div>

            {isHost ? (
            <button 
              onClick={handleStartGame}
              disabled={gameState.players.length < 2}
              className={`w-full py-6 rounded-[2rem] font-black uppercase tracking-[0.2em] transition-all shadow-2xl ${
                gameState.players.length >= 2 
                ? 'bg-orange-600 hover:bg-orange-500 text-white scale-100 hover:scale-[1.02] active:scale-95' 
                : 'bg-zinc-800 text-zinc-600 cursor-not-allowed opacity-50'
              }`}
            >
              Open Market
            </button>
          ) : (
            <div className="text-center p-8 bg-white/5 rounded-[2rem] border border-white/5 border-dashed">
              <div className="flex flex-col items-center gap-4">
                <RefreshCw size={24} className="animate-spin text-orange-500/50" />
                <p className="text-xs text-zinc-500 font-mono font-bold uppercase tracking-[0.2em]">Synchronizing with Host...</p>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (gameState.status === 'playing' || gameState.status === 'reveal') {
    const currentStock = gameState.stocks.find(s => s.id === selectedStockId)!;
    const myPortfolio = me?.portfolio[selectedStockId] || 0;
    const currentPlayer = gameState.players[gameState.currentPlayerIndex];

    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans flex flex-col selection:bg-orange-500/30 overflow-hidden relative">
        <LandscapeOverlay />
        <TickerBackground />
        
        {/* Rights Issue Participation Prompt */}
        {gameState.pendingRightsIssue && gameState.pendingRightsIssue.decisions[myId] === null && (
          <div className="fixed inset-0 z-[200] bg-zinc-950/80 backdrop-blur-md flex items-center justify-center p-6">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-zinc-900 border border-white/10 p-8 rounded-[2.5rem] max-w-md w-full shadow-2xl text-center space-y-6"
            >
              <div className="w-16 h-16 bg-emerald-500/20 rounded-2xl flex items-center justify-center mx-auto">
                <Plus size={32} className="text-emerald-500" />
              </div>
              <div>
                <h3 className="text-2xl font-black italic uppercase tracking-tighter text-white">Rights Issue Opportunity</h3>
                <p className="text-zinc-500 text-xs font-mono mt-2">
                  A Rights Issue has been initiated for <span className="text-white font-bold">{gameState.pendingRightsIssue.stockId}</span>.
                  You can buy 1 additional share for every 2 you hold at <span className="text-emerald-500 font-bold">₹10/share</span>.
                </p>
              </div>
              <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                <p className="text-[10px] text-zinc-500 font-black uppercase tracking-widest mb-1">Your Current Holding</p>
                <p className="text-xl font-black font-mono">{(me?.portfolio[gameState.pendingRightsIssue.stockId] || 0).toLocaleString()} Shares</p>
                <p className="text-[10px] text-emerald-500 font-bold mt-1">
                  Potential: +{(Math.floor((me?.portfolio[gameState.pendingRightsIssue.stockId] || 0) / 2000) * 1000).toLocaleString()} @ ₹10
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <button 
                  onClick={() => sendAction({ type: 'rights_issue_decision', participate: true })}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-black py-4 rounded-2xl transition-all uppercase text-xs"
                >
                  Participate
                </button>
                <button 
                  onClick={() => sendAction({ type: 'rights_issue_decision', participate: false })}
                  className="bg-zinc-800 hover:bg-zinc-700 text-zinc-400 font-black py-4 rounded-2xl transition-all uppercase text-xs"
                >
                  Decline
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* Header */}
        <div className="p-4 bg-zinc-900/40 border-b border-white/5 sticky top-0 z-20 backdrop-blur-xl">
          <div className="max-w-6xl mx-auto flex justify-between items-center">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <div className="bg-zinc-800/50 border border-white/5 px-4 py-2 rounded-2xl">
                  <p className="text-[8px] text-zinc-500 font-black uppercase tracking-[0.2em] mb-0.5">Round</p>
                  <p className="text-xl font-black italic leading-none font-display text-orange-500">{gameState.round}<span className="text-zinc-600 text-sm not-italic ml-1">/ {ROUNDS_COUNT}</span></p>
                </div>
                <div className="bg-zinc-800/50 border border-white/5 px-4 py-2 rounded-2xl">
                  <p className="text-[8px] text-zinc-500 font-black uppercase tracking-[0.2em] mb-0.5">Turn</p>
                  <p className="text-xl font-black italic leading-none font-display text-white">{gameState.turn}<span className="text-zinc-600 text-sm not-italic ml-1">/ {TURNS_PER_ROUND}</span></p>
                </div>
              </div>
            </div>
            
            <div className="hidden md:block text-center">
              <h1 className="text-xl font-black italic tracking-tighter uppercase font-display">
                STOCK<span className="text-orange-500">RIVALS</span>
              </h1>
            </div>

            <div className="flex items-center gap-3">
              {me?.windfallCard && (
                <motion.div 
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="bg-amber-500/20 border border-amber-500/40 p-2 rounded-2xl flex items-center gap-2 shadow-[0_0_15px_rgba(245,158,11,0.2)]"
                  title={WINDFALL_DETAILS[me.windfallCard].description}
                >
                  <span className="text-lg">{WINDFALL_DETAILS[me.windfallCard].icon}</span>
                  <div className="hidden lg:block">
                    <p className="text-[8px] text-amber-500 font-black uppercase tracking-widest leading-none">Windfall Card</p>
                    <p className="text-[10px] text-white font-black uppercase tracking-tight">{WINDFALL_DETAILS[me.windfallCard].name}</p>
                  </div>
                </motion.div>
              )}
              <div className="text-right hidden sm:block bg-white/5 border border-white/5 px-5 py-2 rounded-2xl">
                <p className="text-[9px] text-zinc-500 font-black uppercase tracking-[0.2em] mb-0.5">Portfolio Value</p>
                <p className="text-xl font-black font-mono">₹{totalPortfolioValue.toLocaleString()}</p>
              </div>
              <div className="text-right bg-orange-500/10 border border-orange-500/20 px-5 py-2 rounded-2xl">
                <p className="text-[9px] text-orange-500/70 font-black uppercase tracking-[0.2em] mb-0.5">Liquid Capital</p>
                <p className="text-xl font-black font-mono">₹{me?.cash.toLocaleString()}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 max-w-6xl w-full mx-auto p-4 md:p-8 space-y-8">
          {/* Recent Activity Feed */}
          <div className="bg-zinc-900/40 backdrop-blur-xl rounded-[2rem] p-4 border border-white/5 shadow-xl overflow-hidden">
            <div className="flex items-center gap-3 mb-3 px-2">
              <Radio size={14} className="text-orange-500 animate-pulse" />
              <p className="text-[10px] text-zinc-500 font-black uppercase tracking-[0.3em]">Live Transaction Feed</p>
            </div>
            <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide px-2">
              {gameState.players.map(p => (
                <div key={p.id} className="flex-none bg-white/5 border border-white/5 rounded-xl px-4 py-2 flex items-center gap-3 min-w-[200px]">
                  <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center text-xs font-black text-zinc-400">
                    {p.name[0]}
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-white uppercase tracking-tight">{p.name}</p>
                    <p className={`text-[9px] font-bold uppercase truncate ${p.lastAction?.includes('Failed') ? 'text-rose-500' : 'text-emerald-500'}`}>
                      {p.lastAction || 'Waiting for move...'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Turn Indicator */}
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white/5 rounded-3xl p-5 border border-white/5 flex items-center justify-between shadow-xl backdrop-blur-md"
          >
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className={`w-3 h-3 rounded-full ${gameState.status === 'reveal' ? 'bg-orange-500 animate-pulse' : 'bg-emerald-500'}`} />
                <div className={`absolute inset-0 rounded-full blur-sm ${gameState.status === 'reveal' ? 'bg-orange-500/50 animate-pulse' : 'bg-emerald-500/50'}`} />
              </div>
              <div>
                <p className="text-[9px] text-zinc-500 font-black uppercase tracking-[0.3em] mb-0.5">System Status</p>
                <p className="text-sm font-black uppercase tracking-tight font-display">
                  {gameState.status === 'reveal' ? 'MARKET REVEAL IN PROGRESS' : `${currentPlayer.name.toUpperCase()} IS TRADING`}
                </p>
              </div>
            </div>
            {gameState.status === 'playing' && (
              <div className="text-right hidden sm:block">
                <p className="text-[9px] text-zinc-500 font-black uppercase tracking-[0.3em] mb-0.5">Queue Progress</p>
                <div className="flex items-center gap-2">
                  <div className="w-32 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                    <motion.div 
                      className="h-full bg-orange-500"
                      initial={{ width: 0 }}
                      animate={{ width: `${(gameState.turnActionsCount / gameState.players.length) * 100}%` }}
                    />
                  </div>
                  <p className="text-[10px] font-mono font-black text-zinc-400">{gameState.turnActionsCount}/{gameState.players.length}</p>
                </div>
              </div>
            )}
          </motion.div>

          {gameState.status === 'playing' ? (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              {/* Stock List - 2x4 Grid with Card Aesthetic */}
              <div className="lg:col-span-8 space-y-8">
                <div className="flex flex-col items-center">
                  <div className="flex items-center gap-2 mb-8">
                    <span className="text-zinc-500 text-[10px]">▲</span>
                    <h3 className="text-[10px] text-zinc-500 font-black uppercase tracking-[0.4em]">Market Board</h3>
                  </div>
                  
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 w-full">
                    {gameState.stocks.map((stock, i) => {
                      const diff = stock.history.length > 1 ? stock.price - stock.history[stock.history.length - 2] : 0;
                      const isSelected = selectedStockId === stock.id;
                      const sharesOwned = me?.portfolio[stock.id] || 0;
                      const Icon = STOCK_ICONS[stock.icon] || Activity;
                      
                      return (
                        <motion.button 
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: i * 0.05 }}
                          key={stock.id}
                          onClick={() => setSelectedStockId(stock.id)}
                          className={`relative aspect-[3/4] rounded-[2rem] border-2 transition-all text-left flex flex-col items-center justify-between p-4 group overflow-hidden ${
                            isSelected 
                            ? 'border-white ring-4 ring-white/10' 
                            : 'border-white/5 hover:border-white/20'
                          } bg-gradient-to-br ${stock.cardGradient} ${stock.isInsolvent ? 'opacity-60 grayscale' : ''}`}
                        >
                          {/* Card Aesthetic Elements */}
                          <div className="absolute inset-0 flex items-center justify-center opacity-10 pointer-events-none">
                            <div className="w-[120%] h-[70%] bg-white rounded-[100%] rotate-[-45deg]" />
                          </div>
                          <div className="absolute inset-2 border border-white/10 rounded-[1.5rem] pointer-events-none" />

                          {stock.chairmanId && (
                            <div className="absolute top-3 right-3 z-20 bg-amber-500 text-amber-950 px-2 py-0.5 rounded-full text-[7px] font-black flex items-center gap-1 shadow-lg">
                              👑
                            </div>
                          )}
                          
                          {stock.isInsolvent && (
                            <div className="absolute inset-0 z-30 bg-rose-950/60 backdrop-blur-[2px] flex items-center justify-center">
                              <div className="bg-rose-600 text-white px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest shadow-xl rotate-[-12deg] border-2 border-white/20">
                                INSOLVENT
                              </div>
                            </div>
                          )}

                          <div className="w-full flex justify-between items-start relative z-10">
                            <div className="flex flex-col">
                              <p className="text-[10px] font-black text-white uppercase tracking-tighter leading-none">{stock.id}</p>
                              <p className="text-[7px] font-bold text-white/50 uppercase tracking-tighter truncate max-w-[60px]">{stock.name}</p>
                            </div>
                            <Icon size={12} className="text-white/50" />
                          </div>

                          <div className="flex flex-col items-center gap-1 relative z-10">
                            <div className="w-12 h-12 rounded-full flex items-center justify-center bg-white shadow-xl border-2 border-black/5">
                              <p className="text-xl font-black font-mono text-zinc-900">₹{stock.price}</p>
                            </div>
                            <div className={`mt-1 px-2 py-0.5 rounded-full text-[8px] font-black font-mono ${
                              diff >= 0 ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'
                            }`}>
                              {diff > 0 ? '+' : ''}{diff}
                            </div>
                          </div>

                          <div className="w-full flex justify-between items-end relative z-10">
                            <div className="flex flex-col">
                              <p className="text-[7px] text-white/50 font-black uppercase tracking-widest leading-none">Owned</p>
                              <p className="text-[9px] font-black text-white font-mono">{(sharesOwned/1000).toFixed(0)}K</p>
                            </div>
                            <div className="text-right">
                              <p className="text-[7px] text-white/50 font-black uppercase tracking-widest leading-none">Supply</p>
                              <p className="text-[9px] font-black text-white font-mono">{(stock.availableShares/1000).toFixed(0)}K</p>
                            </div>
                          </div>
                        </motion.button>
                      );
                    })}
                  </div>
                </div>

                {/* Insider Intel / Your Hand */}
                <div className="bg-zinc-900/40 backdrop-blur-xl rounded-[2.5rem] p-6 md:p-8 border border-white/5 shadow-2xl">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-xl bg-orange-500/20 flex items-center justify-center">
                        <Info size={16} className="text-orange-500" />
                      </div>
                      <div>
                        <p className="text-[10px] text-zinc-500 font-black uppercase tracking-[0.2em] mb-0.5">Insider Intel</p>
                        <p className="text-sm font-black uppercase tracking-tight font-display">Your Market Knowledge</p>
                      </div>
                    </div>
                    <span className="text-[8px] bg-orange-500/10 text-orange-500 px-3 py-1 rounded-full font-black uppercase tracking-widest border border-orange-500/20">Confidential</span>
                  </div>
                  
                  <CardHand cards={me?.cards || []} />
                  
                  <div className="text-center mt-4">
                    <p className="text-[8px] text-zinc-600 font-black uppercase tracking-[0.3em]">Hover to inspect cards • Values aggregate at reveal</p>
                  </div>
                </div>

                {/* Trading Actions - Moved here for better mobile flow */}
                <div className="bg-zinc-900/40 backdrop-blur-xl rounded-[2.5rem] p-6 md:p-8 border border-white/5 shadow-2xl">
                  <div className="mb-8">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <p className="text-[10px] text-zinc-500 font-black uppercase tracking-[0.2em] mb-1">Asset Focus</p>
                        <h4 className="text-3xl font-black italic font-display text-white">{currentStock.name}</h4>
                      </div>
                      <div className="bg-white/5 p-3 rounded-2xl border border-white/5">
                        <TrendingUp size={20} className="text-orange-500/50" />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                        <p className="text-[8px] text-zinc-500 font-black uppercase tracking-widest mb-1">Position</p>
                        <p className="text-lg font-black font-mono">{myPortfolio.toLocaleString()}<span className="text-[10px] text-zinc-600 ml-1">SHRS</span></p>
                      </div>
                      <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                        <p className="text-[8px] text-zinc-500 font-black uppercase tracking-widest mb-1">Valuation</p>
                        <p className="text-lg font-black font-mono text-orange-500">₹{currentStock.price}</p>
                      </div>
                      <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                        <p className="text-[8px] text-zinc-500 font-black uppercase tracking-widest mb-1">Market Supply</p>
                        <p className="text-lg font-black font-mono text-zinc-400">{currentStock.availableShares.toLocaleString()}</p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center gap-1 md:gap-2 bg-zinc-800/50 rounded-2xl p-1.5 md:p-2 border border-zinc-700/50">
                      <button 
                        onClick={() => setTradeAmount(Math.max(MIN_BUY_AMOUNT, tradeAmount - 1000))} 
                        className="p-2 md:p-3 hover:bg-zinc-700/50 rounded-xl transition-colors text-zinc-400 hover:text-white flex-none"
                      >
                        <Minus size={16} className="md:w-[18px] md:h-[18px]"/>
                      </button>
                      <input 
                        type="number"
                        step="1000"
                        value={tradeAmount}
                        onChange={(e) => {
                          const val = parseInt(e.target.value);
                          if (!isNaN(val)) setTradeAmount(Math.max(0, val));
                          else if (e.target.value === '') setTradeAmount(0);
                        }}
                        className="flex-1 min-w-0 bg-transparent border-none text-center font-mono font-black text-lg md:text-xl focus:ring-0 text-white p-0"
                      />
                      <button 
                        onClick={() => setTradeAmount(tradeAmount + 1000)} 
                        className="p-2 md:p-3 hover:bg-zinc-700/50 rounded-xl transition-colors text-zinc-400 hover:text-white flex-none"
                      >
                        <Plus size={16} className="md:w-[18px] md:h-[18px]"/>
                      </button>
                    </div>

                    <div className="flex gap-2">
                      <button 
                        onClick={() => {
                          if (me) {
                            const maxAffordable = Math.floor(me.cash / currentStock.price);
                            const maxAvailable = currentStock.availableShares;
                            const maxPossible = Math.min(maxAffordable, maxAvailable);
                            const roundedMax = Math.floor(maxPossible / 1000) * 1000;
                            setTradeAmount(Math.max(MIN_BUY_AMOUNT, roundedMax));
                          }
                        }}
                        className="flex-1 py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 text-[9px] font-black uppercase tracking-[0.2em] text-zinc-400 transition-all"
                      >
                        Max Buy
                      </button>
                      <button 
                        onClick={() => {
                          if (me) setTradeAmount(myPortfolio);
                        }}
                        className="flex-1 py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 text-[9px] font-black uppercase tracking-[0.2em] text-zinc-400 transition-all"
                      >
                        Max Sell
                      </button>
                    </div>

                    {/* Windfall Card Actions */}
                    {isMyTurn && me?.windfallCard && me.windfallCard !== 'SHARE_SUSPENDED' && (
                      <div className="space-y-2 pt-4 border-t border-white/5">
                        <div className="flex items-center gap-2 mb-2">
                          <Zap size={12} className="text-amber-500" />
                          <p className="text-[10px] text-amber-500 font-black uppercase tracking-[0.2em]">Windfall Action Available</p>
                        </div>
                        {me.windfallCard === 'LOAN_STOCK_MATURED' && (
                          <button 
                            onClick={() => sendAction({ type: 'play_windfall', cardType: 'LOAN_STOCK_MATURED' })}
                            className="w-full bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-500 font-black py-3 rounded-xl transition-all text-[10px] flex items-center justify-center gap-2 uppercase tracking-widest"
                          >
                            💰 {WINDFALL_DETAILS.LOAN_STOCK_MATURED.label}
                          </button>
                        )}
                        {me.windfallCard === 'DEBENTURE' && (
                          <button 
                            disabled={!gameState.stocks.some(s => s.isInsolvent && (me.portfolio[s.id] || 0) > 0)}
                            onClick={() => sendAction({ type: 'play_windfall', cardType: 'DEBENTURE' })}
                            className="w-full bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/40 text-blue-500 font-black py-3 rounded-xl transition-all text-[10px] flex items-center justify-center gap-2 disabled:opacity-30 uppercase tracking-widest"
                          >
                            📜 {WINDFALL_DETAILS.DEBENTURE.label}
                          </button>
                        )}
                        {me.windfallCard === 'RIGHTS_ISSUE' && (
                          <button 
                            onClick={() => sendAction({ type: 'play_windfall', cardType: 'RIGHTS_ISSUE', stockId: selectedStockId })}
                            className="w-full bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-500 font-black py-3 rounded-xl transition-all text-[10px] flex items-center justify-center gap-2 uppercase tracking-widest"
                          >
                            📋 {WINDFALL_DETAILS.RIGHTS_ISSUE.label} for {selectedStockId}
                          </button>
                        )}
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-4 pt-2">
                      <button 
                        disabled={!isMyTurn || me!.cash < currentStock.price * tradeAmount || tradeAmount < MIN_BUY_AMOUNT || tradeAmount % 1000 !== 0 || currentStock.availableShares < tradeAmount || currentStock.isInsolvent}
                        onClick={() => sendAction({ type: 'buy', stockId: selectedStockId, amount: tradeAmount })}
                        className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-10 disabled:grayscale text-white font-black py-5 rounded-2xl transition-all uppercase text-xs shadow-xl shadow-emerald-900/20 active:scale-95"
                      >
                        {currentStock.isInsolvent ? 'Insolvent' : 'Execute Buy'}
                      </button>
                      <button 
                        disabled={!isMyTurn || myPortfolio < tradeAmount || tradeAmount <= 0 || tradeAmount % 1000 !== 0 || currentStock.isInsolvent}
                        onClick={() => sendAction({ type: 'sell', stockId: selectedStockId, amount: tradeAmount })}
                        className="bg-rose-600 hover:bg-rose-500 disabled:opacity-10 disabled:grayscale text-white font-black py-5 rounded-2xl transition-all uppercase text-xs shadow-xl shadow-rose-900/20 active:scale-95"
                      >
                        {currentStock.isInsolvent ? 'Insolvent' : 'Execute Sell'}
                      </button>
                    </div>
                    {currentStock.availableShares < tradeAmount && (
                      <p className="text-[10px] text-rose-500 font-bold text-center uppercase tracking-widest animate-pulse">
                        Market Cap Reached (Max 2,00,000 Shares)
                      </p>
                    )}
                    <button 
                      disabled={!isMyTurn}
                      onClick={() => sendAction({ type: 'pass' })}
                      className="w-full bg-zinc-800 hover:bg-zinc-700 disabled:opacity-30 text-zinc-400 font-black py-4 rounded-2xl transition-all uppercase text-[9px] tracking-[0.3em] border border-white/5"
                    >
                      Hold Position / Pass
                    </button>
                  </div>
                </div>
              </div>

              {/* Sidebar Info */}
              <div className="lg:col-span-4 space-y-6">
                <div className="bg-zinc-900/40 backdrop-blur-xl rounded-[2.5rem] p-8 border border-white/5 shadow-2xl sticky top-28">
                  <div className="bg-white/5 p-5 rounded-2xl border border-white/5">
                    <div className="flex justify-between items-center mb-1">
                      <p className="text-[10px] text-zinc-500 font-black uppercase tracking-[0.2em]">Portfolio Value</p>
                      <Wallet size={14} className="text-orange-500/50" />
                    </div>
                    <p className="text-3xl font-black font-mono text-white">₹{totalPortfolioValue.toLocaleString()}</p>
                    <div className="flex justify-between items-center mt-2 pt-2 border-t border-white/5">
                      <p className="text-[8px] text-zinc-600 font-black uppercase tracking-widest">Net Worth</p>
                      <p className="text-xs font-black font-mono text-orange-500">₹{((me?.cash || 0) + totalPortfolioValue).toLocaleString()}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* Reveal Phase */
            <div className="space-y-12 py-12">
              <div className="text-center space-y-4">
                <motion.div
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="inline-block bg-orange-500/10 border border-orange-500/20 px-6 py-2 rounded-full mb-2"
                >
                  <span className="text-xs font-black uppercase tracking-[0.4em] text-orange-500">Market Correction Phase</span>
                </motion.div>
                <h2 className="text-7xl font-black italic text-white uppercase tracking-tighter font-display leading-none">THE REVEAL</h2>
                <p className="text-zinc-500 font-mono text-xs uppercase tracking-[0.5em]">Aggregating Global Insider Data</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {gameState.revealSteps?.map((step, i) => {
                  const stock = STOCKS.find(s => s.id === step.stockId)!;
                  const Icon = STOCK_ICONS[stock.icon] || Activity;
                  return (
                    <motion.div 
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.1 }}
                      key={step.stockId} 
                      className={`relative rounded-[2.5rem] border-2 p-6 transition-all text-left flex flex-col justify-between overflow-hidden bg-gradient-to-br ${stock.cardGradient} border-white/10 shadow-2xl`}
                    >
                      {/* Card Aesthetic Elements */}
                      <div className="absolute inset-0 flex items-center justify-center opacity-10 pointer-events-none">
                        <div className="w-[120%] h-[70%] bg-white rounded-[100%] rotate-[-45deg]" />
                      </div>
                      <div className="absolute inset-2 border border-white/10 rounded-[1.5rem] pointer-events-none" />

                      <div className="flex items-center gap-3 mb-6 relative z-10">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-white/20 border border-white/20">
                          <Icon size={20} className="text-white" />
                        </div>
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-widest leading-none mb-1 text-white/70">{stock.id}</p>
                          <h4 className="text-lg font-black italic font-display leading-none text-white">{stock.name}</h4>
                        </div>
                      </div>
                      
                      <div className="space-y-2 relative z-10">
                        {step.originalCards.map((card, idx) => {
                          const player = gameState.players.find(p => p.id === card.playerId);
                          const isVetoed = step.vetoedCard === card;
                          const isDiscarded = step.directorDiscarded === card;
                          
                          return (
                            <div key={idx} className={`flex justify-between items-center text-[9px] font-mono p-1.5 rounded-lg border ${
                              isVetoed ? 'bg-rose-500/40 border-rose-500/60 line-through opacity-50' : 
                              isDiscarded ? 'bg-amber-500/40 border-amber-500/60 line-through opacity-50' : 
                              'bg-black/20 border-white/5'
                            }`}>
                              <span className="text-white/70 font-bold uppercase tracking-tighter truncate max-w-[80px]">
                                {player?.name}
                              </span>
                              <span className={`font-black ${card.value >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {card.value > 0 ? '+' : ''}{card.value}
                              </span>
                            </div>
                          );
                        })}

                        {step.recovered && (
                          <div className="bg-emerald-500/40 border border-emerald-500/60 p-1.5 rounded-lg text-center mt-2">
                            <p className="text-[8px] font-black text-white uppercase tracking-widest">RECOVERED</p>
                          </div>
                        )}

                        {step.becameInsolvent && (
                          <div className="bg-rose-500/40 border border-rose-500/60 p-1.5 rounded-lg text-center mt-2">
                            <p className="text-[8px] font-black text-white uppercase tracking-widest">INSOLVENT</p>
                          </div>
                        )}

                        <div className="pt-4 mt-4 border-t border-white/20 flex justify-between items-end">
                          <div>
                            <p className="text-[7px] text-white/50 font-black uppercase tracking-widest mb-1">Shift</p>
                            <span className={`text-3xl font-black font-display italic ${step.finalChange >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {step.finalChange > 0 ? '+' : ''}{step.finalChange}
                            </span>
                          </div>
                          <div className="text-right">
                            <p className="text-[7px] text-white/50 font-black uppercase tracking-widest mb-1">Price</p>
                            <p className="text-lg font-black font-mono text-white">₹{step.newPrice}</p>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>

              {/* Windfall Action for Reveal Phase */}
              {me?.windfallCard === 'SHARE_SUSPENDED' && gameState.status === 'reveal' && (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex flex-col items-center gap-6 p-8 bg-amber-500/5 border border-amber-500/20 rounded-[3rem] max-w-4xl mx-auto mt-12"
                >
                   <div className="flex items-center gap-3">
                     <div className="w-10 h-10 bg-amber-500/20 rounded-xl flex items-center justify-center">
                       <Zap size={20} className="text-amber-500" />
                     </div>
                     <div>
                       <p className="text-[10px] text-amber-500 font-black uppercase tracking-[0.3em] mb-1">Windfall Action Available</p>
                       <h3 className="text-xl font-black italic uppercase tracking-tighter text-white">Play Share Suspended</h3>
                     </div>
                   </div>
                   <div className="flex flex-wrap justify-center gap-3">
                     {gameState.stocks.map(stock => (
                       <button
                         key={stock.id}
                         onClick={() => sendAction({ type: 'play_windfall', cardType: 'SHARE_SUSPENDED', stockId: stock.id })}
                         className="bg-zinc-800 hover:bg-zinc-700 text-white px-6 py-3 rounded-2xl text-[10px] font-black border border-white/10 transition-all hover:scale-105 active:scale-95 uppercase tracking-widest"
                       >
                         🔒 Suspend {stock.id}
                       </button>
                     ))}
                   </div>
                   <p className="text-[9px] text-zinc-500 font-mono uppercase tracking-widest">Reverts price to start of turn • Must be used now or discarded</p>
                </motion.div>
              )}

              {isHost && (
                <div className="flex justify-center pt-12">
                  <button 
                    onClick={handleRevealNext}
                    className="bg-zinc-100 hover:bg-white text-zinc-950 font-black px-16 py-6 rounded-[2rem] shadow-2xl transition-all flex items-center gap-4 group scale-100 hover:scale-105 active:scale-95"
                  >
                    {(!gameState.revealSteps || gameState.revealSteps.length === 0) ? (
                      <>REVEAL MARKET <Zap size={18} fill="currentColor" /></>
                    ) : (
                      <>NEXT TRADING CYCLE <ArrowRight className="group-hover:translate-x-2 transition-transform" /></>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Leaderboard */}
        <div className="p-4 bg-zinc-900/40 border-t border-white/5 backdrop-blur-xl">
          <div className="max-w-6xl mx-auto">
            <div className="flex items-center gap-2 mb-4 px-1">
              <div className="w-1.5 h-1.5 rounded-full bg-orange-500" />
              <p className="text-[9px] text-zinc-500 font-black uppercase tracking-[0.3em]">Live Standing / Net Worth Valuation</p>
            </div>
            <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
              {gameState.players
                .map(p => {
                  const portfolioValue = Object.entries(p.portfolio).reduce((sum: number, [id, amt]) => {
                    const price = gameState.stocks.find(s => s.id === id)?.price || 0;
                    return sum + (price * (amt as number));
                  }, 0);
                  return { ...p, netWorth: p.cash + portfolioValue };
                })
                .sort((a, b) => b.netWorth - a.netWorth)
                .map((p, i) => (
                  <motion.div 
                    layout
                    key={p.id} 
                    className={`flex-shrink-0 px-6 py-3 rounded-2xl border flex items-center gap-4 transition-all ${
                      i === 0 
                      ? 'bg-orange-500/10 border-orange-500/30' 
                      : 'bg-white/5 border-white/5'
                    }`}
                  >
                    <span className={`text-sm font-black italic font-display ${i === 0 ? 'text-orange-500' : 'text-zinc-600'}`}>#{i + 1}</span>
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-tight leading-none mb-1">{p.name}</p>
                      <p className="text-sm font-black font-mono text-zinc-100">₹{p.netWorth.toLocaleString()}</p>
                    </div>
                  </motion.div>
                ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (gameState.status === 'ended') {
    const leaderboard = gameState.players
      .map(p => {
        const portfolioValue = Object.entries(p.portfolio).reduce((sum: number, [id, amt]) => {
          const price = gameState.stocks.find(s => s.id === id)?.price || 0;
          return sum + (price * (amt as number));
        }, 0);
        return { ...p, netWorth: p.cash + portfolioValue };
      })
      .sort((a, b) => b.netWorth - a.netWorth);

    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6 flex flex-col items-center justify-center font-sans">
        <LandscapeOverlay />
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-lg space-y-8"
        >
          <div className="text-center space-y-4">
            <Trophy size={80} className="mx-auto text-orange-500 drop-shadow-[0_0_20px_rgba(249,115,22,0.4)]" />
            <h1 className="text-6xl font-black italic uppercase tracking-tighter">Game Over</h1>
            <p className="text-zinc-500 font-mono tracking-[0.3em] uppercase">Final Standings</p>
          </div>

          <div className="bg-zinc-900 rounded-3xl border border-zinc-800 overflow-hidden shadow-2xl">
            {leaderboard.map((p, i) => (
              <div key={p.id} className={`p-6 flex justify-between items-center ${i === 0 ? 'bg-orange-500/10 border-b border-orange-500/20' : 'border-b border-zinc-800/50'}`}>
                <div className="flex items-center gap-4">
                  <span className={`text-2xl font-black italic ${i === 0 ? 'text-orange-500' : 'text-zinc-600'}`}>0{i + 1}</span>
                  <div>
                    <h3 className="text-xl font-black italic">{p.name}</h3>
                    <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">Portfolio King</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-black text-zinc-100">₹{p.netWorth.toLocaleString()}</p>
                  <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">Net Worth</p>
                </div>
              </div>
            ))}
          </div>

          <button 
            onClick={() => window.location.reload()}
            className="w-full bg-zinc-100 hover:bg-white text-zinc-950 font-black py-5 rounded-2xl transition-all uppercase tracking-widest shadow-xl"
          >
            Play Again
          </button>
        </motion.div>
      </div>
    );
  }

  return null;
}
