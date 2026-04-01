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

const STOCKS = [
  { id: 'WOCKHARDT', name: 'Wockhardt', icon: 'Activity', initialPrice: 20 },
  { id: 'HDFCBANK', name: 'HDFC Bank', icon: 'Landmark', initialPrice: 25 },
  { id: 'TATA', name: 'TATA Motors', icon: 'Zap', initialPrice: 30 },
  { id: 'ITC', name: 'ITC', icon: 'Flame', initialPrice: 40 },
  { id: 'ONGC', name: 'ONGC', icon: 'Droplets', initialPrice: 55 },
  { id: 'SBIN', name: 'State Bank of India', icon: 'Building2', initialPrice: 60 },
  { id: 'RELIANCE', name: 'Reliance Industries', icon: 'Zap', initialPrice: 75 },
  { id: 'INFY', name: 'Infosys', icon: 'Cpu', initialPrice: 80 },
];

// --- Types ---
type Stock = {
  id: string;
  name: string;
  price: number;
  history: number[];
  icon: string;
  availableShares: number;
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
  isHost: boolean;
  isReady: boolean;
  lastAction?: string;
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

const processAction = (state: GameState, playerId: string, action: any): GameState => {
  const newState = JSON.parse(JSON.stringify(state)) as GameState;
  const player = newState.players.find(p => p.id === playerId);
  if (!player) return state;

  if (action.type === 'buy') {
    const stock = newState.stocks.find(s => s.id === action.stockId);
    if (stock && 
        player.cash >= stock.price * action.amount && 
        action.amount >= MIN_BUY_AMOUNT && 
        action.amount % 1000 === 0 &&
        stock.availableShares >= action.amount) {
      player.cash -= stock.price * action.amount;
      player.portfolio[action.stockId] = (player.portfolio[action.stockId] || 0) + action.amount;
      stock.availableShares -= action.amount;
      player.lastAction = `Bought ${action.amount} ${stock.id}`;
    }
  } else if (action.type === 'sell') {
    const stock = newState.stocks.find(s => s.id === action.stockId);
    const owned = player.portfolio[action.stockId] || 0;
    if (stock && owned >= action.amount && action.amount % 1000 === 0) {
      player.cash += stock.price * action.amount;
      player.portfolio[action.stockId] = owned - action.amount;
      stock.availableShares += action.amount;
      player.lastAction = `Sold ${action.amount} ${stock.id}`;
    }
  } else if (action.type === 'pass') {
    player.lastAction = 'Passed';
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

const calculateNewPrices = (state: GameState): GameState => {
  const newState = JSON.parse(JSON.stringify(state)) as GameState;
  
  newState.stocks.forEach(stock => {
    const totalChange = newState.players.reduce((sum, p) => {
      const playerStockSum = p.cards
        .filter(c => c.stockId === stock.id)
        .reduce((s, c) => s + c.value, 0);
      return sum + playerStockSum;
    }, 0);
    stock.price = Math.max(MIN_STOCK_PRICE, stock.price + totalChange);
    stock.history.push(stock.price);
  });

  // Reset for next turn
  newState.turnActionsCount = 0;
  newState.currentPlayerIndex = 0;
  newState.players.forEach(p => {
    p.lastAction = undefined;
    p.cards = generateCards(); // New cards for next turn
  });

  newState.turn += 1;
  if (newState.turn > TURNS_PER_ROUND) {
    newState.turn = 1;
    newState.round += 1;
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

const GameCardUI: React.FC<{ card: GameCard, index: number, total: number }> = ({ card, index, total }) => {
  const rotation = (index - (total - 1) / 2) * 8;
  const yOffset = Math.abs(index - (total - 1) / 2) * 6;
  
  const stock = STOCKS.find(s => s.id === card.stockId);
  const Icon = STOCK_ICONS[stock?.icon || 'Activity'] || Activity;

  return (
    <motion.div
      initial={{ y: 100, opacity: 0, rotate: 0 }}
      animate={{ 
        y: yOffset, 
        opacity: 1, 
        rotate: rotation,
        transition: { delay: index * 0.05, type: 'spring', stiffness: 100 }
      }}
      whileHover={{ 
        y: yOffset - 60, 
        scale: 1.2, 
        zIndex: 100,
        transition: { type: 'spring', stiffness: 300 }
      }}
      className={`relative w-24 h-36 rounded-2xl border-2 shadow-2xl flex flex-col items-center justify-between p-3 cursor-pointer overflow-hidden group ${
        card.value >= 0 
          ? 'bg-gradient-to-br from-emerald-600 to-emerald-900 border-emerald-400/30' 
          : 'bg-gradient-to-br from-rose-600 to-rose-900 border-rose-400/30'
      }`}
      style={{ 
        transformOrigin: 'bottom center',
        marginLeft: index === 0 ? 0 : -65
      }}
    >
      {/* Uno-style oval background */}
      <div className="absolute inset-0 flex items-center justify-center opacity-20 pointer-events-none">
        <div className="w-[120%] h-[70%] bg-white rounded-[100%] rotate-[-45deg]" />
      </div>

      <div className="w-full flex justify-between items-start relative z-10">
        <span className="text-xs font-black font-mono text-white drop-shadow-md">
          {card.value > 0 ? '+' : ''}{card.value}
        </span>
        <Icon size={10} className="text-white/50" />
      </div>

      <div className="flex flex-col items-center gap-1 relative z-10">
        <div className="w-12 h-12 rounded-full flex items-center justify-center bg-white shadow-xl">
          <span className={`text-2xl font-black font-mono ${card.value >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
            {Math.abs(card.value)}
          </span>
        </div>
        <p className="text-[8px] font-black text-white uppercase tracking-tighter drop-shadow-md">{stock?.id}</p>
      </div>

      <div className="w-full flex justify-between items-end relative z-10">
        <Icon size={10} className="text-white/50" />
        <span className="text-xs font-black font-mono text-white drop-shadow-md">
          {card.value > 0 ? '+' : ''}{card.value}
        </span>
      </div>
      
      {/* Inner border */}
      <div className="absolute inset-2 border border-white/20 rounded-xl pointer-events-none" />
    </motion.div>
  );
};

const CardHand = ({ cards }: { cards: GameCard[] }) => {
  return (
    <div className="flex justify-center items-end h-56 px-12 mt-8 mb-4">
      {cards.map((card, i) => (
        <GameCardUI key={i} card={card} index={i} total={cards.length} />
      ))}
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
  const [myId, setMyId] = useState('');
  const [error, setError] = useState('');

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
          cards: {},
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
    if (!isHost || !socket || !gameState) return;

    const handleAction = ({ playerId, action }: { playerId: string, action: any }) => {
      const nextState = processAction(gameState, playerId, action);
      socket.emit('state_update', { roomId: gameState.roomId, state: nextState });
    };

    socket.on('action_received', handleAction);
    return () => {
      socket.off('action_received', handleAction);
    };
  }, [isHost, socket, gameState]);

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
    const initialState: GameState = {
      ...gameState,
      status: 'playing',
      roomId,
      maxRounds,
      stocks: STOCKS.map(s => ({ 
        id: s.id, 
        name: s.name, 
        icon: s.icon, 
        price: s.initialPrice, 
        history: [s.initialPrice],
        availableShares: MARKET_CAP_PER_STOCK
      })),
      players: gameState.players.map(p => ({
        ...p,
        cash: INITIAL_CASH,
        portfolio: {},
        cards: generateCards()
      })),
      round: 1,
      turn: 1,
      currentPlayerIndex: 0,
      turnActionsCount: 0
    };
    socket?.emit('start_game', { roomId, initialState });
  };

  const sendAction = (action: any) => {
    if (!isMyTurn) return;
    socket?.emit('action', { roomId: gameState?.roomId, action });
  };

  const handleRevealNext = () => {
    if (!isHost || !gameState) return;
    const nextState = calculateNewPrices(gameState);
    socket?.emit('state_update', { roomId: gameState.roomId, state: nextState });
  };

  // --- UI Components ---

  if (!gameState || gameState.status === 'setup') {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center p-6 font-sans selection:bg-orange-500/30 overflow-hidden">
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
        <TickerBackground />
        
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
              {/* Stock List */}
              <div className="lg:col-span-8 space-y-6">
                <div className="flex justify-between items-center px-1">
                  <h3 className="text-[10px] text-zinc-500 font-black uppercase tracking-[0.3em]">Global Exchange</h3>
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-[9px] text-zinc-500 font-black uppercase tracking-widest">Live Feed</span>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {gameState.stocks.map((stock, i) => {
                    const diff = stock.history.length > 1 ? stock.price - stock.history[stock.history.length - 2] : 0;
                    const isSelected = selectedStockId === stock.id;
                    return (
                      <motion.button 
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: i * 0.05 }}
                        key={stock.id}
                        onClick={() => setSelectedStockId(stock.id)}
                        className={`p-4 md:p-6 rounded-[2rem] border transition-all text-left flex justify-between items-center group relative overflow-hidden ${
                          isSelected 
                          ? 'bg-orange-500/10 border-orange-500/40 shadow-lg shadow-orange-900/10' 
                          : 'bg-white/5 border-white/5 hover:border-white/10 hover:bg-white/[0.07]'
                        }`}
                      >
                        {isSelected && (
                          <motion.div 
                            layoutId="activeStock"
                            className="absolute inset-0 bg-gradient-to-br from-orange-500/5 to-transparent pointer-events-none"
                          />
                        )}
                        <div className="relative z-10 flex items-center gap-3 md:gap-4">
                          <div className="w-10 h-10 md:w-12 md:h-12 rounded-2xl bg-white flex items-center justify-center shadow-inner overflow-hidden flex-none">
                            {(() => {
                              const Icon = STOCK_ICONS[stock.icon] || Activity;
                              return <Icon className="w-5 h-5 md:w-6 md:h-6 text-zinc-900" />;
                            })()}
                          </div>
                          <div className="min-w-0">
                            <p className={`text-[9px] md:text-[10px] font-black uppercase tracking-widest mb-0.5 md:mb-1 ${isSelected ? 'text-orange-500' : 'text-zinc-600'}`}>{stock.id}</p>
                            <p className="font-black text-base md:text-lg italic font-display tracking-tight leading-none truncate">{stock.name}</p>
                          </div>
                        </div>
                        <div className="text-right relative z-10 flex-none ml-2">
                          <p className="text-xl md:text-2xl font-black font-mono">₹{stock.price}</p>
                          <div className={`flex items-center justify-end gap-1 text-[9px] md:text-[10px] font-black font-mono ${diff >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                            {diff >= 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                            {diff > 0 ? '+' : ''}{diff}
                          </div>
                        </div>
                      </motion.button>
                    );
                  })}
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

                    <div className="grid grid-cols-2 gap-4 pt-2">
                      <button 
                        disabled={!isMyTurn || me!.cash < currentStock.price * tradeAmount || tradeAmount < MIN_BUY_AMOUNT || tradeAmount % 1000 !== 0 || currentStock.availableShares < tradeAmount}
                        onClick={() => sendAction({ type: 'buy', stockId: selectedStockId, amount: tradeAmount })}
                        className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-10 disabled:grayscale text-white font-black py-5 rounded-2xl transition-all uppercase text-xs shadow-xl shadow-emerald-900/20 active:scale-95"
                      >
                        Execute Buy
                      </button>
                      <button 
                        disabled={!isMyTurn || myPortfolio < tradeAmount || tradeAmount <= 0 || tradeAmount % 1000 !== 0}
                        onClick={() => sendAction({ type: 'sell', stockId: selectedStockId, amount: tradeAmount })}
                        className="bg-rose-600 hover:bg-rose-500 disabled:opacity-10 disabled:grayscale text-white font-black py-5 rounded-2xl transition-all uppercase text-xs shadow-xl shadow-rose-900/20 active:scale-95"
                      >
                        Execute Sell
                      </button>
                    </div>
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
                {gameState.stocks.map((stock, i) => {
                  const totalChange = gameState.players.reduce((sum, p) => {
                    const playerStockSum = p.cards
                      .filter(c => c.stockId === stock.id)
                      .reduce((s, c) => s + c.value, 0);
                    return sum + playerStockSum;
                  }, 0);
                  return (
                    <motion.div 
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.1 }}
                      key={stock.id} 
                      className="bg-zinc-900/40 backdrop-blur-xl p-8 rounded-[2.5rem] border border-white/5 shadow-2xl relative overflow-hidden group"
                    >
                      <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:opacity-20 transition-opacity">
                        <TrendingUp size={60} className={totalChange >= 0 ? 'text-emerald-500' : 'text-rose-500'} />
                      </div>
                      
                      <div className="flex items-center gap-3 mb-6">
                        <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center shadow-inner overflow-hidden">
                          {(() => {
                            const Icon = STOCK_ICONS[stock.icon] || Activity;
                            return <Icon className="w-5 h-5 text-zinc-900" />;
                          })()}
                        </div>
                        <div>
                          <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest leading-none mb-1">{stock.id}</p>
                          <h4 className="text-xl font-black italic font-display leading-none">{stock.name}</h4>
                        </div>
                      </div>
                      
                      <div className="space-y-3">
                        {gameState.players.map(p => {
                          const playerStockSum = p.cards
                            .filter(c => c.stockId === stock.id)
                            .reduce((s, c) => s + c.value, 0);
                          return (
                            <div key={p.id} className="flex justify-between items-center text-[10px] font-mono bg-white/5 p-2 rounded-xl border border-white/5">
                              <span className="text-zinc-500 font-bold uppercase tracking-tighter">{p.name}</span>
                              <span className={`font-black ${playerStockSum >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                                {playerStockSum > 0 ? '+' : ''}{playerStockSum}
                              </span>
                            </div>
                          );
                        })}
                        <div className="pt-6 mt-4 border-t border-white/5 flex justify-between items-end">
                          <div>
                            <p className="text-[8px] text-zinc-600 font-black uppercase tracking-widest mb-1">Net Price Shift</p>
                            <span className={`text-4xl font-black font-display italic ${totalChange >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                              {totalChange > 0 ? '+' : ''}{totalChange}
                            </span>
                          </div>
                          <div className="text-right">
                            <p className="text-[8px] text-zinc-600 font-black uppercase tracking-widest mb-1">New Price</p>
                            <p className="text-xl font-black font-mono">₹{stock.price}</p>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>

              {isHost && (
                <div className="flex justify-center pt-12">
                  <button 
                    onClick={handleRevealNext}
                    className="bg-zinc-100 hover:bg-white text-zinc-950 font-black px-16 py-6 rounded-[2rem] shadow-2xl transition-all flex items-center gap-4 group scale-100 hover:scale-105 active:scale-95"
                  >
                    NEXT TRADING CYCLE <ArrowRight className="group-hover:translate-x-2 transition-transform" />
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
