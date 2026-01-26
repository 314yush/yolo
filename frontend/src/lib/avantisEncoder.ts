/**
 * Avantis Protocol Direct Encoder
 * 
 * Builds trade transactions directly in the frontend, bypassing the slow SDK.
 * Uses the official contract format from the Avantis documentation.
 * 
 * Decimal Precision (from official guide):
 * - Prices: 10 decimals (e.g., $50,000 = 500,000,000,000,000)
 * - Leverage: 10 decimals (e.g., 250x = 2,500,000,000,000)
 * - Slippage: 10 decimals (e.g., 1% = 10,000,000,000)
 * - USDC amounts: 6 decimals (e.g., 100 USDC = 100,000,000)
 * - Execution fee: ~0.00035 ETH
 */

import { encodeFunctionData } from 'viem';

// Contract addresses (Base Mainnet)
export const AVANTIS_CONTRACTS = {
  Trading: '0x44914408af82bC9983bbb330e3578E1105e11d4e' as `0x${string}`,
  TradingStorage: '0x8a311D7048c35985aa31C131B9A13e03a5f7422d' as `0x${string}`,
  USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as `0x${string}`,
};

// Order types
export const ORDER_TYPES = {
  MARKET: 0,
  STOP_LIMIT: 1,
  LIMIT: 2,
  MARKET_ZERO_FEE: 3,
} as const;

// Decimal multipliers (from Avantis contract documentation)
const PRICE_DECIMALS = 10n ** 10n;   // 10 decimals for prices
const LEVERAGE_DECIMALS = 10n ** 10n; // 10 decimals for leverage (250x = 250 * 10^10)
const SLIPPAGE_DECIMALS = 10n ** 10n; // 10 decimals for slippage (1% = 1 * 10^10)
const USDC_DECIMALS = 10n ** 6n;      // 6 decimals for USDC

// Execution fee - REMOVED (no longer required by Avantis)
// With Tachyon gas sponsorship, delegate wallet doesn't need ETH
// Setting to 0 ensures fully gasless transactions
export const DEFAULT_EXECUTION_FEE = BigInt(0); // 0 ETH - no execution fee required

// For fetching dynamic fee from contract (optional, for more precision)
export const EXECUTION_FEE_ABI = [
  {
    name: 'executionFee',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

// ABI for setDelegate function
const SET_DELEGATE_ABI = [
  {
    name: 'setDelegate',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'delegate', type: 'address' }],
    outputs: [],
  },
] as const;

// ABI for delegations mapping (view)
export const DELEGATIONS_ABI = [
  {
    name: 'delegations',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ name: '', type: 'address' }],
  },
] as const;

// ERC20 approve ABI
const ERC20_APPROVE_ABI = [
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;

// ERC20 allowance ABI (view)
export const ERC20_ALLOWANCE_ABI = [
  {
    name: 'allowance',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

// ABI for openTrade function
const OPEN_TRADE_ABI = [
  {
    name: 'openTrade',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      {
        name: 't',
        type: 'tuple',
        components: [
          { name: 'trader', type: 'address' },
          { name: 'pairIndex', type: 'uint256' },
          { name: 'index', type: 'uint256' },
          { name: 'initialPosToken', type: 'uint256' },
          { name: 'positionSizeUSDC', type: 'uint256' },
          { name: 'openPrice', type: 'uint256' },
          { name: 'buy', type: 'bool' },
          { name: 'leverage', type: 'uint256' },
          { name: 'tp', type: 'uint256' },
          { name: 'sl', type: 'uint256' },
          { name: 'timestamp', type: 'uint256' },
        ],
      },
      { name: '_type', type: 'uint8' },
      { name: '_slippageP', type: 'uint256' },
    ],
    outputs: [{ name: 'orderId', type: 'uint256' }],
  },
] as const;

// ABI for closeTradeMarket function
const CLOSE_TRADE_ABI = [
  {
    name: 'closeTradeMarket',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      { name: '_pairIndex', type: 'uint256' },
      { name: '_index', type: 'uint256' },
      { name: '_amount', type: 'uint256' },
    ],
    outputs: [{ name: 'orderId', type: 'uint256' }],
  },
] as const;

// ABI for delegatedAction function
const DELEGATED_ACTION_ABI = [
  {
    name: 'delegatedAction',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      { name: 'trader', type: 'address' },
      { name: 'call_data', type: 'bytes' },
    ],
    outputs: [{ name: '', type: 'bytes' }],
  },
] as const;

