'use client';

import { useEffect, useState } from 'react';
import {
  useAccount,
  useConnect,
  useDisconnect,
  useWaitForTransactionReceipt,
  useWriteContract,
} from 'wagmi';
import { injected } from 'wagmi/connectors';
import {
  createPublicClient,
  http,
  decodeEventLog,
  defineChain,
} from 'viem';
import CoinflipV2Abi from '../contracts/CoinflipV2.json';

import { createMultisynq } from 'multisynq-sdk';

const monad = defineChain({
  id: 10143,
  name: 'Monad Testnet',
  nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc.ankr.com/monad_testnet'] },
    public: { http: ['https://rpc.ankr.com/monad_testnet'] },
  },
});

const client = createPublicClient({
  chain: monad,
  transport: http(),
});

const contractAddress = '0xa88cbABB0a977dC35Af8b99aBe16af8b4B8EA620';
const abi = CoinflipV2Abi.abi;

export default function Home() {
  const { address, isConnected } = useAccount();
  const { connect } = useConnect();
  const { disconnect } = useDisconnect();
  const { data: hash, writeContract, reset } = useWriteContract();
  const [uiState, setUiState] = useState<'lobby' | 'waiting' | 'joined' | 'choose' | 'waiting_choice' | 'result'>('lobby');
  const [gameId, setGameId] = useState<string | null>(null);
  const [winnerInfo, setWinnerInfo] = useState<string | null>(null);
  const [openGames, setOpenGames] = useState<bigint[]>([]);
  const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const pollMultisynq = async () => {
      try {
        const res = await fetch('https://sync.multisynq.io/events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            address: contractAddress,
            event: 'GameResolved',
            fromBlock: 'latest',
            limit: 1
          })
        });
        const data = await res.json();
        console.log('[Multisynq] Latest GameResolved:', data);
      } catch (e) {
        console.error('[Multisynq] Failed to fetch events:', e);
      }
    };
    pollMultisynq();
  }, []);

  const fetchOpenGames = async () => {
    try {
      const result = await client.readContract({
        address: contractAddress,
        abi,
        functionName: 'getOpenGames',
        args: [],
      });
      setOpenGames(result as bigint[]);
    } catch (err) {
      console.error('Failed to fetch open games:', err);
    }
  };

  useEffect(() => {
    fetchOpenGames();
  }, [uiState]);

  const receipt = useWaitForTransactionReceipt({ hash });

  useEffect(() => {
    const run = async () => {
      if (!receipt.data || !receipt.data.logs) return;
      for (const log of receipt.data.logs) {
        try {
          const decoded = decodeEventLog({ abi, ...log });
          if (decoded.eventName === 'GameCreated') {
            const id = (decoded.args as any).gameId.toString();
            setGameId(id);
            setUiState('waiting');
          }
          if (decoded.eventName === 'GameResolved') {
            const { gameId: resolvedId, winner, winningChoice } = decoded.args as unknown as {
              gameId: bigint;
              winner: string;
              winningChoice: bigint;
            };
            if (resolvedId.toString() === gameId) {
              const choice = winningChoice === 1n ? 'White' : 'Black';
              if (winner === '0x0000000000000000000000000000000000000000') {
                setWinnerInfo('Draw! Bets returned.');
              } else {
                setWinnerInfo(`Winner: ${choice} — ${winner.slice(0, 6)}...`);
              }
              clearInterval(pollingInterval!);
              setUiState('result');
            }
          }
        } catch (e) {
          continue;
        }
      }
    };
    run();
  }, [receipt.data]);

  const checkPlayersReady = async () => {
    if (!gameId) return;
    try {
      const result: any = await client.readContract({
        address: contractAddress,
        abi,
        functionName: 'games',
        args: [BigInt(gameId)],
      });

      const [player1, player2, , , resolved] = result;
      const bothJoined =
        player1 !== '0x0000000000000000000000000000000000000000' &&
        player2 !== '0x0000000000000000000000000000000000000000';

      if (resolved) {
        setUiState('result');
        clearInterval(pollingInterval!);
        return;
      }

      if (bothJoined && uiState !== 'choose' && uiState !== 'waiting_choice') {
        setUiState('choose');
      }
    } catch (err) {
      console.error('Error checking players:', err);
    }
  };

  useEffect(() => {
    if ((uiState === 'waiting' || uiState === 'joined' || uiState === 'waiting_choice') && gameId) {
      const interval = setInterval(checkPlayersReady, 3000);
      setPollingInterval(interval);
      return () => clearInterval(interval);
    }
  }, [uiState, gameId]);

  function createGame() {
    reset();
    writeContract({
      address: contractAddress,
      abi,
      functionName: 'createGame',
      value: BigInt('10000000000000000'),
      args: [],
    });
  }

  function joinGame(id: string) {
    reset();
    setGameId(id);
    setUiState('joined');
    writeContract({
      address: contractAddress,
      abi,
      functionName: 'joinGame',
      args: [BigInt(id)],
      value: BigInt('10000000000000000'),
    });
  }

  function makeChoice(choice: 1 | 2) {
    reset();
    setUiState('waiting_choice');
    writeContract({
      address: contractAddress,
      abi,
      functionName: 'makeChoice',
      args: [BigInt(gameId!), choice],
    });
  }

  return (
    <main className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-black via-[#0b0f16] to-black text-white p-8">
      <header className="w-full flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold tracking-wide">BlaWhiMonad</h1>
        {!isConnected ? (
          <button onClick={() => connect({ connector: injected() })} className="bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded">
            Connect Wallet
          </button>
        ) : (
          <div className="text-right text-sm leading-tight">
            <p className="font-mono">{address?.slice(0, 6)}...{address?.slice(-4)}</p>
            <p className="text-xs text-purple-300 italic">Future Whale</p>
          </div>
        )}
      </header>

      <p className="mb-6 text-center text-lg text-gray-300 max-w-xl">Choose your Monad. Will light or shadow guide your fate?</p>

      {uiState === 'lobby' && (
        <div className="flex flex-col gap-4 items-center">
          <button onClick={createGame} className="bg-green-600 hover:bg-green-700 px-6 py-3 rounded text-lg">Create Game</button>
          <h2 className="text-xl">Or join existing game:</h2>
          <div className="flex flex-col gap-2">
            {openGames.length > 0 ? openGames.map(id => (
              <button key={id.toString()} onClick={() => joinGame(id.toString())} className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded">
                Join Game #{id.toString()}
              </button>
            )) : <p>No open games</p>}
          </div>
        </div>
      )}

      {uiState === 'waiting' && <p>Waiting for opponent to join... Share game ID: {gameId}</p>}
      {uiState === 'joined' && <p>Game #{gameId} joined. Waiting for confirmation...</p>}

      {uiState === 'choose' && (
        <div className="flex gap-10 mt-8">
          <button onClick={() => makeChoice(1)}>
            <img src="/whitemonad.jpg" alt="White" className="w-52 hover:scale-105 transition-transform duration-300" />
          </button>
          <button onClick={() => makeChoice(2)}>
            <img src="/blackmonad.jpg" alt="Black" className="w-52 hover:scale-105 transition-transform duration-300" />
          </button>
        </div>
      )}

      {uiState === 'waiting_choice' && <p>Waiting for other player's choice...</p>}

      {uiState === 'result' && (
        <div className="text-center mt-6 animate-fade-in">
          <p className="text-2xl font-semibold mb-4">{winnerInfo}</p>
          <p className="text-lg text-purple-400">Today, fate favored this Monad.</p>
          <button onClick={() => {
            setUiState('lobby');
            setGameId(null);
            setWinnerInfo(null);
            fetchOpenGames();
          }} className="mt-4 px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded">Play Again</button>
        </div>
      )}
    </main>
  );
}
