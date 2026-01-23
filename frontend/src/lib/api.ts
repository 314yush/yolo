import { API_URL } from './constants';
import type {
  ApiResponse,
  BuildTxResponse,
  TradesResponse,
  PnLResponse,
  PriceResponse,
  PairsResponse,
  TradeParams,
  Trade,
} from '@/types';

// Convert snake_case to camelCase
function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

// Transform object keys from snake_case to camelCase
function transformKeys<T>(obj: unknown): T {
  if (Array.isArray(obj)) {
    return obj.map(transformKeys) as T;
  }
  if (obj !== null && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj).map(([key, value]) => [
        snakeToCamel(key),
        transformKeys(value),
      ])
    ) as T;
  }
  return obj as T;
}

// Transform trade from backend format to frontend format
function transformTrade(raw: Record<string, unknown>): Trade {
  return {
    tradeIndex: raw.trade_index as number,
    pairIndex: raw.pair_index as number,
    pair: raw.pair as string,
    collateral: raw.collateral as number,
    leverage: raw.leverage as number,
    isLong: raw.is_long as boolean,
    openPrice: raw.open_price as number,
    tp: raw.tp as number,
    sl: raw.sl as number,
    openedAt: raw.opened_at as number,
  };
}

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = API_URL) {
    this.baseUrl = baseUrl;
  }

  private async request<T>(
    endpoint: string,
    options?: RequestInit,
    retryCount: number = 0
  ): Promise<ApiResponse<T>> {
    const requestId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const startTime = Date.now();
    const maxRetries = 2; // Retry up to 2 times (3 total attempts)
    
    // #region agent log
    fetch('http://127.0.0.1:7246/ingest/24bed7da-def9-45ba-bbd5-6531501907f2',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api.ts:57',message:'Request started',data:{requestId,endpoint,baseUrl:this.baseUrl,method:options?.method||'GET',retryCount},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A,B,C,D'})}).catch(()=>{});
    // #endregion
    
    try {
      const controller = new AbortController();
      const timeoutMs = 35000;
      const timeoutId = setTimeout(() => {
        // #region agent log
        fetch('http://127.0.0.1:7246/ingest/24bed7da-def9-45ba-bbd5-6531501907f2',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api.ts:63',message:'Timeout fired',data:{requestId,endpoint,elapsedMs:Date.now()-startTime,timeoutMs,retryCount},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
        controller.abort();
      }, timeoutMs);

      // #region agent log
      fetch('http://127.0.0.1:7246/ingest/24bed7da-def9-45ba-bbd5-6531501907f2',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api.ts:66',message:'Fetch initiated',data:{requestId,endpoint,timeoutId,retryCount},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A,C,D'})}).catch(()=>{});
      // #endregion

      // Add Connection: keep-alive header to maintain HTTP connections
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        ...options,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'Connection': 'keep-alive',
          ...options?.headers,
        },
        // Force a new connection for retries to avoid stale connections
        cache: retryCount > 0 ? 'no-store' : options?.cache || 'default',
      });

      const elapsedMs = Date.now() - startTime;
      
      // #region agent log
      fetch('http://127.0.0.1:7246/ingest/24bed7da-def9-45ba-bbd5-6531501907f2',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api.ts:75',message:'Response received',data:{requestId,endpoint,elapsedMs,status:response.status,ok:response.ok,retryCount},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A,C'})}).catch(()=>{});
      // #endregion

      clearTimeout(timeoutId);

      // #region agent log
      fetch('http://127.0.0.1:7246/ingest/24bed7da-def9-45ba-bbd5-6531501907f2',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api.ts:78',message:'Timeout cleared',data:{requestId,endpoint,retryCount},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion

      if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
        // #region agent log
        fetch('http://127.0.0.1:7246/ingest/24bed7da-def9-45ba-bbd5-6531501907f2',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api.ts:81',message:'Response not OK',data:{requestId,endpoint,status:response.status,error:error.detail,retryCount},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
        return { success: false, error: error.detail || `HTTP ${response.status}` };
      }

      const data = await response.json();
      // #region agent log
      fetch('http://127.0.0.1:7246/ingest/24bed7da-def9-45ba-bbd5-6531501907f2',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api.ts:87',message:'Request succeeded',data:{requestId,endpoint,elapsedMs:Date.now()-startTime,retryCount},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A,C'})}).catch(()=>{});
      // #endregion
      return { success: true, data };
    } catch (error) {
      const elapsedMs = Date.now() - startTime;
      
      // #region agent log
      fetch('http://127.0.0.1:7246/ingest/24bed7da-def9-45ba-bbd5-6531501907f2',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api.ts:91',message:'Request error',data:{requestId,endpoint,elapsedMs,errorName:error instanceof Error?error.name:'unknown',errorMessage:error instanceof Error?error.message:'unknown',isAbortError:error instanceof Error&&error.name==='AbortError',retryCount},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B,C,D'})}).catch(()=>{});
      // #endregion
      
      // Retry logic: retry on timeout or network errors, but not on abort errors from user cancellation
      const isRetryableError = error instanceof Error && (
        error.name === 'AbortError' || // Timeout
        error.message.includes('Failed to fetch') ||
        error.message.includes('NetworkError')
      );
      
      if (isRetryableError && retryCount < maxRetries) {
        // Wait a bit before retrying (exponential backoff)
        const delayMs = Math.min(1000 * Math.pow(2, retryCount), 5000);
        await new Promise(resolve => setTimeout(resolve, delayMs));
        
        // #region agent log
        fetch('http://127.0.0.1:7246/ingest/24bed7da-def9-45ba-bbd5-6531501907f2',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api.ts:95',message:'Retrying request',data:{requestId,endpoint,retryCount:retryCount+1,maxRetries,delayMs},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
        // #endregion
        
        return this.request<T>(endpoint, options, retryCount + 1);
      }
      
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          return { success: false, error: 'Request timed out. Is the backend running?' };
        }
        // More helpful error messages
        if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
          return { 
            success: false, 
            error: `Cannot connect to API at ${this.baseUrl}. Please ensure the backend is running.` 
          };
        }
        return { success: false, error: error.message };
      }
      return { success: false, error: 'Network error' };
    }
  }

  // Health check
  async healthCheck(): Promise<ApiResponse<{ status: string }>> {
    return this.request('/health');
  }

  // Get available pairs
  async getPairs(): Promise<ApiResponse<PairsResponse>> {
    return this.request('/pairs');
  }

  // Get current price for a pair
  async getPrice(pair: string): Promise<ApiResponse<PriceResponse>> {
    return this.request(`/price/${pair}`);
  }

  // Build delegation setup tx
  async buildDelegateSetupTx(
    trader: string,
    delegateAddress: string
  ): Promise<ApiResponse<BuildTxResponse>> {
    return this.request('/delegate/setup', {
      method: 'POST',
      body: JSON.stringify({ trader, delegate_address: delegateAddress }),
    });
  }

  // Check delegate status
  async getDelegateStatus(
    trader: string
  ): Promise<ApiResponse<{ is_setup: boolean; delegate_address: string | null }>> {
    return this.request(`/delegate/status/${trader}`);
  }

  // Build USDC approval tx
  async buildUsdcApprovalTx(trader: string): Promise<ApiResponse<BuildTxResponse>> {
    return this.request('/delegate/approve-usdc', {
      method: 'POST',
      body: JSON.stringify({ trader }),
    });
  }

  // Get trading contract address (for reference)
  async getTradingContract(): Promise<ApiResponse<{ address: string }>> {
    return this.request('/delegate/trading-contract');
  }

  // Check USDC allowance for trading
  async checkUsdcAllowance(trader: string): Promise<ApiResponse<{ allowance: number; has_sufficient: boolean }>> {
    return this.request(`/delegate/check-allowance/${trader}`);
  }

  // Build open trade tx (delegate version)
  async buildOpenTradeTx(params: TradeParams): Promise<ApiResponse<BuildTxResponse>> {
    return this.request('/trade/build-open', {
      method: 'POST',
      body: JSON.stringify({
        trader: params.trader,
        delegate: params.delegate,
        pair: params.pair,
        pair_index: params.pairIndex,
        leverage: params.leverage,
        is_long: params.isLong,
        collateral: params.collateral,
      }),
    });
  }

  // Build close trade tx (delegate version)
  async buildCloseTradeTx(
    trader: string,
    delegate: string,
    pairIndex: number,
    tradeIndex: number,
    collateralToClose: number
  ): Promise<ApiResponse<BuildTxResponse>> {
    return this.request('/trade/build-close', {
      method: 'POST',
      body: JSON.stringify({
        trader,
        delegate,
        pair_index: pairIndex,
        trade_index: tradeIndex,
        collateral_to_close: collateralToClose,
      }),
    });
  }

  // Get open trades for address
  async getTrades(address: string): Promise<ApiResponse<TradesResponse>> {
    const result = await this.request<{ trades: Record<string, unknown>[] }>(`/trades/${address}`);
    if (result.success && result.data) {
      return {
        success: true,
        data: {
          trades: result.data.trades.map(transformTrade),
        },
      };
    }
    return result as unknown as ApiResponse<TradesResponse>;
  }

  // Get PnL for all positions
  async getPnL(address: string): Promise<ApiResponse<PnLResponse>> {
    const result = await this.request<{ positions: Record<string, unknown>[] }>(`/trades/${address}/pnl`);
    if (result.success && result.data) {
      return {
        success: true,
        data: {
          positions: result.data.positions.map((pos) => ({
            trade: transformTrade(pos.trade as Record<string, unknown>),
            currentPrice: pos.current_price as number,
            pnl: pos.pnl as number,
            pnlPercentage: pos.pnl_percentage as number,
          })),
        },
      };
    }
    return result as unknown as ApiResponse<PnLResponse>;
  }
}

// Export singleton instance
export const api = new ApiClient();

// Export class for testing
export { ApiClient };