export interface OpenTradeParams {
  trader: `0x${string}`;
  pairIndex: number;
  collateral: number;  // In USDC (e.g., 100 = $100)
  leverage: number;    // Raw leverage (e.g., 250 = 250x)
  isLong: boolean;
  openPrice: number;   // Current market price
  takeProfitMultiplier?: number;  // TP at price * multiplier (default: 5 for long, 0.2 for short)
  slippagePercent?: number;  // Slippage tolerance (default: 1%)
}

export interface CloseTradeParams {
  trader: `0x${string}`;
  pairIndex: number;
  tradeIndex: number;
  collateralToClose: number;  // In USDC
}

export interface FlipTradeParams {
  trader: `0x${string}`;
  pairIndex: number;
  tradeIndex: number;
  collateral: number;      // Amount to close/reopen
  leverage: number;
  currentIsLong: boolean;  // Current direction (will flip to opposite)
  currentPrice: number;    // For open tx
}

export interface FlipTradeResult {
  closeTx: EncodedTransaction;
  openTx: EncodedTransaction;
}

export interface EncodedTransaction {
  to: `0x${string}`;
  data: `0x${string}`;
  value: string;
  chainId: number;
}

/**
 * Scale a price to 10 decimals
 */
function scalePrice(price: number): bigint {
  return BigInt(Math.round(price * Number(PRICE_DECIMALS)));
}

/**
 * Scale leverage to 10 decimals (250x = 250 * 10^10)
 */
function scaleLeverage(leverage: number): bigint {
  return BigInt(leverage) * LEVERAGE_DECIMALS;
}

/**
 * Scale slippage percentage to 10 decimals (1% = 1 * 10^10)
 */
function scaleSlippage(slippagePercent: number): bigint {
  return BigInt(Math.round(slippagePercent)) * SLIPPAGE_DECIMALS;
}

/**
 * Scale USDC amount to 6 decimals
 */
function scaleUSDC(amount: number): bigint {
  return BigInt(Math.round(amount * Number(USDC_DECIMALS)));
}

/**
 * Calculate take profit price
 */
function calculateTakeProfit(
  openPrice: number,
  isLong: boolean,
  multiplier?: number
): number {
  const defaultMultiplier = isLong ? 5 : 0.2;
  const m = multiplier ?? defaultMultiplier;
  return openPrice * m;
}

/**
 * Build the inner openTrade calldata
 */
function buildOpenTradeCalldata(params: OpenTradeParams): `0x${string}` {
  const {
    trader,
    pairIndex,
    collateral,
    leverage,
    isLong,
    openPrice,
    takeProfitMultiplier,
    slippagePercent = 1,
  } = params;

  const tpPrice = calculateTakeProfit(openPrice, isLong, takeProfitMultiplier);
  const timestamp = Math.floor(Date.now() / 1000);

  // Build the trade struct
  // Per Avantis docs: positionSizeUSDC = collateral in USDC (6 decimals)
  // The contract calculates position size internally from collateral * leverage
  const tradeStruct = {
    trader,
    pairIndex: BigInt(pairIndex),
    index: 0n,  // Will be assigned by contract
    initialPosToken: scaleUSDC(collateral),  // Collateral in USDC (6 decimals)
    positionSizeUSDC: scaleUSDC(collateral), // Collateral in USDC (6 decimals)
    openPrice: scalePrice(openPrice),
    buy: isLong,
    leverage: scaleLeverage(leverage),       // Leverage in 10 decimals
    tp: scalePrice(tpPrice),
    sl: 0n,  // No stop loss
    timestamp: BigInt(timestamp),
  };

  // Encode the openTrade call
  return encodeFunctionData({
    abi: OPEN_TRADE_ABI,
    functionName: 'openTrade',
    args: [
      tradeStruct,
      ORDER_TYPES.MARKET_ZERO_FEE,
      scaleSlippage(slippagePercent),
    ],
  });
}

/**
 * Build the inner closeTradeMarket calldata
 */
function buildCloseTradeCalldata(params: CloseTradeParams): `0x${string}` {
  const { pairIndex, tradeIndex, collateralToClose } = params;

  return encodeFunctionData({
    abi: CLOSE_TRADE_ABI,
    functionName: 'closeTradeMarket',
    args: [
      BigInt(pairIndex),
      BigInt(tradeIndex),
      scaleUSDC(collateralToClose),
    ],
  });
}

/**
 * Wrap calldata in delegatedAction for delegate wallet execution
 */
