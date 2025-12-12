import {
  BN,
  BorshAccountsCoder,
  IdlAccounts,
  IdlTypes,
  Program,
  ProgramAccount,
} from "@coral-xyz/anchor";
import { DlmmContractSoratech } from "../idl";
import { getPriceOfBinByBinId } from "../helpers";
import {
  AccountMeta,
  Keypair,
  PublicKey,
  TransactionInstruction,
} from "@solana/web3.js";
import Decimal from "decimal.js";
import { u64, i64, struct, rustEnum } from "@coral-xyz/borsh";
import { Mint } from "@solana/spl-token";
import { AllAccountsMap } from "@coral-xyz/anchor/dist/cjs/program/namespace/types";
import {
  RebalancePosition,
  // SimulateRebalanceResp
} from "../helpers/rebalance";

export interface FeeInfo {
  baseFeeRatePercentage: Decimal;
  maxFeeRatePercentage: Decimal;
  protocolFeePercentage: Decimal;
}

export interface BinAndAmount {
  binId: number;
  xAmountBpsOfTotal: BN;
  yAmountBpsOfTotal: BN;
}

export interface TokenReserve {
  publicKey: PublicKey;
  reserve: PublicKey;
  mint: Mint;
  amount: bigint;
  owner: PublicKey;
  transferHookAccountMetas: AccountMeta[];
}

export type ClmmProgram = Program<DlmmContractSoratech>;

export type LbPair = IdlAccounts<DlmmContractSoratech>["lbPair"];
export type LbPairAccount = ProgramAccount<
  IdlAccounts<DlmmContractSoratech>["lbPair"]
>;

export type AccountName = keyof AllAccountsMap<DlmmContractSoratech>;

export type Bin = IdlTypes<DlmmContractSoratech>["bin"];
export type BinArray = IdlAccounts<DlmmContractSoratech>["binArray"];
export type BinArrayAccount = ProgramAccount<
  IdlAccounts<DlmmContractSoratech>["binArray"]
>;

export type Position = IdlAccounts<DlmmContractSoratech>["position"];
// export type PositionV2 = IdlAccounts<DlmmContractSoratech>["positionV2"];

// export type PresetParameter =
//   IdlAccounts<DlmmContractSoratech>["presetParameter"];
// export type PresetParameter2 =
//   IdlAccounts<DlmmContractSoratech>["presetParameter2"];

export type vParameters =
  IdlAccounts<DlmmContractSoratech>["lbPair"]["vParameters"];
export type sParameters =
  IdlAccounts<DlmmContractSoratech>["lbPair"]["parameters"];
// export type RewardInfos =
//   IdlAccounts<DlmmContractSoratech>["lbPair"]["rewardInfos"];
// export type RewardInfo = IdlTypes<DlmmContractSoratech>["rewardInfo"];

export type UserRewardInfo = IdlTypes<DlmmContractSoratech>["userRewardInfo"];
export type UserFeeInfo = IdlTypes<DlmmContractSoratech>["feeInfo"];
// export type RebalanceAddLiquidityParam =
//   IdlTypes<DlmmContractSoratech>["addLiquidityParams"];
// export type RebalanceRemoveLiquidityParam =
//   IdlTypes<DlmmContractSoratech>["removeLiquidityParams"];

// export type InitPermissionPairIx =
//   IdlTypes<DlmmContractSoratech>["initPermissionPairIx"];
// export type InitCustomizablePermissionlessPairIx =
//   IdlTypes<DlmmContractSoratech>["customizableParams"];

export type BinLiquidityDistribution =
  IdlTypes<DlmmContractSoratech>["binLiquidityDistribution"];
// export type BinLiquidityReduction =
//   IdlTypes<DlmmContractSoratech>["binLiquidityReduction"];

export type BinArrayBitmapExtensionAccount = ProgramAccount<
  IdlAccounts<DlmmContractSoratech>["binArrayBitmapExtension"]
>;
export type BinArrayBitmapExtension =
  IdlAccounts<DlmmContractSoratech>["binArrayBitmapExtension"];

