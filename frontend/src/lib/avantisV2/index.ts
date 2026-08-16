export {
  getAvantisV2Config,
  AVANTIS_V2_FALLBACK_ADDRESSES,
  OPEN_ORDER_TYPE,
  AGGREGATOR_ORDER_TYPE,
} from './config';

export { LocalIntentBuilder, type IntentPayload } from './localIntents';
export {
  signIntentWithPrivateKey,
  signIntentWithAccount,
  type IntentSigner,
} from './signIntent';
export { createPrivyIntentSigner } from './privySigner';
export {
  executeBatchedMarket,
  waitForTrackingId,
  type BatchedMarketOutcome,
} from './batchedMarket';
export { fetchAvantisMeta, type AvantisMeta } from './meta';
export { buildUsdcApprovalTxV2 } from './setupTx';
export {
  buildOpenIntent,
  buildCloseIntent,
  executeOpenTradeV2,
  executeCloseTradeV2,
  primeAvantisV2,
  type OpenTradeV2Params,
  type CloseTradeV2Params,
  type TradeExecutionResult,
} from './trade';
export {
  UPSIDE_PAIR_INDEX,
  BASE_PAIR_INDEX,
  UPSIDE_MAX_LEVERAGE,
  MIN_POSITION_USDC,
  loadPairCatalog,
  getPairInfo,
  isPnlPair,
  maxLeverageFor,
  minPositionUsdcFor,
  isPairTradable,
  type PairInfo,
  type UpsideAsset,
} from './pairs';