function wrapInDelegatedAction(
  trader: `0x${string}`,
  innerCalldata: `0x${string}`
): `0x${string}` {
  return encodeFunctionData({
    abi: DELEGATED_ACTION_ABI,
    functionName: 'delegatedAction',
    args: [trader, innerCalldata],
  });
}

/**
 * Build a complete open trade transaction for delegate signing
 * 
 * This builds a delegatedAction(trader, openTrade(...)) transaction
 * that the delegate wallet signs and broadcasts.
 */
export function buildOpenTradeTx(params: OpenTradeParams): EncodedTransaction {
  const innerCalldata = buildOpenTradeCalldata(params);
  const delegatedCalldata = wrapInDelegatedAction(params.trader, innerCalldata);

  return {
    to: AVANTIS_CONTRACTS.Trading,
    data: delegatedCalldata,
    value: DEFAULT_EXECUTION_FEE.toString(),
    chainId: 8453,  // Base mainnet
  };
}

/**
 * Build a complete close trade transaction for delegate signing
 */
export function buildCloseTradeTx(params: CloseTradeParams): EncodedTransaction {
  const innerCalldata = buildCloseTradeCalldata(params);
  const delegatedCalldata = wrapInDelegatedAction(params.trader, innerCalldata);

  return {
    to: AVANTIS_CONTRACTS.Trading,
    data: delegatedCalldata,
    value: DEFAULT_EXECUTION_FEE.toString(),
    chainId: 8453,
  };
}

/**
 * Validate minimum position size
 * Avantis requires minimum position size of $100
 */
export function validatePositionSize(
  collateral: number,
  leverage: number
): { valid: boolean; error?: string; positionSize: number } {
  const MIN_POSITION_SIZE = 100;
  const positionSize = collateral * leverage;

  if (positionSize < MIN_POSITION_SIZE) {
    const minCollateral = MIN_POSITION_SIZE / leverage;
    return {
      valid: false,
      error: `Position size $${positionSize.toFixed(2)} is below minimum $${MIN_POSITION_SIZE}. ` +
        `With ${leverage}x leverage, minimum collateral is $${minCollateral.toFixed(2)} USDC.`,
      positionSize,
    };
  }

  return { valid: true, positionSize };
}

/**
 * Build both close and open transactions for a flip trade
 * Close current position, then open opposite direction
 */
export function buildFlipTradeTxs(params: FlipTradeParams): FlipTradeResult {
  const { trader, pairIndex, tradeIndex, collateral, leverage, currentIsLong, currentPrice } = params;

  // 1. Build close tx
  const closeTx = buildCloseTradeTx({
    trader,
    pairIndex,
    tradeIndex,
    collateralToClose: collateral,  // Close full position
  });

  // 2. Build open tx (opposite direction)
  const openTx = buildOpenTradeTx({
    trader,
    pairIndex,
    collateral,
    leverage,
    isLong: !currentIsLong,  // Flip direction
    openPrice: currentPrice,
  });

  return { closeTx, openTx };
}

// ============================================================
// DELEGATE SETUP
// ============================================================

/**
 * Build a setDelegate transaction
 * This authorizes a delegate wallet to perform trades on behalf of the trader
 */
export function buildSetDelegateTx(
  delegateAddress: `0x${string}`
): EncodedTransaction {
  const calldata = encodeFunctionData({
    abi: SET_DELEGATE_ABI,
    functionName: 'setDelegate',
    args: [delegateAddress],
  });

  return {
    to: AVANTIS_CONTRACTS.Trading,
    data: calldata,
    value: '0',  // No value needed
    chainId: 8453,
  };
}

// ============================================================
// USDC APPROVAL
// ============================================================

// Max uint256 for unlimited approval
const MAX_UINT256 = 2n ** 256n - 1n;

/**
 * Build a USDC approval transaction
 * Approves TradingStorage to spend USDC on behalf of the trader
 */
export function buildUsdcApprovalTx(
  amount?: bigint  // Optional: defaults to unlimited (max uint256)
): EncodedTransaction {
  const approvalAmount = amount ?? MAX_UINT256;

  const calldata = encodeFunctionData({
    abi: ERC20_APPROVE_ABI,
    functionName: 'approve',
    args: [AVANTIS_CONTRACTS.TradingStorage, approvalAmount],
  });

  return {
    to: AVANTIS_CONTRACTS.USDC,
    data: calldata,
    value: '0',  // No value needed
    chainId: 8453,
  };
}