// export type LiquidityParameterByWeight =
//   IdlTypes<DlmmContractSoratech>["liquidityParameterByWeight"];
// export type LiquidityOneSideParameter =
//   IdlTypes<DlmmContractSoratech>["liquidityOneSideParameter"];

// export type LiquidityParameterByStrategy =
//   IdlTypes<DlmmContractSoratech>["liquidityParameterByStrategy"];
// export type LiquidityParameterByStrategyOneSide =
//   IdlTypes<DlmmContractSoratech>["liquidityParameterByStrategyOneSide"];
export type LiquidityParameter =
  IdlTypes<DlmmContractSoratech>["liquidityParameter"];

// export type ProgramStrategyParameter =
//   IdlTypes<DlmmContractSoratech>["strategyParameters"];
// export type ProgramStrategyType =
//   IdlTypes<DlmmContractSoratech>["strategyType"];

// export type RemainingAccountInfo =
//   IdlTypes<DlmmContractSoratech>["remainingAccountsInfo"];
// export type RemainingAccountsInfoSlice =
//   IdlTypes<DlmmContractSoratech>["remainingAccountsSlice"];

// export type CompressedBinDepositAmount =
//   IdlTypes<DlmmContractSoratech>["compressedBinDepositAmount"];
// export type CompressedBinDepositAmounts = CompressedBinDepositAmount[];

// export type ResizeSideEnum = IdlTypes<DlmmContractSoratech>["resizeSide"];
// export type ExtendedPositionBinData =
//   IdlTypes<DlmmContractSoratech>["positionBinData"];

export interface LbPosition {
  publicKey: PublicKey;
  positionData: PositionData;
}

export interface PositionInfo {
  publicKey: PublicKey;
  lbPair: LbPair;
  tokenX: TokenReserve;
  tokenY: TokenReserve;
  lbPairPositionsData: Array<LbPosition>;
}

export interface FeeInfo {
  baseFeeRatePercentage: Decimal;
  maxFeeRatePercentage: Decimal;
  protocolFeePercentage: Decimal;
}

export interface EmissionRate {
  rewardOne: Decimal | undefined;
  rewardTwo: Decimal | undefined;
}

export interface SwapFee {
  feeX: BN;
  feeY: BN;
}

export interface LMRewards {
  rewardOne: BN;
  rewardTwo: BN;
}

export enum PairType {
  Permissionless,
  Permissioned,
}

export enum ShrinkMode {
  ShrinkBoth,
  NoShrinkLeft,
  NoShrinkRight,
  NoShrinkBoth,
}

export const Strategy = {
  SpotBalanced: { spotBalanced: {} },
  CurveBalanced: { curveBalanced: {} },
  BidAskBalanced: { bidAskBalanced: {} },
  SpotImBalanced: { spotImBalanced: {} },
  CurveImBalanced: { curveImBalanced: {} },
  BidAskImBalanced: { bidAskImBalanced: {} },
};

export enum StrategyType {
  Spot,
  Curve,
  BidAsk,
}

export enum ActivationType {
  Slot,
  Timestamp,
}

// This is position struct size, it doesn't include the discriminator bytes
export const POSITION_MIN_SIZE = 8112;
export const POSITION_BIN_DATA_SIZE = 112;

export interface StrategyParameters {
  maxBinId: number;
  minBinId: number;
  strategyType: StrategyType;
  singleSidedX?: boolean;
}

export interface TQuoteCreatePositionParams {
  strategy: StrategyParameters;
}

export interface TAddLiquidityParams {
  positionPubKey: PublicKey;
  totalXAmount: BN;
  totalYAmount: BN;
  binLiquidityDist: BinLiquidityDistribution[];
  user: PublicKey;
}

export interface TInitializePositionAndAddLiquidityParams {
  totalXAmount: BN;
  totalYAmount: BN;
  binLiquidityDist: BinLiquidityDistribution[];
  user: PublicKey;
}

export interface TInitializePositionAndAddLiquidityParamsByStrategy {
  positionPubKey: PublicKey;
  totalXAmount: BN;
  totalYAmount: BN;
  strategy: StrategyParameters;
  user: PublicKey;
  slippage?: number;
}

