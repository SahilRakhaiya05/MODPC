/* eslint-disable @typescript-eslint/no-explicit-any */
import { createTRPCProxyClient, httpBatchLink } from '@trpc/client';
import type { AiChatRequest, AiChatResponse } from '../../shared/api';

type TrpcProxy = {
  sentinel: {
    ask: {
      mutate: (payload: AiChatRequest) => Promise<AiChatResponse>;
    };
  };
};

const rawTrpc: any = createTRPCProxyClient<any>({
  links: [
    httpBatchLink({
      url: '/trpc',
    }),
  ],
});

export const trpc: TrpcProxy = rawTrpc;
