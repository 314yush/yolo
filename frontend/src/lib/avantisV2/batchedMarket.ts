/**
 * Batched-market client: POST /market/execute-batched (SSE lifecycle).
 */

import { getAvantisV2Config } from './config';
import type { Hex } from 'viem';

export type BatchedMarketEvent = {
  type: string;
  data: Record<string, unknown>;
  seq: number | null;
};

export type BatchedMarketOutcome = {
  trackingId: string;
  txHash: `0x${string}` | null;
  orderId: number | null;
  terminal: BatchedMarketEvent | null;
  events: BatchedMarketEvent[];
};

const ACCEPTED = 'MarketOrderAccepted';
const TERMINAL_SUCCESS = new Set(['MarketOrderExecuted', 'PositionSizeIncreased']);
const TERMINAL_FAILURE = new Set(['MarketOrderCanceled', 'Error']);

function baseUrl(): string {
  return getAvantisV2Config().batchedMarketUrl.replace(/\/$/, '');
}

export async function executeBatchedMarket(params: {
  orderType: number;
  userIntent: Hex;
  userSignature: Hex;
  wait?: boolean;
  timeoutMs?: number;
}): Promise<BatchedMarketOutcome> {
  const wait = params.wait !== false;
  const timeoutMs = params.timeoutMs ?? 90_000;
  const url = `${baseUrl()}/market/execute-batched`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'text/event-stream',
    },
    body: JSON.stringify({
      orderType: params.orderType,
      erc712: {
        userIntent: params.userIntent,
        userSignature: params.userSignature,
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`batched-market rejected (${res.status}): ${text.slice(0, 300)}`);
  }
  if (!res.body) {
    throw new Error('batched-market response missing body stream');
  }

  const events: BatchedMarketEvent[] = [];
  let trackingId = '';
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const deadline = Date.now() + timeoutMs;

  const settle = (terminal: BatchedMarketEvent): BatchedMarketOutcome => {
    if (terminal.type === 'MarketOrderCanceled') {
      throw new Error(
        `Order canceled by protocol (e.g. slippage): ${JSON.stringify(terminal.data)}`
      );
    }
    if (terminal.type === 'Error') {
      throw new Error(
        `batched-market execution failed: ${String(terminal.data.message ?? JSON.stringify(terminal.data))}`
      );
    }
    return {
      trackingId,
      txHash: extractTxHash(events),
      orderId: extractOrderId(events),
      terminal,
      events,
    };
  };

  while (Date.now() < deadline) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const frames = buffer.split('\n\n');
    buffer = frames.pop() ?? '';

    for (const frame of frames) {
      const ev = parseSseFrame(frame);
      if (!ev) continue;
      events.push(ev);

      if (ev.type === ACCEPTED) {
        trackingId = String(ev.data.trackingId ?? trackingId);
        if (!wait) {
          return {
            trackingId,
            txHash: null,
            orderId: null,
            terminal: null,
            events,
          };
        }
      }

      if (TERMINAL_SUCCESS.has(ev.type) || TERMINAL_FAILURE.has(ev.type)) {
        if (ev.type === 'Error' && ev.seq === null) {
          const msg = String(ev.data.message ?? '');
          if (msg.toLowerCase().includes('timed out') && trackingId) {
            return waitForTrackingId(trackingId, events, timeoutMs);
          }
          throw new Error(`batched-market rejected: ${msg || JSON.stringify(ev.data)}`);
        }
        return settle(ev);
      }
    }
  }

  if (trackingId) {
    return waitForTrackingId(trackingId, events, Math.max(5_000, deadline - Date.now()));
  }
  throw new Error('batched-market stream ended before MarketOrderAccepted');
}

export async function waitForTrackingId(
  trackingId: string,
  priorEvents: BatchedMarketEvent[] = [],
  timeoutMs = 60_000
): Promise<BatchedMarketOutcome> {
  const events = [...priorEvents];
  let afterSeq = lastSeq(events);
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const url = new URL(`${baseUrl()}/tracking-id/${trackingId}/status`);
    if (afterSeq !== null) url.searchParams.set('afterSeq', String(afterSeq));
    const res = await fetch(url.toString());
    if (!res.ok) {
      throw new Error(`status poll failed (${res.status})`);
    }
    const body = (await res.json()) as {
      events?: Array<{ type: string; payload?: Record<string, unknown>; seq?: number }>;
    };
    for (const e of body.events ?? []) {
      const ev: BatchedMarketEvent = {
        type: e.type,
        data: e.payload ?? {},
        seq: e.seq ?? null,
      };
      events.push(ev);
      if (ev.seq !== null) afterSeq = ev.seq;
      if (TERMINAL_SUCCESS.has(ev.type)) {
        return {
          trackingId,
          txHash: extractTxHash(events),
          orderId: extractOrderId(events),
          terminal: ev,
          events,
        };
      }
      if (TERMINAL_FAILURE.has(ev.type)) {
        throw new Error(
          `Order failed (${ev.type}): ${JSON.stringify(ev.data)}`
        );
      }
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`batched-market order ${trackingId} not settled after ${timeoutMs}ms`);
}

function parseSseFrame(frame: string): BatchedMarketEvent | null {
  let eventType: string | null = null;
  let seq: number | null = null;
  const dataLines: string[] = [];

  for (const rawLine of frame.split('\n')) {
    const line = rawLine.replace(/\r$/, '');
    if (!line || line.startsWith(':')) continue;
    const idx = line.indexOf(':');
    const field = idx === -1 ? line : line.slice(0, idx);
    let value = idx === -1 ? '' : line.slice(idx + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'event') eventType = value;
    else if (field === 'data') dataLines.push(value);
    else if (field === 'id') {
      const n = Number(value);
      seq = Number.isFinite(n) ? n : null;
    }
  }

  if (eventType === null && dataLines.length === 0) return null;
  let data: Record<string, unknown> = {};
  const raw = dataLines.join('\n');
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      data = typeof parsed === 'object' && parsed ? parsed : { value: parsed };
    } catch {
      data = { raw };
    }
  }
  return { type: eventType ?? 'message', data, seq };
}

function lastSeq(events: BatchedMarketEvent[]): number | null {
  let max: number | null = null;
  for (const ev of events) {
    if (ev.seq !== null && (max === null || ev.seq > max)) max = ev.seq;
  }
  return max;
}

function extractTxHash(events: BatchedMarketEvent[]): `0x${string}` | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const h = events[i].data.transactionHash;
    if (typeof h === 'string' && h.startsWith('0x')) return h as `0x${string}`;
  }
  return null;
}

function extractOrderId(events: BatchedMarketEvent[]): number | null {
  for (let i = events.length - 1; i >= 0; i--) {
    if ('orderId' in events[i].data) {
      return Number(events[i].data.orderId);
    }
  }
  return null;
}