export interface InitializeMultiplePositionAndAddLiquidityByStrategyResponse {
  instructionsByPositions: {
    positionKeypair: Keypair;
    initializePositionIx: TransactionInstruction;
    initializeAtaIxs: TransactionInstruction[];
    addLiquidityIxs: TransactionInstruction[][];
  }[];
}

export interface InitializeMultiplePositionAndAddLiquidityByStrategyResponse2 {
  instructionsByPositions: {
    positionKeypair: Keypair;
    transactionInstructions: TransactionInstruction[][];
  }[];
  lookupTableAddress?: PublicKey;
}

export interface TInitializeMultiplePositionAndAddLiquidityParamsByStrategy {
  totalXAmount: BN;
  totalYAmount: BN;
  strategy: StrategyParameters;
  user: PublicKey;
  slippage?: number;
  customKeyPairGenerator?: () => Promise<Keypair>;
}

export interface BinLiquidity {
  binId: number;
  xAmount: BN;
  yAmount: BN;
  supply: BN;
  version: number;
  price: string;
  pricePerToken: string;
  feeAmountXPerTokenStored: BN;
  feeAmountYPerTokenStored: BN;
  rewardPerTokenStored: BN[];
}

export module BinLiquidity {
  export function fromBin(
    bin: Bin,
    binId: number,
    binStep: number,
    baseTokenDecimal: number,
    quoteTokenDecimal: number,
    version: number,
  ): BinLiquidity {
    const pricePerLamport = getPriceOfBinByBinId(binId, binStep).toString();
    return {
      binId,
      xAmount: bin.amountX,
      yAmount: bin.amountY,
      supply: bin.liquiditySupply,
      price: pricePerLamport,
      version,
      pricePerToken: new Decimal(pricePerLamport)
        .mul(new Decimal(10 ** (baseTokenDecimal - quoteTokenDecimal)))
        .toString(),
      feeAmountXPerTokenStored: bin.feeAmountXPerTokenStored,
      feeAmountYPerTokenStored: bin.feeAmountYPerTokenStored,
      rewardPerTokenStored: bin.rewardPerTokenStored,
    };
  }

  export function empty(
    binId: number,
    binStep: number,
    baseTokenDecimal: number,
    quoteTokenDecimal: number,
    version: number,
  ): BinLiquidity {
    const pricePerLamport = getPriceOfBinByBinId(binId, binStep).toString();
    return {
      binId,
      xAmount: new BN(0),
      yAmount: new BN(0),
      supply: new BN(0),
      price: pricePerLamport,
      version,
      pricePerToken: new Decimal(pricePerLamport)
        .mul(new Decimal(10 ** (baseTokenDecimal - quoteTokenDecimal)))
        .toString(),
      feeAmountXPerTokenStored: new BN(0),
      feeAmountYPerTokenStored: new BN(0),
      rewardPerTokenStored: [new BN(0), new BN(0)],
    };
  }
}

export interface SwapQuote {
  consumedInAmount: BN;
  outAmount: BN;
  fee: BN;
  protocolFee: BN;
  minOutAmount: BN;
  priceImpact: Decimal;
  binArraysPubkey: any[];
  endPrice: Decimal;
}

export interface SwapQuoteExactOut {
  inAmount: BN;
  outAmount: BN;
  fee: BN;
  priceImpact: Decimal;
  protocolFee: BN;
  maxInAmount: BN;
  binArraysPubkey: any[];
}

export interface IAccountsCache {
  binArrays: Map<String, BinArray>;
  lbPair: LbPair;
}

export interface PositionBinData {
  binId: number;
  price: string;
  pricePerToken: string;
  binXAmount: string;
  binYAmount: string;
  binLiquidity: string;
  positionLiquidity: string;
  positionXAmount: string;
  positionYAmount: string;
  positionFeeXAmount: string;
  positionFeeYAmount: string;
  positionRewardAmount: string[];
}

