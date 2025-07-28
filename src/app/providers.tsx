'use client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider, createConfig, http } from 'wagmi';
import { defineChain } from 'viem';
import React from 'react';

export const monad = defineChain({
  id: 8008135,
  name: 'Monad Testnet',
  nativeCurrency: {
    decimals: 18,
    name: 'MON',
    symbol: 'MON',
  },
  rpcUrls: {
    default: {
      http: ['https://testnet-rpc.monad.xyz/'], 
    },
  },
  blockExplorers: {
    default: { name: 'Monad Explorer', url: 'https://testnet.monad.xyz' },
  },
});

const config = createConfig({
  chains: [monad],
  transports: {
    [monad.id]: http(),
  },
});

const queryClient = new QueryClient();

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  );
}