export interface PositionData {
  totalXAmount: string;
  totalYAmount: string;
  positionBinData: PositionBinData[];
  lastUpdatedAt: BN;
  upperBinId: number;
  lowerBinId: number;
  feeX: BN;
  feeY: BN;
  rewardOne: BN;
  rewardTwo: BN;
  feeOwner: PublicKey;
  totalClaimedFeeXAmount: BN;
  totalClaimedFeeYAmount: BN;
  feeXExcludeTransferFee: BN;
  feeYExcludeTransferFee: BN;
  rewardOneExcludeTransferFee: BN;
  rewardTwoExcludeTransferFee: BN;
  totalXAmountExcludeTransferFee: BN;
  totalYAmountExcludeTransferFee: BN;
  owner: PublicKey;
}

export interface SwapWithPriceImpactParams {
  /**
   * mint of in token
   */
  inToken: PublicKey;
  /**
   * mint of out token
   */
  outToken: PublicKey;
  /**
   * in token amount
   */
  inAmount: BN;
  /**
   * price impact in bps
   */
  priceImpact: BN;
  /**
   * desired lbPair to swap against
   */
  lbPair: PublicKey;
  /**
   * user
   */
  user: PublicKey;
  binArraysPubkey: PublicKey[];
}

export interface SwapParams {
  /**
   * mint of in token
   */
  inToken: PublicKey;
  /**
   * mint of out token
   */
  outToken: PublicKey;
  /**
   * in token amount
   */
  inAmount: BN;
  /**
   * minimum out with slippage
   */
  minOutAmount: BN;
  /**
   * user
   */
  user: PublicKey;
  binArraysPubkey: PublicKey[];
}

export interface SwapExactOutParams {
  /**
   * mint of in token
   */
  inToken: PublicKey;
  /**
   * mint of out token
   */
  outToken: PublicKey;
  /**
   * out token amount
   */
  outAmount: BN;
  /**
   * maximum in amount, also known as slippage
   */
  maxInAmount: BN;
  /**
   * desired lbPair to swap against
   */
  lbPair: PublicKey;
  /**
   * user
   */
  user: PublicKey;
  binArraysPubkey: PublicKey[];
}

export interface GetOrCreateATAResponse {
  ataPubKey: PublicKey;
  ix?: TransactionInstruction;
}

export enum BitmapType {
  U1024,
  U512,
}

export interface SeedLiquidityResponse {
  sendPositionOwnerTokenProveIxs: TransactionInstruction[];
  initializeBinArraysAndPositionIxs: TransactionInstruction[][];
  addLiquidityIxs: TransactionInstruction[][];
  costBreakdown: SeedLiquidityCostBreakdown;
}

export interface SeedLiquiditySingleBinResponse {
  instructions: TransactionInstruction[];
  costBreakdown: SeedLiquidityCostBreakdown;
}

export interface SeedLiquidityCostBreakdown {
  tokenOwnerProveAssociatedTokenAccountLamports: BN;
  totalPositionLamports: BN;
  totalBinArraysLamports: BN;
  totalPositionCount: BN;
  totalBinArraysCount: BN;
  binArrayBitmapLamports: BN;
}

export interface Clock {
  slot: BN;
  epochStartTimestamp: BN;
  epoch: BN;
  leaderScheduleEpoch: BN;
  unixTimestamp: BN;
}

export const ClockLayout = struct([
  u64("slot"),
  i64("epochStartTimestamp"),
  u64("epoch"),
  u64("leaderScheduleEpoch"),
  i64("unixTimestamp"),
]);

export enum PairStatus {
  Enabled,
  Disabled,
}

export interface PairLockInfo {
  positions: Array<PositionLockInfo>;
}

export interface PositionLockInfo {
  positionAddress: PublicKey;
  owner: PublicKey;
  tokenXAmount: string;
  tokenYAmount: string;
  lockReleasePoint: number;
}

export enum ActionType {
  Liquidity,
  Reward,
}

export enum ResizeSide {
  Lower,
  Upper,
}

export const MEMO_PROGRAM_ID = new PublicKey(
  "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr",
);

// export interface RebalancePositionResponse {
//   rebalancePosition: RebalancePosition;
//   simulationResult: SimulateRebalanceResp;
// }

export interface RebalancePositionBinArrayRentalCostQuote {
  binArrayExistence: Set<string>;
  binArrayCount: number;
  binArrayCost: number;
  bitmapExtensionCost: number;
}

export const REBALANCE_POSITION_PADDING = Array(31).fill(0);
