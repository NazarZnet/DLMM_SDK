import { BN } from "@coral-xyz/anchor";
import {
  AccountLayout,
  Mint,
  NATIVE_MINT,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
  unpackMint,
} from "@solana/spl-token";
import {
  AccountMeta,
  Connection,
  PublicKey,
  SYSVAR_CLOCK_PUBKEY,
  SYSVAR_RENT_PUBKEY,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import Decimal from "decimal.js";
import {
  BASIS_POINT_MAX,
  DEFAULT_BIN_PER_POSITION,
  FEE_PRECISION,
  MAX_BIN_ARRAY_SIZE,
  MAX_CLAIM_ALL_ALLOWED,
  MAX_EXTRA_BIN_ARRAYS,
  MAX_FEE_RATE,
  SCALE_OFFSET,
} from "./constants";
import { DlmmSdkError } from "./error";
import {
  Opt,
  binIdToBinArrayIndex,
  chunkedGetMultipleAccountInfos,
  chunks,
  computeFeeFromAmount,
  createProgram,
  decodeAccount,
  deriveBinArray,
  deriveBinArrayBitmapExtension,
  deriveLbPair,
  derivePosition,
  deriveReserve,
  enumerateBins,
  findNextBinArrayIndexWithLiquidity,
  findNextBinArrayWithLiquidity,
  getBinArrayLowerUpperBinId,
  getBinFromBinArray,
  getEstimatedComputeUnitIxWithBuffer,
  getOrCreateATAInstruction,
  getOutAmount,
  getPriceOfBinByBinId,
  getTotalFee,
  isBinIdWithinBinArray,
  isOverflowDefaultBinArrayBitmap,
  range,
  swapExactInQuoteAtBin,
  unwrapSOLInstruction,
  wrapSOLInstruction,
} from "./helpers";
import {
  binArrayLbPairFilter,
  positionLbPairFilter,
  positionOwnerFilter,
  positionV2Filter,
} from "./helpers/accountFilters";

import { Rounding, mulShr } from "./helpers/math";
import {
  IPosition,
  chunkBinRange,
  getBinArrayAccountMetasCoverage,
  getBinArrayIndexesCoverage,
  getExtendedPositionBinCount,
  getPositionExpandRentExemption,
  getPositionLowerUpperBinIdWithLiquidity,
  isPositionNoFee,
  wrapPosition,
} from "./helpers/positions";

import {
  calculateTransferFeeExcludedAmount,
  calculateTransferFeeIncludedAmount,
  getExtraAccountMetasForTransferHook,
} from "./helpers/token_2022";
import {
  Bin,
  BinArray,
  BinArrayAccount,
  BinArrayBitmapExtension,
  BinArrayBitmapExtensionAccount,
  BinLiquidity,
  BinLiquidityDistribution,
  ClmmProgram,
  Clock,
  ClockLayout,
  FeeInfo,
  LbPair,
  LbPairAccount,
  LbPosition,
  LiquidityParameter,
  PositionBinData,
  PositionData,
  PositionInfo,
  SwapParams,
  SwapQuote,
  TAddLiquidityParams,
  TInitializePositionAndAddLiquidityParams,
  TokenReserve,
  sParameters,
  vParameters,
} from "./types";

export class DLMM {
  constructor(
    public pubkey: PublicKey,
    public program: ClmmProgram,
    public lbPair: LbPair,
    public binArrayBitmapExtension: BinArrayBitmapExtensionAccount | null,
    public tokenX: TokenReserve,
    public tokenY: TokenReserve,
    public rewards: Array<TokenReserve | null>,
    public clock: Clock,
    private opt?: Opt,
  ) {}

  /** Static public method */

  /**
   * The function `getLbPairs` retrieves a list of LB pair accounts using a connection and optional
   * parameters.
   * @param {Connection} connection - The `connection` parameter is an instance of the `Connection`
   * class, which represents the connection to the Solana blockchain network.
   * @param {Opt} [opt] - The `opt` parameter is an optional object that contains additional options
   * for the function. It can have the following properties:
   * @returns The function `getLbPairs` returns a Promise that resolves to an array of
   * `LbPairAccount` objects.
   */
  public static async getLbPairs(
    connection: Connection,
    opt?: Opt,
  ): Promise<LbPairAccount[]> {
    const program = createProgram(connection, opt);
    return program.account.lbPair.all();
  }

  /**
   * Retrieves the public key of a LB pair if it exists. This function expect the RPC have getProgramAccounts RPC method enabled.
   * @param connection The connection to the Solana cluster.
   * @param tokenX The mint address of token X.
   * @param tokenY The mint address of token Y.
   * @param binStep The bin step of the LB pair.
   * @param baseFactor The base factor of the LB pair.
   * @param opt Optional parameters.
   * @returns The public key of the LB pair if it exists, or null.
   */
  public static async getPairPubkeyIfExists(
    connection: Connection,
    tokenX: PublicKey,
    tokenY: PublicKey,
    binStep: BN,
    baseFactor: BN,
    opt?: Opt,
  ): Promise<PublicKey | null> {
    const program = createProgram(connection, opt);

    const [lbPairKey] = deriveLbPair(
      tokenX,
      tokenY,
      binStep,
      program.programId,
    );

    const account = await program.account.lbPair.fetchNullable(lbPairKey);
    // INFO: basePowerFactor validation currently removed because it's not exists currently in LbPair
    if (account && account.parameters.baseFactor === baseFactor.toNumber()) {
      return lbPairKey;
    }

    //TODO: Implement logic to find the LB pair with the given parameters
    // const presetParametersWithIndex =
    //   await program.account.presetParameter2.all([
    //     presetParameter2BinStepFilter(binStep),
    //     presetParameter2BaseFactorFilter(baseFactor),
    //     presetParameter2BaseFeePowerFactor(baseFeePowerFactor),
    //   ]);

    // if (presetParametersWithIndex.length > 0) {
    //   const possibleLbPairKeys = presetParametersWithIndex.map((account) => {
    //     return deriveLbPairWithPresetParamWithIndexKey(
    //       account.publicKey,
    //       tokenX,
    //       tokenY,
    //       program.programId,
    //     )[0];
    //   });

    //   const accounts = await chunkedGetMultipleAccountInfos(
    //     program.provider.connection,
    //     possibleLbPairKeys,
    //   );

    //   for (let i = 0; i < possibleLbPairKeys.length; i++) {
    //     const pairKey = possibleLbPairKeys[i];
    //     const account = accounts[i];

    //     if (account) {
    //       return pairKey;
    //     }
    //   }
    // }

    return null;
  }

  /**
   * The `create` function is a static method that creates a new instance of the `DLMM` class
   * @param {Connection} connection - The `connection` parameter is an instance of the `Connection`
   * class, which represents the connection to the Solana blockchain network.
   * @param {PublicKey} lbPair - The PublicKey of LB Pair.
   * @param {Opt} [opt] - The `opt` parameter is an optional object that can contain additional options
   * for the `create` function. It has the following properties:
   * @returns The `create` function returns a `Promise` that resolves to a `DLMM` object.
   */
  static async create(
    connection: Connection,
    lbPair: PublicKey,
    opt?: Opt,
  ): Promise<DLMM> {
    const program = createProgram(connection, opt);

    const binArrayBitMapExtensionPubkey = deriveBinArrayBitmapExtension(
      lbPair,
      program.programId,
    )[0];
    let accountsToFetch = [
      lbPair,
      binArrayBitMapExtensionPubkey,
      SYSVAR_CLOCK_PUBKEY,
    ];

    const accountsInfo = await chunkedGetMultipleAccountInfos(
      connection,
      accountsToFetch,
    );

    const lbPairAccountInfoBuffer = accountsInfo[0]?.data;
    if (!lbPairAccountInfoBuffer)
      throw new Error(`LB Pair account ${lbPair.toBase58()} not found`);

    const lbPairAccInfo = decodeAccount<LbPair>(
      program,
      "lbPair",
      lbPairAccountInfoBuffer,
    );

    const binArrayBitMapAccountInfoBuffer = accountsInfo[1]?.data;

    let binArrayBitMapExtensionAccInfo: BinArrayBitmapExtension | null = null;
    if (binArrayBitMapAccountInfoBuffer) {
      binArrayBitMapExtensionAccInfo = decodeAccount<BinArrayBitmapExtension>(
        program,
        "binArrayBitmapExtension",
        binArrayBitMapAccountInfoBuffer,
      );
    }

    const clockAccountInfoBuffer = accountsInfo[2]?.data;
    if (!clockAccountInfoBuffer) throw new Error(`Clock account not found`);
    const clock = ClockLayout.decode(clockAccountInfoBuffer) as Clock;

    // INFO: Rewards currently not supported
    accountsToFetch = [
      lbPairAccInfo.reserveX,
      lbPairAccInfo.reserveY,
      lbPairAccInfo.tokenXMint,
      lbPairAccInfo.tokenYMint,
      // lbPairAccInfo.rewardInfos[0].vault,
      // lbPairAccInfo.rewardInfos[1].vault,
      // lbPairAccInfo.rewardInfos[0].mint,
      // lbPairAccInfo.rewardInfos[1].mint,
    ];

    const [
      reserveXAccount,
      reserveYAccount,
      tokenXMintAccount,
      tokenYMintAccount,
      // reward0VaultAccount,
      // reward1VaultAccount,
      // reward0MintAccount,
      // reward1MintAccount,
    ] = await chunkedGetMultipleAccountInfos(
      program.provider.connection,
      accountsToFetch,
    );

    let binArrayBitmapExtension: BinArrayBitmapExtensionAccount | null;
    if (binArrayBitMapExtensionAccInfo) {
      binArrayBitmapExtension = {
        account: binArrayBitMapExtensionAccInfo,
        publicKey: binArrayBitMapExtensionPubkey,
      };
    }

    const reserveXBalance = AccountLayout.decode(reserveXAccount.data);
    const reserveYBalance = AccountLayout.decode(reserveYAccount.data);

    const mintX = unpackMint(
      lbPairAccInfo.tokenXMint,
      tokenXMintAccount,
      tokenXMintAccount.owner,
    );

    const mintY = unpackMint(
      lbPairAccInfo.tokenYMint,
      tokenYMintAccount,
      tokenYMintAccount.owner,
    );

    const [
      tokenXTransferHook,
      tokenYTransferHook,
      // reward0TransferHook,
      // reward1TransferHook,
    ] = await Promise.all([
      getExtraAccountMetasForTransferHook(
        connection,
        lbPairAccInfo.tokenXMint,
        tokenXMintAccount,
      ),
      getExtraAccountMetasForTransferHook(
        connection,
        lbPairAccInfo.tokenYMint,
        tokenYMintAccount,
      ),
      // reward0MintAccount
      //   ? getExtraAccountMetasForTransferHook(
      //       connection,
      //       lbPairAccInfo.rewardInfos[0].mint,
      //       reward0MintAccount,
      //     )
      //   : [],
      // reward1MintAccount
      //   ? getExtraAccountMetasForTransferHook(
      //       connection,
      //       lbPairAccInfo.rewardInfos[1].mint,
      //       reward1MintAccount,
      //     )
      //   : [],
    ]);

    const tokenX: TokenReserve = {
      publicKey: lbPairAccInfo.tokenXMint,
      reserve: lbPairAccInfo.reserveX,
      amount: reserveXBalance.amount,
      mint: mintX,
      owner: tokenXMintAccount.owner,
      transferHookAccountMetas: tokenXTransferHook,
    };

    const tokenY: TokenReserve = {
      publicKey: lbPairAccInfo.tokenYMint,
      reserve: lbPairAccInfo.reserveY,
      amount: reserveYBalance.amount,
      mint: mintY,
      owner: tokenYMintAccount.owner,
      transferHookAccountMetas: tokenYTransferHook,
    };

    // const reward0: TokenReserve = !lbPairAccInfo.rewardInfos[0].mint.equals(
    //   PublicKey.default,
    // )
    //   ? {
    //       publicKey: lbPairAccInfo.rewardInfos[0].mint,
    //       reserve: lbPairAccInfo.rewardInfos[0].vault,
    //       amount: AccountLayout.decode(reward0VaultAccount.data).amount,
    //       mint: unpackMint(
    //         lbPairAccInfo.rewardInfos[0].mint,
    //         reward0MintAccount,
    //         reward0MintAccount.owner,
    //       ),
    //       owner: reward0MintAccount.owner,
    //       transferHookAccountMetas: reward0TransferHook,
    //     }
    //   : null;

    // const reward1: TokenReserve = !lbPairAccInfo.rewardInfos[1].mint.equals(
    //   PublicKey.default,
    // )
    //   ? {
    //       publicKey: lbPairAccInfo.rewardInfos[1].mint,
    //       reserve: lbPairAccInfo.rewardInfos[1].vault,
    //       amount: AccountLayout.decode(reward1VaultAccount.data).amount,
    //       mint: unpackMint(
    //         lbPairAccInfo.rewardInfos[1].mint,
    //         reward1MintAccount,
    //         reward1MintAccount.owner,
    //       ),
    //       owner: reward1MintAccount.owner,
    //       transferHookAccountMetas: reward1TransferHook,
    //     }
    //   : null;

    return new DLMM(
      lbPair,
      program,
      lbPairAccInfo,
      binArrayBitmapExtension,
      tokenX,
      tokenY,
      [null, null],
      clock,
      opt,
    );
  }

  /**
   * Similar to `create` function, but it accept multiple lbPairs to be initialized.
   * @param {Connection} connection - The `connection` parameter is an instance of the `Connection`
   * class, which represents the connection to the Solana blockchain network.
   * @param lbPairList - An Array of PublicKey of LB Pairs.
   * @param {Opt} [opt] - An optional parameter of type `Opt`.
   * @returns The function `createMultiple` returns a Promise that resolves to an array of `DLMM`
   * objects.
   */
  static async createMultiple(
    connection: Connection,
    lbPairList: Array<PublicKey>,
    opt?: Opt,
  ): Promise<DLMM[]> {
    const program = createProgram(connection, opt);

    const binArrayBitMapExtensions = lbPairList.map(
      (lbPair) => deriveBinArrayBitmapExtension(lbPair, program.programId)[0],
    );
    const accountsToFetch = [
      ...lbPairList,
      ...binArrayBitMapExtensions,
      SYSVAR_CLOCK_PUBKEY,
    ];

    let accountsInfo = await chunkedGetMultipleAccountInfos(
      connection,
      accountsToFetch,
    );

    const clockAccount = accountsInfo.pop();
    const clockAccountInfoBuffer = clockAccount?.data;
    if (!clockAccountInfoBuffer) throw new Error(`Clock account not found`);
    const clock = ClockLayout.decode(clockAccountInfoBuffer) as Clock;

    const lbPairArraysMap = new Map<string, LbPair>();
    for (let i = 0; i < lbPairList.length; i++) {
      const lbPairPubKey = lbPairList[i];
      const lbPairAccountInfoBuffer = accountsInfo[i]?.data;
      if (!lbPairAccountInfoBuffer)
        throw new Error(`LB Pair account ${lbPairPubKey.toBase58()} not found`);
      const lbPairAccInfo = decodeAccount<LbPair>(
        program,
        "lbPair",
        lbPairAccountInfoBuffer,
      );
      lbPairArraysMap.set(lbPairPubKey.toBase58(), lbPairAccInfo);
    }

    const binArrayBitMapExtensionsMap = new Map<
      string,
      BinArrayBitmapExtension
    >();
    for (let i = lbPairList.length; i < accountsInfo.length; i++) {
      const index = i - lbPairList.length;
      const lbPairPubkey = lbPairList[index];
      const binArrayBitMapAccountInfoBuffer = accountsInfo[i]?.data;
      if (binArrayBitMapAccountInfoBuffer) {
        const binArrayBitMapExtensionAccInfo =
          decodeAccount<BinArrayBitmapExtension>(
            program,
            "binArrayBitmapExtension",
            binArrayBitMapAccountInfoBuffer,
          );
        binArrayBitMapExtensionsMap.set(
          lbPairPubkey.toBase58(),
          binArrayBitMapExtensionAccInfo,
        );
      }
    }

    const reservePublicKeys = Array.from(lbPairArraysMap.values())
      .map(({ reserveX, reserveY }) => [reserveX, reserveY])
      .flat();

    const tokenMintPublicKeys = Array.from(lbPairArraysMap.values())
      .map(({ tokenXMint, tokenYMint }) => [tokenXMint, tokenYMint])
      .flat();

    // const rewardVaultPublicKeys = Array.from(lbPairArraysMap.values())
    //   .map(({ rewardInfos }) => rewardInfos.map(({ vault }) => vault))
    //   .flat();

    // const rewardMintPublicKeys = Array.from(lbPairArraysMap.values())
    //   .map(({ rewardInfos }) => rewardInfos.map(({ mint }) => mint))
    //   .flat();

    accountsInfo = await chunkedGetMultipleAccountInfos(
      program.provider.connection,
      [
        ...reservePublicKeys,
        ...tokenMintPublicKeys,
        // ...rewardVaultPublicKeys,
        // ...rewardMintPublicKeys,
      ],
    );

    const offsetToTokenMint = reservePublicKeys.length;
    // const offsetToRewardMint =
    //   reservePublicKeys.length +
    //   tokenMintPublicKeys.length +
    //   rewardVaultPublicKeys.length;

    const tokenMintAccounts = accountsInfo.slice(
      offsetToTokenMint,
      offsetToTokenMint + tokenMintPublicKeys.length,
    );

    // const rewardMintAccounts = accountsInfo.slice(
    //   offsetToRewardMint,
    //   offsetToRewardMint + rewardMintPublicKeys.length,
    // );

    const tokenMintsWithAccount = tokenMintPublicKeys
      .map((key, idx) => {
        return {
          mintAddress: key,
          mintAccountInfo: tokenMintAccounts[idx],
        };
      })
      .filter(({ mintAddress }) => mintAddress !== PublicKey.default);

    // const rewardMintsWithAccount = rewardMintPublicKeys
    //   .map((key, idx) => {
    //     return {
    //       mintAddress: key,
    //       mintAccountInfo: rewardMintAccounts[idx],
    //     };
    //   })
    //   .filter(({ mintAddress }) => mintAddress !== PublicKey.default);

    // const uniqueMintWithAccounts = Array.from(
    //   new Set(tokenMintsWithAccount.concat(rewardMintsWithAccount)),
    // );

    // const mintHookAccountsMap =
    //   await getMultipleMintsExtraAccountMetasForTransferHook(
    //     connection,
    //     uniqueMintWithAccounts,
    //   );

    const lbClmmImpl = lbPairList.map((lbPair, index) => {
      const lbPairState = lbPairArraysMap.get(lbPair.toBase58());
      if (!lbPairState)
        throw new Error(`LB Pair ${lbPair.toBase58()} state not found`);

      const binArrayBitmapExtensionState = binArrayBitMapExtensionsMap.get(
        lbPair.toBase58(),
      );
      const binArrayBitmapExtensionPubkey = binArrayBitMapExtensions[index];

      let binArrayBitmapExtension: BinArrayBitmapExtensionAccount | null = null;
      if (binArrayBitmapExtensionState) {
        binArrayBitmapExtension = {
          account: binArrayBitmapExtensionState,
          publicKey: binArrayBitmapExtensionPubkey,
        };
      }

      const reserveXAccountInfo = accountsInfo[index * 2];
      const reserveYAccountInfo = accountsInfo[index * 2 + 1];

      let offsetToTokenMint = reservePublicKeys.length;

      const tokenXMintAccountInfo = accountsInfo[offsetToTokenMint + index * 2];
      const tokenYMintAccountInfo =
        accountsInfo[offsetToTokenMint + index * 2 + 1];

      // const offsetToRewardVaultAccountInfos =
      //   offsetToTokenMint + tokenMintPublicKeys.length;

      // const reward0VaultAccountInfo =
      //   accountsInfo[offsetToRewardVaultAccountInfos + index * 2];
      // const reward1VaultAccountInfo =
      //   accountsInfo[offsetToRewardVaultAccountInfos + index * 2 + 1];

      // const offsetToRewardMintAccountInfos =
      //   offsetToRewardVaultAccountInfos + rewardVaultPublicKeys.length;

      // const reward0MintAccountInfo =
      //   accountsInfo[offsetToRewardMintAccountInfos + index * 2];
      // const reward1MintAccountInfo =
      //   accountsInfo[offsetToRewardMintAccountInfos + index * 2 + 1];

      if (!reserveXAccountInfo || !reserveYAccountInfo)
        throw new Error(
          `Reserve account for LB Pair ${lbPair.toBase58()} not found`,
        );

      const reserveXBalance = AccountLayout.decode(reserveXAccountInfo.data);
      const reserveYBalance = AccountLayout.decode(reserveYAccountInfo.data);

      const mintX = unpackMint(
        lbPairState.tokenXMint,
        tokenXMintAccountInfo,
        tokenXMintAccountInfo.owner,
      );

      const mintY = unpackMint(
        lbPairState.tokenYMint,
        tokenYMintAccountInfo,
        tokenYMintAccountInfo.owner,
      );

      const tokenX: TokenReserve = {
        publicKey: lbPairState.tokenXMint,
        reserve: lbPairState.reserveX,
        mint: mintX,
        amount: reserveXBalance.amount,
        owner: tokenXMintAccountInfo.owner,
        transferHookAccountMetas: [],
        // mintHookAccountsMap.get(lbPairState.tokenXMint.toBase58()) ?? [],
      };

      const tokenY: TokenReserve = {
        publicKey: lbPairState.tokenYMint,
        reserve: lbPairState.reserveY,
        amount: reserveYBalance.amount,
        mint: mintY,
        owner: tokenYMintAccountInfo.owner,
        transferHookAccountMetas: [],
        // mintHookAccountsMap.get(lbPairState.tokenYMint.toBase58()) ?? [],
      };

      // const reward0: TokenReserve = !lbPairState.rewardInfos[0].mint.equals(
      //   PublicKey.default,
      // )
      //   ? {
      //       publicKey: lbPairState.rewardInfos[0].mint,
      //       reserve: lbPairState.rewardInfos[0].vault,
      //       amount: AccountLayout.decode(reward0VaultAccountInfo.data).amount,
      //       mint: unpackMint(
      //         lbPairState.rewardInfos[0].mint,
      //         reward0MintAccountInfo,
      //         reward0MintAccountInfo.owner,
      //       ),
      //       owner: reward0MintAccountInfo.owner,
      //       transferHookAccountMetas:
      //         mintHookAccountsMap.get(
      //           lbPairState.rewardInfos[0].mint.toBase58(),
      //         ) ?? [],
      //     }
      //   : null;

      // const reward1: TokenReserve = !lbPairState.rewardInfos[1].mint.equals(
      //   PublicKey.default,
      // )
      //   ? {
      //       publicKey: lbPairState.rewardInfos[1].mint,
      //       reserve: lbPairState.rewardInfos[1].vault,
      //       amount: AccountLayout.decode(reward1VaultAccountInfo.data).amount,
      //       mint: unpackMint(
      //         lbPairState.rewardInfos[1].mint,
      //         reward1MintAccountInfo,
      //         reward1MintAccountInfo.owner,
      //       ),
      //       owner: reward1MintAccountInfo.owner,
      //       transferHookAccountMetas:
      //         mintHookAccountsMap.get(
      //           lbPairState.rewardInfos[1].mint.toBase58(),
      //         ) ?? [],
      //     }
      //   : null;

      return new DLMM(
        lbPair,
        program,
        lbPairState,
        binArrayBitmapExtension,
        tokenX,
        tokenY,
        [null, null],
        clock,
        opt,
      );
    });

    return lbClmmImpl;
  }

  /**
   * The function `getAllLbPairPositionsByUser` retrieves all liquidity pool pair positions for a given
   * user.
   * @param {Connection} connection - The `connection` parameter is an instance of the `Connection`
   * class, which represents the connection to the Solana blockchain.
   * @param {PublicKey} userPubKey - The user's wallet public key.
   * @param {Opt} [opt] - An optional object that contains additional options for the function.
   * @returns The function `getAllLbPairPositionsByUser` returns a `Promise` that resolves to a `Map`
   * object. The `Map` object contains key-value pairs, where the key is a string representing the LB
   * Pair account, and the value is an object of PositionInfo
   */
  static async getAllLbPairPositionsByUser(
    connection: Connection,
    userPubKey: PublicKey,
    opt?: Opt,
  ): Promise<Map<string, PositionInfo>> {
    const program = createProgram(connection, opt);

    const positionsV2 = await program.provider.connection.getProgramAccounts(
      program.programId,
      {
        filters: [positionV2Filter(), positionOwnerFilter(userPubKey)],
      },
    );

    const positionWrappers: IPosition[] = [
      ...positionsV2.map((p) => wrapPosition(program, p.pubkey, p.account)),
    ];

    const binArrayPubkeySetV2 = new Set<string>();
    const lbPairSetV2 = new Set<string>();

    positionWrappers.forEach((p) => {
      const binArrayKeys = p.getBinArrayKeysCoverage(program.programId);
      binArrayKeys.forEach((binArrayKey) => {
        binArrayPubkeySetV2.add(binArrayKey.toBase58());
      });
      lbPairSetV2.add(p.lbPair().toBase58());
    });

    const binArrayPubkeyArrayV2 = Array.from(binArrayPubkeySetV2).map(
      (pubkey) => new PublicKey(pubkey),
    );
    const lbPairKeys = Array.from(lbPairSetV2).map(
      (pubkey) => new PublicKey(pubkey),
    );

    const [clockAccInfo, ...binArraysAccInfo] =
      await chunkedGetMultipleAccountInfos(connection, [
        SYSVAR_CLOCK_PUBKEY,
        ...binArrayPubkeyArrayV2,
        ...lbPairKeys,
      ]);

    const positionBinArraysMapV2 = new Map();

    for (let i = 0; i < binArrayPubkeyArrayV2.length; i++) {
      const binArrayPubkey = binArrayPubkeyArrayV2[i];
      const binArrayAccInfoBufferV2 = binArraysAccInfo[i];
      if (binArrayAccInfoBufferV2) {
        const binArrayAccInfo = decodeAccount<BinArray>(
          program,
          "binArray",
          binArrayAccInfoBufferV2.data,
        );
        positionBinArraysMapV2.set(binArrayPubkey.toBase58(), binArrayAccInfo);
      }
    }

    const lbPairMap = new Map<string, LbPair>();
    for (
      let i = binArrayPubkeyArrayV2.length;
      i < binArraysAccInfo.length;
      i++
    ) {
      const lbPairPubkey = lbPairKeys[i - binArrayPubkeyArrayV2.length];
      const lbPairAccInfoBufferV2 = binArraysAccInfo[i];
      if (!lbPairAccInfoBufferV2)
        throw new Error(`LB Pair account ${lbPairPubkey.toBase58()} not found`);
      const lbPairAccInfo = decodeAccount<LbPair>(
        program,
        "lbPair",
        lbPairAccInfoBufferV2.data,
      );
      lbPairMap.set(lbPairPubkey.toBase58(), lbPairAccInfo);
    }

    const accountKeys = Array.from(lbPairMap.values())
      .map(({ reserveX, reserveY, tokenXMint, tokenYMint }) => [
        reserveX,
        reserveY,
        tokenXMint,
        tokenYMint,
      ])
      .flat();

    const accountInfos = await chunkedGetMultipleAccountInfos(
      program.provider.connection,
      accountKeys,
    );

    const lbPairReserveMap = new Map<
      string,
      { reserveX: bigint; reserveY: bigint }
    >();

    const lbPairMintMap = new Map<
      string,
      {
        mintX: Mint;
        mintY: Mint;
        rewardMint0: Mint | null;
        rewardMint1: Mint | null;
      }
    >();

    lbPairKeys.forEach((lbPair, idx) => {
      const index = idx * 4;
      const reserveXAccount = accountInfos[index];
      const reserveYAccount = accountInfos[index + 1];

      if (!reserveXAccount || !reserveYAccount)
        throw new Error(
          `Reserve account for LB Pair ${lbPair.toBase58()} not found`,
        );

      const reserveAccX = AccountLayout.decode(reserveXAccount.data);
      const reserveAccY = AccountLayout.decode(reserveYAccount.data);

      lbPairReserveMap.set(lbPair.toBase58(), {
        reserveX: reserveAccX.amount,
        reserveY: reserveAccY.amount,
      });

      const mintXAccount = accountInfos[index + 2];
      const mintYAccount = accountInfos[index + 3];
      if (!mintXAccount || !mintYAccount)
        throw new Error(
          `Mint account for LB Pair ${lbPair.toBase58()} not found`,
        );

      const mintX = unpackMint(
        reserveAccX.mint,
        mintXAccount,
        mintXAccount.owner,
      );

      const mintY = unpackMint(
        reserveAccY.mint,
        mintYAccount,
        mintYAccount.owner,
      );

      const rewardMint0Account = accountInfos[index + 4];
      const rewardMint1Account = accountInfos[index + 5];

      const lbPairState = lbPairMap.get(lbPair.toBase58());

      let rewardMint0: Mint | null = null;
      let rewardMint1: Mint | null = null;

      // if (!lbPairState.rewardInfos[0].mint.equals(PublicKey.default)) {
      //   rewardMint0 = unpackMint(
      //     lbPairState.rewardInfos[0].mint,
      //     rewardMint0Account,
      //     rewardMint0Account.owner,
      //   );
      // }

      // if (!lbPairState.rewardInfos[1].mint.equals(PublicKey.default)) {
      //   rewardMint1 = unpackMint(
      //     lbPairState.rewardInfos[1].mint,
      //     rewardMint1Account,
      //     rewardMint1Account.owner,
      //   );
      // }

      lbPairMintMap.set(lbPair.toBase58(), {
        mintX,
        mintY,
        rewardMint0,
        rewardMint1,
      });
    });

    const clock: Clock = ClockLayout.decode(clockAccInfo.data);

    const positionsMap: Map<
      string,
      {
        publicKey: PublicKey;
        lbPair: LbPair;
        tokenX: TokenReserve;
        tokenY: TokenReserve;
        lbPairPositionsData: Array<{
          publicKey: PublicKey;
          positionData: PositionData;
        }>;
      }
    > = new Map();

    for (const position of positionWrappers) {
      const lbPair = position.lbPair();
      const positionPubkey = position.address();

      const lbPairAcc = lbPairMap.get(lbPair.toBase58());
      const { mintX, mintY, rewardMint0, rewardMint1 } = lbPairMintMap.get(
        lbPair.toBase58(),
      );

      const reserveXBalance =
        lbPairReserveMap.get(lbPair.toBase58())?.reserveX ?? BigInt(0);
      const reserveYBalance =
        lbPairReserveMap.get(lbPair.toBase58())?.reserveY ?? BigInt(0);

      // const { tokenXProgram, tokenYProgram } = getTokenProgramId(lbPairAcc);

      const tokenX: TokenReserve = {
        publicKey: lbPairAcc.tokenXMint,
        reserve: lbPairAcc.reserveX,
        amount: reserveXBalance,
        mint: mintX,
        owner: TOKEN_PROGRAM_ID,
        transferHookAccountMetas: [], // No need, the TokenReserve created just for processing position info, doesn't require any transaction
      };

      const tokenY: TokenReserve = {
        publicKey: lbPairAcc.tokenYMint,
        reserve: lbPairAcc.reserveY,
        amount: reserveYBalance,
        mint: mintY,
        owner: TOKEN_PROGRAM_ID,
        transferHookAccountMetas: [], // No need, the TokenReserve created just for processing position info, doesn't require any transaction
      };

      const positionData = await DLMM.processPosition(
        program,
        lbPairAcc,
        clock,
        position,
        mintX,
        mintY,
        rewardMint0,
        rewardMint1,
        positionBinArraysMapV2,
      );

      if (positionData) {
        positionsMap.set(lbPair.toBase58(), {
          publicKey: lbPair,
          lbPair: lbPairAcc,
          tokenX,
          tokenY,
          lbPairPositionsData: [
            ...(positionsMap.get(lbPair.toBase58())?.lbPairPositionsData ?? []),
            {
              publicKey: positionPubkey,
              positionData,
            },
          ],
        });
      }
    }

    return positionsMap;
  }

  public static getPricePerLamport(
    tokenXDecimal: number,
    tokenYDecimal: number,
    price: number,
  ): string {
    return new Decimal(price)
      .mul(new Decimal(10 ** (tokenYDecimal - tokenXDecimal)))
      .toString();
  }

  public static getBinIdFromPrice(
    price: string | number | Decimal,
    binStep: number,
    min: boolean,
  ): number {
    const binStepNum = new Decimal(binStep).div(new Decimal(BASIS_POINT_MAX));
    const binId = new Decimal(price)
      .log()
      .dividedBy(new Decimal(1).add(binStepNum).log());
    return (min ? binId.floor() : binId.ceil()).toNumber();
  }

  /**
   * Create a new liquidity pair. Support only token program.
   * @param connection A connection to the Solana cluster.
   * @param funder The public key of the funder of the pair.
   * @param tokenX The mint of the first token.
   * @param tokenY The mint of the second token.
   * @param binStep The bin step for the pair.
   * @param baseFactor The base factor for the pair.
   * @param activeId The ID of the initial active bin. Represent the starting price.
   * @param opt An options object.
   * @returns A transaction that creates the pair.
   * @throws If the pair already exists.
   */
  public static async createLbPair(
    connection: Connection,
    funder: PublicKey,
    tokenX: PublicKey,
    tokenY: PublicKey,
    binStep: BN,
    baseFactor: BN,
    // presetParameter: PublicKey,
    activeId: BN,
    opt?: Opt,
  ): Promise<Transaction> {
    const program = createProgram(connection, opt);

    const existsPool = await this.getPairPubkeyIfExists(
      connection,
      tokenX,
      tokenY,
      binStep,
      baseFactor,
      opt,
    );

    if (existsPool) {
      throw new Error("Pool already exists");
    }
    const [lbPair] = deriveLbPair(tokenX, tokenY, binStep, program.programId);

    const [reserveX] = deriveReserve(tokenX, lbPair, program.programId);
    const [reserveY] = deriveReserve(tokenY, lbPair, program.programId);

    // INFO: Oracle currently not supported
    // const [oracle] = deriveOracle(lbPair, program.programId);

    const activeBinArrayIndex = binIdToBinArrayIndex(activeId);
    // const binArrayBitmapExtension = isOverflowDefaultBinArrayBitmap(
    //   activeBinArrayIndex,
    // )
    //   ? deriveBinArrayBitmapExtension(lbPair, program.programId)[0]
    //   : null;

    const instructions: Array<TransactionInstruction> = [];

    const lbPairIx = await program.methods
      .initializeLbPair(activeId.toNumber(), binStep.toNumber())
      .accountsPartial({
        funder,
        feeOwner: funder,
        lbPair,
        rent: SYSVAR_RENT_PUBKEY,
        reserveX,
        reserveY,
        tokenMintX: tokenX,
        tokenMintY: tokenY,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .instruction();

    instructions.push(lbPairIx);

    const [binArrayBitmapExtension] = deriveBinArrayBitmapExtension(
      lbPair,
      program.programId,
    );
    const binArrayBitmapExtensionIx = await program.methods
      .initializeBinArrayBitmapExtension()
      .accountsPartial({
        funder,
        lbPair,
        binArrayBitmapExtension,
        systemProgram: SystemProgram.programId,
      })
      .instruction();

    instructions.push(binArrayBitmapExtensionIx);

    const setCUIx = await getEstimatedComputeUnitIxWithBuffer(
      connection,
      instructions,
      funder,
    );

    instructions.unshift(setCUIx);

    const { blockhash, lastValidBlockHeight } =
      await connection.getLatestBlockhash("confirmed");

    return new Transaction({
      blockhash,
      lastValidBlockHeight,
      feePayer: funder,
    }).add(...instructions);
  }

  /**
   * The function `refetchStates` retrieves and updates various states and data related to bin arrays
   * and lb pairs.
   */
  public async refetchStates(): Promise<void> {
    const binArrayBitmapExtensionPubkey = deriveBinArrayBitmapExtension(
      this.pubkey,
      this.program.programId,
    )[0];

    const [
      lbPairAccountInfo,
      binArrayBitmapExtensionAccountInfo,
      reserveXAccountInfo,
      reserveYAccountInfo,
      mintXAccountInfo,
      mintYAccountInfo,
      // reward0VaultAccountInfo,
      // reward1VaultAccountInfo,
      // rewardMint0AccountInfo,
      // rewardMint1AccountInfo,
      clockAccountInfo,
    ] = await chunkedGetMultipleAccountInfos(this.program.provider.connection, [
      this.pubkey,
      binArrayBitmapExtensionPubkey,
      this.lbPair.reserveX,
      this.lbPair.reserveY,
      this.lbPair.tokenXMint,
      this.lbPair.tokenYMint,
      // this.lbPair.rewardInfos[0].vault,
      // this.lbPair.rewardInfos[1].vault,
      // this.lbPair.rewardInfos[0].mint,
      // this.lbPair.rewardInfos[1].mint,
      SYSVAR_CLOCK_PUBKEY,
    ]);

    const lbPairState = decodeAccount<LbPair>(
      this.program,
      "lbPair",
      lbPairAccountInfo.data,
    );
    if (binArrayBitmapExtensionAccountInfo) {
      const binArrayBitmapExtensionState =
        decodeAccount<BinArrayBitmapExtension>(
          this.program,
          "binArrayBitmapExtension",
          binArrayBitmapExtensionAccountInfo.data,
        );

      if (binArrayBitmapExtensionState) {
        this.binArrayBitmapExtension = {
          account: binArrayBitmapExtensionState,
          publicKey: binArrayBitmapExtensionPubkey,
        };
      }
    }

    const reserveXBalance = AccountLayout.decode(reserveXAccountInfo.data);
    const reserveYBalance = AccountLayout.decode(reserveYAccountInfo.data);

    const [
      tokenXTransferHook,
      tokenYTransferHook,
      // reward0TransferHook,
      // reward1TransferHook,
    ] = await Promise.all([
      getExtraAccountMetasForTransferHook(
        this.program.provider.connection,
        lbPairState.tokenXMint,
        mintXAccountInfo,
      ),
      getExtraAccountMetasForTransferHook(
        this.program.provider.connection,
        lbPairState.tokenYMint,
        mintYAccountInfo,
      ),
      // rewardMint0AccountInfo
      //   ? getExtraAccountMetasForTransferHook(
      //       this.program.provider.connection,
      //       lbPairState.rewardInfos[0].mint,
      //       rewardMint0AccountInfo,
      //     )
      //   : [],
      // rewardMint1AccountInfo
      //   ? getExtraAccountMetasForTransferHook(
      //       this.program.provider.connection,
      //       lbPairState.rewardInfos[1].mint,
      //       rewardMint1AccountInfo,
      //     )
      //   : [],
    ]);

    const mintX = unpackMint(
      this.tokenX.publicKey,
      mintXAccountInfo,
      mintXAccountInfo.owner,
    );

    const mintY = unpackMint(
      this.tokenY.publicKey,
      mintYAccountInfo,
      mintYAccountInfo.owner,
    );

    this.tokenX = {
      amount: reserveXBalance.amount,
      mint: mintX,
      publicKey: lbPairState.tokenXMint,
      reserve: lbPairState.reserveX,
      owner: mintXAccountInfo.owner,
      transferHookAccountMetas: tokenXTransferHook,
    };

    this.tokenY = {
      amount: reserveYBalance.amount,
      mint: mintY,
      publicKey: lbPairState.tokenYMint,
      reserve: lbPairState.reserveY,
      owner: mintYAccountInfo.owner,
      transferHookAccountMetas: tokenYTransferHook,
    };

    this.rewards[0] = null;
    this.rewards[1] = null;

    // if (!lbPairState.rewardInfos[0].mint.equals(PublicKey.default)) {
    //   this.rewards[0] = {
    //     publicKey: lbPairState.rewardInfos[0].mint,
    //     reserve: lbPairState.rewardInfos[0].vault,
    //     mint: unpackMint(
    //       lbPairState.rewardInfos[0].mint,
    //       rewardMint0AccountInfo,
    //       rewardMint0AccountInfo.owner,
    //     ),
    //     amount: AccountLayout.decode(reward0VaultAccountInfo.data).amount,
    //     owner: rewardMint0AccountInfo.owner,
    //     transferHookAccountMetas: reward0TransferHook,
    //   };
    // }

    // if (!lbPairState.rewardInfos[1].mint.equals(PublicKey.default)) {
    //   this.rewards[1] = {
    //     publicKey: lbPairState.rewardInfos[1].mint,
    //     reserve: lbPairState.rewardInfos[1].vault,
    //     mint: unpackMint(
    //       lbPairState.rewardInfos[1].mint,
    //       rewardMint1AccountInfo,
    //       rewardMint1AccountInfo.owner,
    //     ),
    //     amount: AccountLayout.decode(reward1VaultAccountInfo.data).amount,
    //     owner: rewardMint1AccountInfo.owner,
    //     transferHookAccountMetas: reward1TransferHook,
    //   };
    // }

    const clock = ClockLayout.decode(clockAccountInfo.data) as Clock;
    this.clock = clock;

    this.lbPair = lbPairState;
  }

  /**
   * The function `getBinArrays` returns an array of `BinArrayAccount` objects
   * @returns a Promise that resolves to an array of BinArrayAccount objects.
   */
  public async getBinArrays(): Promise<BinArrayAccount[]> {
    return this.program.account.binArray.all([
      binArrayLbPairFilter(this.pubkey),
    ]);
  }

  /**
   * The function `getBinArrayAroundActiveBin` retrieves a specified number of `BinArrayAccount`
   * objects from the blockchain, based on the active bin and its surrounding bin arrays.
   * @param
   *    swapForY - The `swapForY` parameter is a boolean value that indicates whether the swap is using quote token as input.
   *    [count=4] - The `count` parameter is the number of bin arrays to retrieve on left and right respectively. By default, it is set to 4.
   * @returns an array of `BinArrayAccount` objects.
   */
  public async getBinArrayForSwap(
    swapForY: boolean,
    count = 4,
  ): Promise<BinArrayAccount[]> {
    await this.refetchStates();

    const binArraysPubkey = new Set<string>();

    let shouldStop = false;
    let activeIdToLoop = this.lbPair.activeId;

    while (!shouldStop) {
      const binArrayIndex = findNextBinArrayIndexWithLiquidity(
        swapForY,
        new BN(activeIdToLoop),
        this.lbPair,
        this.binArrayBitmapExtension?.account ?? null,
      );
      if (binArrayIndex === null) shouldStop = true;
      else {
        const [binArrayPubKey] = deriveBinArray(
          this.pubkey,
          binArrayIndex,
          this.program.programId,
        );
        binArraysPubkey.add(binArrayPubKey.toBase58());

        const [lowerBinId, upperBinId] =
          getBinArrayLowerUpperBinId(binArrayIndex);
        activeIdToLoop = swapForY
          ? lowerBinId.toNumber() - 1
          : upperBinId.toNumber() + 1;
      }

      if (binArraysPubkey.size === count) shouldStop = true;
    }

    const accountsToFetch = Array.from(binArraysPubkey).map(
      (pubkey) => new PublicKey(pubkey),
    );

    const binArraysAccInfoBuffer = await chunkedGetMultipleAccountInfos(
      this.program.provider.connection,
      accountsToFetch,
    );

    const binArrays: BinArrayAccount[] = await Promise.all(
      binArraysAccInfoBuffer.map(async (accInfo, idx) => {
        const account = decodeAccount<BinArray>(
          this.program,
          "binArray",
          accInfo.data,
        );
        const publicKey = accountsToFetch[idx];
        return {
          account,
          publicKey,
        };
      }),
    );

    return binArrays;
  }

  /**
   * The function `calculateFeeInfo` calculates the base fee rate percentage and maximum fee rate percentage
   * given the base factor, bin step, and optional base fee power factor.
   * @param baseFactor - The base factor of the pair.
   * @param binStep - The bin step of the pair.
   * @param baseFeePowerFactor - Optional parameter to allow small bin step to have bigger fee rate. Default to 0.
   * @returns an object of type `Omit<FeeInfo, "protocolFeePercentage">` with the following properties: baseFeeRatePercentage and maxFeeRatePercentage.
   */
  public static calculateFeeInfo(
    baseFactor: number | string,
    binStep: number | string,
    baseFeePowerFactor?: number | string,
  ): Omit<FeeInfo, "protocolFeePercentage"> {
    const baseFeeRate = new BN(baseFactor)
      .mul(new BN(binStep))
      .mul(new BN(10))
      .mul(new BN(10).pow(new BN(baseFeePowerFactor ?? 0)));
    const baseFeeRatePercentage = new Decimal(baseFeeRate.toString())
      .mul(new Decimal(100))
      .div(new Decimal(FEE_PRECISION.toString()));
    const maxFeeRatePercentage = new Decimal(MAX_FEE_RATE.toString())
      .mul(new Decimal(100))
      .div(new Decimal(FEE_PRECISION.toString()));

    return {
      baseFeeRatePercentage,
      maxFeeRatePercentage,
    };
  }

  /**
   * The function `getFeeInfo` calculates and returns the base fee rate percentage, maximum fee rate
   * percentage, and protocol fee percentage.
   * @returns an object of type `FeeInfo` with the following properties: baseFeeRatePercentage, maxFeeRatePercentage, and protocolFeePercentage.
   */
  public getFeeInfo(): FeeInfo {
    const { baseFactor, protocolShare } = this.lbPair.parameters;

    const { baseFeeRatePercentage, maxFeeRatePercentage } =
      DLMM.calculateFeeInfo(
        baseFactor,
        this.lbPair.binStep,
        // this.lbPair.parameters.baseFeePowerFactor,
      );

    const protocolFeePercentage = new Decimal(protocolShare.toString())
      .mul(new Decimal(100))
      .div(new Decimal(BASIS_POINT_MAX));

    return {
      baseFeeRatePercentage,
      maxFeeRatePercentage,
      protocolFeePercentage,
    };
  }

  /**
   * The function calculates and returns a dynamic fee
   * @returns a Decimal value representing the dynamic fee.
   */
  public getDynamicFee(): Decimal {
    let vParameterClone = Object.assign({}, this.lbPair.vParameters);
    let activeId = new BN(this.lbPair.activeId);
    const sParameters = this.lbPair.parameters;

    const currentTimestamp = Date.now() / 1000;
    DLMM.updateReference(
      activeId.toNumber(),
      vParameterClone,
      sParameters,
      currentTimestamp,
    );
    DLMM.updateVolatilityAccumulator(
      vParameterClone,
      sParameters,
      activeId.toNumber(),
    );

    const totalFee = getTotalFee(
      this.lbPair.binStep,
      sParameters,
      vParameterClone,
    );
    return new Decimal(totalFee.toString())
      .div(new Decimal(FEE_PRECISION.toString()))
      .mul(100);
  }

  /**
   * The function `getBinsAroundActiveBin` retrieves a specified number of bins to the left and right
   * of the active bin and returns them along with the active bin ID.
   * @param {number} numberOfBinsToTheLeft - The parameter `numberOfBinsToTheLeft` represents the
   * number of bins to the left of the active bin that you want to retrieve. It determines how many
   * bins you want to include in the result that are positioned to the left of the active bin.
   * @param {number} numberOfBinsToTheRight - The parameter `numberOfBinsToTheRight` represents the
   * number of bins to the right of the active bin that you want to retrieve.
   * @returns an object with two properties: "activeBin" and "bins". The value of "activeBin" is the
   * value of "this.lbPair.activeId", and the value of "bins" is the result of calling the "getBins"
   * function with the specified parameters.
   */
  public async getBinsAroundActiveBin(
    numberOfBinsToTheLeft: number,
    numberOfBinsToTheRight: number,
  ): Promise<{ activeBin: number; bins: BinLiquidity[] }> {
    const lowerBinId = this.lbPair.activeId - numberOfBinsToTheLeft - 1;
    const upperBinId = this.lbPair.activeId + numberOfBinsToTheRight + 1;

    const bins = await this.getBins(
      this.pubkey,
      lowerBinId,
      upperBinId,
      this.tokenX.mint.decimals,
      this.tokenY.mint.decimals,
    );

    return { activeBin: this.lbPair.activeId, bins };
  }

  /**
   * The function `getBinsBetweenMinAndMaxPrice` retrieves a list of bins within a specified price
   * range.
   * @param {number} minPrice - The minimum price value for filtering the bins.
   * @param {number} maxPrice - The `maxPrice` parameter is the maximum price value that you want to
   * use for filtering the bins.
   * @returns an object with two properties: "activeBin" and "bins". The value of "activeBin" is the
   * active bin ID of the lbPair, and the value of "bins" is an array of BinLiquidity objects.
   */
  public async getBinsBetweenMinAndMaxPrice(
    minPrice: number,
    maxPrice: number,
  ): Promise<{ activeBin: number; bins: BinLiquidity[] }> {
    const lowerBinId = this.getBinIdFromPrice(minPrice, true) - 1;
    const upperBinId = this.getBinIdFromPrice(maxPrice, false) + 1;

    const bins = await this.getBins(
      this.pubkey,
      lowerBinId,
      upperBinId,
      this.tokenX.mint.decimals,
      this.tokenX.mint.decimals,
    );

    return { activeBin: this.lbPair.activeId, bins };
  }

  /**
   * The function `getBinsBetweenLowerAndUpperBound` retrieves a list of bins between a lower and upper
   * bin ID and returns the active bin ID and the list of bins.
   * @param {number} lowerBinId - The lowerBinId parameter is a number that represents the ID of the
   * lowest bin.
   * @param {number} upperBinId - The upperBinID parameter is a number that represents the ID of the
   * highest bin.
   * @param {BinArray} [lowerBinArray] - The `lowerBinArrays` parameter is an optional parameter of
   * type `BinArray`. It represents an array of bins that are below the lower bin ID.
   * @param {BinArray} [upperBinArray] - The parameter `upperBinArrays` is an optional parameter of
   * type `BinArray`. It represents an array of bins that are above the upper bin ID.
   * @returns an object with two properties: "activeBin" and "bins". The value of "activeBin" is the
   * active bin ID of the lbPair, and the value of "bins" is an array of BinLiquidity objects.
   */
  public async getBinsBetweenLowerAndUpperBound(
    lowerBinId: number,
    upperBinId: number,
    lowerBinArray?: BinArray,
    upperBinArray?: BinArray,
  ): Promise<{ activeBin: number; bins: BinLiquidity[] }> {
    const bins = await this.getBins(
      this.pubkey,
      lowerBinId,
      upperBinId,
      this.tokenX.mint.decimals,
      this.tokenY.mint.decimals,
      lowerBinArray,
      upperBinArray,
    );

    return { activeBin: this.lbPair.activeId, bins };
  }

  /**
   * The function converts a real price of bin to a lamport value
   * @param {number} price - The `price` parameter is a number representing the price of a token.
   * @returns {string} price per Lamport of bin
   */
  public toPricePerLamport(price: number): string {
    return DLMM.getPricePerLamport(
      this.tokenX.mint.decimals,
      this.tokenY.mint.decimals,
      price,
    );
  }

  /**
   * The function converts a price per lamport value to a real price of bin
   * @param {number} pricePerLamport - The parameter `pricePerLamport` is a number representing the
   * price per lamport.
   * @returns {string} real price of bin
   */
  public fromPricePerLamport(pricePerLamport: number): string {
    return new Decimal(pricePerLamport)
      .div(
        new Decimal(
          10 ** (this.tokenY.mint.decimals - this.tokenX.mint.decimals),
        ),
      )
      .toString();
  }

  /**
   * The function retrieves the active bin ID and its corresponding price.
   * @returns an object with two properties: "binId" which is a number, and "price" which is a string.
   */
  public async getActiveBin(): Promise<BinLiquidity> {
    const { activeId } = await this.program.account.lbPair.fetch(this.pubkey);
    const [activeBinState] = await this.getBins(
      this.pubkey,
      activeId,
      activeId,
      this.tokenX.mint.decimals,
      this.tokenY.mint.decimals,
    );
    return activeBinState;
  }

  /**
   * The function get bin ID based on a given price and a boolean flag indicating whether to
   * round down or up.
   * @param {number} price - The price parameter is a number that represents the price value.
   * @param {boolean} min - The "min" parameter is a boolean value that determines whether to round
   * down or round up the calculated binId. If "min" is true, the binId will be rounded down (floor),
   * otherwise it will be rounded up (ceil).
   * @returns {number} which is the binId calculated based on the given price and whether the minimum
   * value should be used.
   */
  public getBinIdFromPrice(price: number, min: boolean): number {
    return DLMM.getBinIdFromPrice(price, this.lbPair.binStep, min);
  }

  /**
   * The function `getPositionsByUserAndLbPair` retrieves positions by user and LB pair, including
   * active bin and user positions.
   * @param {PublicKey} [userPubKey] - The `userPubKey` parameter is an optional parameter of type
   * `PublicKey`. It represents the public key of a user. If no `userPubKey` is provided, the function
   * will return an object with an empty `userPositions` array and the active bin information obtained
   * from the `getActive
   * @returns The function `getPositionsByUserAndLbPair` returns a Promise that resolves to an object
   * with two properties:
   *    - "activeBin" which is an object with two properties: "binId" and "price". The value of "binId"
   *     is the active bin ID of the lbPair, and the value of "price" is the price of the active bin.
   *   - "userPositions" which is an array of Position objects.
   */
  public async getPositionsByUserAndLbPair(userPubKey?: PublicKey): Promise<{
    activeBin: BinLiquidity;
    userPositions: Array<LbPosition>;
  }> {
    const promiseResults = await Promise.all([
      this.getActiveBin(),
      userPubKey &&
        this.program.provider.connection.getProgramAccounts(
          this.program.programId,
          {
            filters: [
              positionV2Filter(),
              positionOwnerFilter(userPubKey),
              positionLbPairFilter(this.pubkey),
            ],
          },
        ),
    ]);

    const [activeBin, position] = promiseResults;

    if (!activeBin) {
      throw new Error("Error fetching active bin");
    }

    if (!userPubKey) {
      return {
        activeBin,
        userPositions: [],
      };
    }

    const positions = [
      ...position.map((p) => wrapPosition(this.program, p.pubkey, p.account)),
    ];

    if (!positions) {
      throw new Error("Error fetching positions");
    }

    const binArrayPubkeySetV2 = new Set<string>();
    positions.forEach((position) => {
      const binArrayKeys = position.getBinArrayKeysCoverage(
        this.program.programId,
      );

      binArrayKeys.forEach((key) => {
        binArrayPubkeySetV2.add(key.toBase58());
      });
    });

    const binArrayPubkeyArrayV2 = Array.from(binArrayPubkeySetV2).map(
      (pubkey) => new PublicKey(pubkey),
    );

    const lbPairAndBinArrays = await chunkedGetMultipleAccountInfos(
      this.program.provider.connection,
      [this.pubkey, SYSVAR_CLOCK_PUBKEY, ...binArrayPubkeyArrayV2],
    );

    const [lbPairAccInfo, clockAccInfo, ...binArraysAccInfo] =
      lbPairAndBinArrays;

    const positionBinArraysMapV2 = new Map();
    for (let i = 0; i < binArraysAccInfo.length; i++) {
      const binArrayPubkey = binArrayPubkeyArrayV2[i];
      const binArrayAccBufferV2 = binArraysAccInfo[i];
      if (binArrayAccBufferV2) {
        const binArrayAccInfo = decodeAccount<BinArray>(
          this.program,
          "binArray",
          binArrayAccBufferV2.data,
        );
        positionBinArraysMapV2.set(binArrayPubkey.toBase58(), binArrayAccInfo);
      }
    }

    if (!lbPairAccInfo)
      throw new Error(`LB Pair account ${this.pubkey.toBase58()} not found`);

    const clock: Clock = ClockLayout.decode(clockAccInfo.data);

    const userPositions = await Promise.all(
      positions.map(async (position) => {
        return {
          publicKey: position.address(),
          positionData: await DLMM.processPosition(
            this.program,
            this.lbPair,
            clock,
            position,
            this.tokenX.mint,
            this.tokenY.mint,
            this.rewards[0]?.mint,
            this.rewards[1]?.mint,
            positionBinArraysMapV2,
          ),
        };
      }),
    );

    return {
      activeBin,
      userPositions,
    };
  }

  /**
     * Creates a new empty position covering bins from minBinId to
    maxBinId.
     *
     * @param minBinId - Lower bin ID (bins below active contain
    token Y)
     * @param maxBinId - Upper bin ID (bins above active contain
    token X)
     * @param user - Position owner wallet
     * @returns [positionPubKey, transaction] - Position address
    and transaction to sign
  */
  public async createEmptyPosition({
    minBinId,
    maxBinId,
    user,
  }: {
    minBinId: number;
    maxBinId: number;
    user: PublicKey;
  }): Promise<[PublicKey, Transaction]> {
    const width = maxBinId - minBinId + 1;
    const minBinIdBn = new BN(minBinId);
    const maxBinIdBn = new BN(maxBinId);

    const [positionPubKey] = derivePosition(
      this.pubkey,
      user,
      minBinId,
      width,
      this.program.programId,
    );

    const account =
      await this.program.account.position.fetchNullable(positionPubKey);
    if (account) {
      throw new Error(
        `Position with minBinId: ${minBinId} and maxBinId: ${maxBinId} already exists!`,
      );
    }

    const createPositionIx = await this.program.methods
      .initializePosition(minBinId, width)
      .accountsPartial({
        position: positionPubKey,
        lbPair: this.pubkey,
        owner: user,
        payer: user,
      })
      .instruction();

    const binArrayIndexes = getBinArrayIndexesCoverage(minBinIdBn, maxBinIdBn);

    const createBinArrayIxs = await this.createBinArraysIfNeeded(
      binArrayIndexes,
      user,
    );

    const instructions = [createPositionIx, ...createBinArrayIxs];
    const setCUIx = await getEstimatedComputeUnitIxWithBuffer(
      this.program.provider.connection,
      instructions,
      user,
    );

    const { blockhash, lastValidBlockHeight } =
      await this.program.provider.connection.getLatestBlockhash("confirmed");
    const tx = new Transaction({
      blockhash,
      lastValidBlockHeight,
      feePayer: user,
    }).add(setCUIx, ...instructions);
    return [positionPubKey, tx];
  }

  /**
   * The function `getPosition` retrieves position information for a given public key and processes it
   * using various data to return a `LbPosition` object.
   * @param {PublicKey} positionPubKey - The `getPosition` function you provided is an asynchronous
   * function that fetches position information based on a given public key. Here's a breakdown of the
   * parameters used in the function:
   * @returns The `getPosition` function returns a Promise that resolves to an object of type
   * `LbPosition`. The object contains the following properties:
   * - `publicKey`: The public key of the position account
   * - `positionData`: Position Object
   */
  public async getPosition(positionPubKey: PublicKey): Promise<LbPosition> {
    const positionAccountInfo =
      await this.program.provider.connection.getAccountInfo(positionPubKey);

    if (!positionAccountInfo) {
      throw new Error(
        `Position account ${positionPubKey.toBase58()} not found`,
      );
    }

    let position: IPosition = wrapPosition(
      this.program,
      positionPubKey,
      positionAccountInfo,
    );

    const binArrayKeys = position.getBinArrayKeysCoverage(
      this.program.programId,
    );

    const [clockAccInfo, ...binArrayAccountsInfo] =
      await chunkedGetMultipleAccountInfos(this.program.provider.connection, [
        SYSVAR_CLOCK_PUBKEY,
        ...binArrayKeys,
      ]);

    const clock: Clock = ClockLayout.decode(clockAccInfo.data);

    const binArrayMap = new Map<String, BinArray>();

    for (let i = 0; i < binArrayAccountsInfo.length; i++) {
      if (binArrayAccountsInfo[i]) {
        const binArrayState = decodeAccount<BinArray>(
          this.program,
          "binArray",
          binArrayAccountsInfo[i].data,
        );

        binArrayMap.set(binArrayKeys[i].toBase58(), binArrayState);
      }
    }

    return {
      publicKey: positionPubKey,
      positionData: await DLMM.processPosition(
        this.program,
        this.lbPair,
        clock,
        position,
        this.tokenX.mint,
        this.tokenY.mint,
        this.rewards[0]?.mint,
        this.rewards[1]?.mint,
        binArrayMap,
      ),
    };
  }

  /**
   * The function `initializePositionAndAddLiquidityByWeight` function is used to initializes a position and adds liquidity
   * @param {TInitializePositionAndAddLiquidityParams}
   *    - `totalXAmount`: The total amount of token X to be added to the liquidity pool.
   *    - `totalYAmount`: The total amount of token Y to be added to the liquidity pool.
   *    - `binLiquidityDist`: An array of objects of type `BinLiquidityDistribution` that represents (can use `calculateSpotDistribution`, `calculateBidAskDistribution` & `calculateNormalDistribution`)
   *    - `user`: The public key of the user account.
   * @returns {Promise<Transaction>} The function `initializePositionAndAddLiquidityByWeight` returns a `Promise` with a `Transaction`.
   */
  public async initializePositionAndAddLiquidityByWeight({
    totalXAmount,
    totalYAmount,
    binLiquidityDist,
    user,
  }: TInitializePositionAndAddLiquidityParams): Promise<Transaction> {
    const { lowerBinId, upperBinId, binIds } =
      this.processXYAmountDistribution(binLiquidityDist);

    if (upperBinId >= lowerBinId + DEFAULT_BIN_PER_POSITION.toNumber()) {
      throw new Error(
        `Position must be within a range of 1 to ${DEFAULT_BIN_PER_POSITION.toNumber()} bins.`,
      );
    }

    const preInstructions: Array<TransactionInstruction> = [];

    const width = upperBinId - lowerBinId + 1;
    const lowerBinIdBN = new BN(lowerBinId);
    const upperBinIdBN = new BN(upperBinId);

    const [positionPubKey] = derivePosition(
      this.pubkey,
      user,
      lowerBinId,
      width,
      this.program.programId,
    );

    const position =
      await this.program.account.position.fetchNullable(positionPubKey);
    if (!position) {
      const initializePositionIx = await this.program.methods
        .initializePosition(lowerBinId, width)
        .accountsPartial({
          payer: user,
          position: positionPubKey,
          lbPair: this.pubkey,
          owner: user,
        })
        .instruction();
      preInstructions.push(initializePositionIx);
    }

    const lowerBinArrayIndex = binIdToBinArrayIndex(lowerBinIdBN);
    const [binArrayLower] = deriveBinArray(
      this.pubkey,
      lowerBinArrayIndex,
      this.program.programId,
    );

    const upperBinArrayIndex = BN.max(
      lowerBinArrayIndex.add(new BN(1)),
      binIdToBinArrayIndex(upperBinIdBN),
    );
    const [binArrayUpper] = deriveBinArray(
      this.pubkey,
      upperBinArrayIndex,
      this.program.programId,
    );

    const createBinArrayIxs = await this.createBinArraysIfNeeded(
      [lowerBinArrayIndex, upperBinArrayIndex],
      user,
    );
    preInstructions.push(...createBinArrayIxs);

    const [
      { ataPubKey: userTokenX, ix: createPayerTokenXIx },
      { ataPubKey: userTokenY, ix: createPayerTokenYIx },
    ] = await Promise.all([
      getOrCreateATAInstruction(
        this.program.provider.connection,
        this.tokenX.publicKey,
        user,
        this.tokenX.owner,
      ),
      getOrCreateATAInstruction(
        this.program.provider.connection,
        this.tokenY.publicKey,
        user,
        this.tokenY.owner,
      ),
    ]);
    createPayerTokenXIx && preInstructions.push(createPayerTokenXIx);
    createPayerTokenYIx && preInstructions.push(createPayerTokenYIx);

    if (
      this.tokenX.publicKey.equals(NATIVE_MINT) &&
      !totalXAmount.isZero() &&
      !this.opt?.skipSolWrappingOperation
    ) {
      const wrapSOLIx = wrapSOLInstruction(
        user,
        userTokenX,
        BigInt(totalXAmount.toString()),
      );

      preInstructions.push(...wrapSOLIx);
    }

    if (
      this.tokenY.publicKey.equals(NATIVE_MINT) &&
      !totalYAmount.isZero() &&
      !this.opt?.skipSolWrappingOperation
    ) {
      const wrapSOLIx = wrapSOLInstruction(
        user,
        userTokenY,
        BigInt(totalYAmount.toString()),
      );

      preInstructions.push(...wrapSOLIx);
    }

    const postInstructions: Array<TransactionInstruction> = [];
    if (
      [
        this.tokenX.publicKey.toBase58(),
        this.tokenY.publicKey.toBase58(),
      ].includes(NATIVE_MINT.toBase58()) &&
      !this.opt?.skipSolWrappingOperation
    ) {
      const closeWrappedSOLIx = await unwrapSOLInstruction(user);
      closeWrappedSOLIx && postInstructions.push(closeWrappedSOLIx);
    }

    const minBinId = Math.min(...binIds);
    const maxBinId = Math.max(...binIds);

    const minBinArrayIndex = binIdToBinArrayIndex(new BN(minBinId));
    const maxBinArrayIndex = binIdToBinArrayIndex(new BN(maxBinId));

    const useExtension =
      isOverflowDefaultBinArrayBitmap(minBinArrayIndex) ||
      isOverflowDefaultBinArrayBitmap(maxBinArrayIndex);

    const binArrayBitmapExtension = useExtension
      ? deriveBinArrayBitmapExtension(this.pubkey, this.program.programId)[0]
      : null;

    if (binLiquidityDist.length === 0) {
      throw new Error("No liquidity to add");
    }

    const liquidityParams: LiquidityParameter = {
      amountX: totalXAmount,
      amountY: totalYAmount,
      binLiquidityDist,
    };

    const addLiqIx = await this.program.methods
      .addLiquidity(liquidityParams)
      .accountsPartial({
        position: positionPubKey,
        lbPair: this.pubkey,
        userTokenX,
        userTokenY,
        reserveX: this.lbPair.reserveX,
        reserveY: this.lbPair.reserveY,
        tokenXMint: this.lbPair.tokenXMint,
        tokenYMint: this.lbPair.tokenYMint,
        binArrayBitmapExtension,
        sender: user,
        tokenXProgram: TOKEN_PROGRAM_ID,
        tokenYProgram: TOKEN_PROGRAM_ID,
      })
      .remainingAccounts([
        { pubkey: binArrayLower, isSigner: false, isWritable: true },
        { pubkey: binArrayUpper, isSigner: false, isWritable: true },
      ])
      .instruction();

    const instructions = [...preInstructions, addLiqIx, ...postInstructions];

    const setCUIx = await getEstimatedComputeUnitIxWithBuffer(
      this.program.provider.connection,
      instructions,
      user,
    );

    instructions.unshift(setCUIx);

    const { blockhash, lastValidBlockHeight } =
      await this.program.provider.connection.getLatestBlockhash("confirmed");
    return new Transaction({
      blockhash,
      lastValidBlockHeight,
      feePayer: user,
    }).add(...instructions);
  }

  /**
   * The `addLiquidityByWeight` function is used to add liquidity to existing position
   * @param {TAddLiquidityParams}
   *    - `positionPubKey`: The public key of the position account. (use `createEmptyPosition`)
   *    - `totalXAmount`: The total amount of token X to be added to the liquidity pool.
   *    - `totalYAmount`: The total amount of token Y to be added to the liquidity pool.
   *    - `binLiquidityDist`: An array of objects of type `BinLiquidityDistribution` that represents (can use `calculateSpotDistribution`, `calculateBidAskDistribution` & `calculateNormalDistribution`)
   *    - `user`: The public key of the user account.
   * @returns {Promise<Transaction>} The function `addLiquidityByWeight` returns a `Promise` with a `Transaction`
   */
  public async addLiquidityByWeight({
    positionPubKey,
    totalXAmount,
    totalYAmount,
    binLiquidityDist,
    user,
  }: TAddLiquidityParams): Promise<Transaction> {
    const positionAccount =
      await this.program.account.position.fetch(positionPubKey);
    const { lowerBinId, upperBinId, binIds } =
      this.processXYAmountDistribution(binLiquidityDist);

    if (lowerBinId < positionAccount.lowerBinId)
      throw new Error(
        `Lower Bin ID (${lowerBinId}) lower than Position Lower Bin Id (${positionAccount.lowerBinId})`,
      );
    if (upperBinId > positionAccount.upperBinId)
      throw new Error(
        `Upper Bin ID (${upperBinId}) higher than Position Upper Bin Id (${positionAccount.upperBinId})`,
      );

    const minBinId = Math.min(...binIds);
    const maxBinId = Math.max(...binIds);

    const minBinArrayIndex = binIdToBinArrayIndex(new BN(minBinId));
    const maxBinArrayIndex = binIdToBinArrayIndex(new BN(maxBinId));

    const useExtension =
      isOverflowDefaultBinArrayBitmap(minBinArrayIndex) ||
      isOverflowDefaultBinArrayBitmap(maxBinArrayIndex);

    const binArrayBitmapExtension = useExtension
      ? deriveBinArrayBitmapExtension(this.pubkey, this.program.programId)[0]
      : null;

    if (binLiquidityDist.length === 0) {
      throw new Error("No liquidity to add");
    }

    const lowerBinArrayIndex = binIdToBinArrayIndex(
      new BN(positionAccount.lowerBinId),
    );
    const [binArrayLower] = deriveBinArray(
      this.pubkey,
      lowerBinArrayIndex,
      this.program.programId,
    );

    const upperBinArrayIndex = BN.max(
      lowerBinArrayIndex.add(new BN(1)),
      binIdToBinArrayIndex(new BN(positionAccount.upperBinId)),
    );

    const [binArrayUpper] = deriveBinArray(
      this.pubkey,
      upperBinArrayIndex,
      this.program.programId,
    );

    const preInstructions: TransactionInstruction[] = [];
    const createBinArrayIxs = await this.createBinArraysIfNeeded(
      [lowerBinArrayIndex, upperBinArrayIndex],
      user,
    );
    preInstructions.push(...createBinArrayIxs);

    const [
      { ataPubKey: userTokenX, ix: createPayerTokenXIx },
      { ataPubKey: userTokenY, ix: createPayerTokenYIx },
    ] = await Promise.all([
      getOrCreateATAInstruction(
        this.program.provider.connection,
        this.tokenX.publicKey,
        user,
        this.tokenX.owner,
      ),
      getOrCreateATAInstruction(
        this.program.provider.connection,
        this.tokenY.publicKey,
        user,
        this.tokenY.owner,
      ),
    ]);
    createPayerTokenXIx && preInstructions.push(createPayerTokenXIx);
    createPayerTokenYIx && preInstructions.push(createPayerTokenYIx);

    if (
      this.tokenX.publicKey.equals(NATIVE_MINT) &&
      !totalXAmount.isZero() &&
      !this.opt?.skipSolWrappingOperation
    ) {
      const wrapSOLIx = wrapSOLInstruction(
        user,
        userTokenX,
        BigInt(totalXAmount.toString()),
      );

      preInstructions.push(...wrapSOLIx);
    }

    if (
      this.tokenY.publicKey.equals(NATIVE_MINT) &&
      !totalYAmount.isZero() &&
      !this.opt?.skipSolWrappingOperation
    ) {
      const wrapSOLIx = wrapSOLInstruction(
        user,
        userTokenY,
        BigInt(totalYAmount.toString()),
      );

      preInstructions.push(...wrapSOLIx);
    }

    const postInstructions: Array<TransactionInstruction> = [];
    if (
      [
        this.tokenX.publicKey.toBase58(),
        this.tokenY.publicKey.toBase58(),
      ].includes(NATIVE_MINT.toBase58()) &&
      !this.opt?.skipSolWrappingOperation
    ) {
      const closeWrappedSOLIx = await unwrapSOLInstruction(user);
      closeWrappedSOLIx && postInstructions.push(closeWrappedSOLIx);
    }

    const liquidityParams: LiquidityParameter = {
      amountX: totalXAmount,
      amountY: totalYAmount,
      binLiquidityDist: binLiquidityDist,
    };

    const addLiquidityAccounts = {
      position: positionPubKey,
      lbPair: this.pubkey,
      binArrayBitmapExtension,
      userTokenX,
      userTokenY,
      reserveX: this.lbPair.reserveX,
      reserveY: this.lbPair.reserveY,
      tokenXMint: this.lbPair.tokenXMint,
      tokenYMint: this.lbPair.tokenYMint,
      sender: user,
      tokenXProgram: TOKEN_PROGRAM_ID,
      tokenYProgram: TOKEN_PROGRAM_ID,
    };

    const addLiqIx = await this.program.methods
      .addLiquidity(liquidityParams)
      .accountsPartial(addLiquidityAccounts)
      .remainingAccounts([
        { pubkey: binArrayLower, isSigner: false, isWritable: true },
        { pubkey: binArrayUpper, isSigner: false, isWritable: true },
      ])
      .instruction();

    const instructions = [...preInstructions, addLiqIx, ...postInstructions];

    const setCUIx = await getEstimatedComputeUnitIxWithBuffer(
      this.program.provider.connection,
      instructions,
      user,
    );

    instructions.unshift(setCUIx);

    const { blockhash, lastValidBlockHeight } =
      await this.program.provider.connection.getLatestBlockhash("confirmed");
    return new Transaction({
      blockhash,
      lastValidBlockHeight,
      feePayer: user,
    }).add(...instructions);
  }

  //TODO: Fix remove Liquidity implementation
  // /**
  //  * The `removeLiquidity` function is used to remove liquidity from a position,
  //  * with the option to claim rewards and close the position.
  //  * @param
  //  *    - `user`: The public key of the user account.
  //  *    - `position`: The public key of the position account.
  //  *    - `fromBinId`: The ID of the starting bin to remove liquidity from. Must within position range.
  //  *    - `toBinId`: The ID of the ending bin to remove liquidity from. Must within position range.
  //  *    - `liquiditiesBpsToRemove`: An array of numbers (percentage) that represent the liquidity to remove from each bin.
  //  *    - `shouldClaimAndClose`: A boolean flag that indicates whether to claim rewards and close the position.
  //  *    - `skipUnwrapSOL`: A boolean flag that indicates whether to skip unwrapping SOL. Enable this when using zap-sdk to ensure accuracy in SOL zap out amount when SOL is in token
  //  * @returns {Promise<Transaction[]>}
  //  */
  // public async removeLiquidity({
  //   user,
  //   position,
  //   fromBinId,
  //   toBinId,
  //   bps,
  //   shouldClaimAndClose = false,
  //   skipUnwrapSOL = false,
  // }: {
  //   user: PublicKey;
  //   position: PublicKey;
  //   fromBinId: number;
  //   toBinId: number;
  //   bps: BN;
  //   shouldClaimAndClose?: boolean;
  //   skipUnwrapSOL?: boolean;
  // }): Promise<Transaction[]> {
  //   const positionAccount =
  //     await this.program.provider.connection.getAccountInfo(position);

  //   const positionState = wrapPosition(this.program, position, positionAccount);

  //   const lbPair = positionState.lbPair();
  //   const owner = positionState.owner();
  //   const feeOwner = positionState.feeOwner();
  //   const liquidityShares = positionState.liquidityShares();

  //   const liqudityShareWithBinId = liquidityShares.map((share, i) => {
  //     return {
  //       share,
  //       binId: positionState.lowerBinId().add(new BN(i)),
  //     };
  //   });

  //   const binIdsWithLiquidity = liqudityShareWithBinId.filter((bin) => {
  //     return !bin.share.isZero();
  //   });

  //   if (binIdsWithLiquidity.length == 0) {
  //     throw new Error("No liquidity to remove");
  //   }

  //   const lowerBinIdWithLiquidity = binIdsWithLiquidity[0].binId.toNumber();
  //   const upperBinIdWithLiquidity =
  //     binIdsWithLiquidity[binIdsWithLiquidity.length - 1].binId.toNumber();

  //   // Avoid to attempt to load uninitialized bin array on the program
  //   if (fromBinId < lowerBinIdWithLiquidity) {
  //     fromBinId = lowerBinIdWithLiquidity;
  //   }

  //   if (toBinId > upperBinIdWithLiquidity) {
  //     toBinId = upperBinIdWithLiquidity;
  //   }

  //   const walletToReceiveFee = feeOwner.equals(PublicKey.default)
  //     ? user
  //     : feeOwner;

  //   const userTokenX = getAssociatedTokenAddressSync(
  //     this.lbPair.tokenXMint,
  //     owner,
  //     true,
  //     this.tokenX.owner,
  //   );

  //   const userTokenY = getAssociatedTokenAddressSync(
  //     this.lbPair.tokenYMint,
  //     owner,
  //     true,
  //     this.tokenY.owner,
  //   );

  //   const feeOwnerTokenX = getAssociatedTokenAddressSync(
  //     this.lbPair.tokenXMint,
  //     walletToReceiveFee,
  //     true,
  //     this.tokenX.owner,
  //   );

  //   const feeOwnerTokenY = getAssociatedTokenAddressSync(
  //     this.lbPair.tokenYMint,
  //     walletToReceiveFee,
  //     true,
  //     this.tokenY.owner,
  //   );

  //   const createUserTokenXIx =
  //     createAssociatedTokenAccountIdempotentInstruction(
  //       user,
  //       userTokenX,
  //       owner,
  //       this.lbPair.tokenXMint,
  //       this.tokenX.owner,
  //     );

  //   const createUserTokenYIx =
  //     createAssociatedTokenAccountIdempotentInstruction(
  //       user,
  //       userTokenY,
  //       owner,
  //       this.lbPair.tokenYMint,
  //       this.tokenY.owner,
  //     );

  //   const createFeeOwnerTokenXIx =
  //     createAssociatedTokenAccountIdempotentInstruction(
  //       user,
  //       feeOwnerTokenX,
  //       walletToReceiveFee,
  //       this.lbPair.tokenXMint,
  //       this.tokenX.owner,
  //     );

  //   const createFeeOwnerTokenYIx =
  //     createAssociatedTokenAccountIdempotentInstruction(
  //       user,
  //       feeOwnerTokenY,
  //       walletToReceiveFee,
  //       this.lbPair.tokenYMint,
  //       this.tokenY.owner,
  //     );

  //   const chunkedBinRange = chunkBinRange(fromBinId, toBinId);
  //   const groupedInstructions: TransactionInstruction[][] = [];

  //   for (const { lowerBinId, upperBinId } of chunkedBinRange) {
  //     const binArrayAccountsMeta = getBinArrayAccountMetasCoverage(
  //       new BN(lowerBinId),
  //       new BN(upperBinId),
  //       this.pubkey,
  //       this.program.programId,
  //     );

  //     const { slices, accounts: transferHookAccounts } =
  //       this.getPotentialToken2022IxDataAndAccounts(ActionType.Liquidity);

  //     const preInstructions: Array<TransactionInstruction> = [];
  //     const postInstructions: Array<TransactionInstruction> = [];

  //     if (shouldClaimAndClose) {
  //       const claimSwapFeeIx = await this.program.methods
  //         .claimFee2(lowerBinId, upperBinId, {
  //           slices,
  //         })
  //         .accountsPartial({
  //           lbPair: this.pubkey,
  //           sender: user,
  //           position,
  //           reserveX: this.lbPair.reserveX,
  //           reserveY: this.lbPair.reserveY,
  //           tokenXMint: this.tokenX.publicKey,
  //           tokenYMint: this.tokenY.publicKey,
  //           userTokenX: feeOwnerTokenX,
  //           userTokenY: feeOwnerTokenY,
  //           tokenProgramX: this.tokenX.owner,
  //           tokenProgramY: this.tokenY.owner,
  //           memoProgram: MEMO_PROGRAM_ID,
  //         })
  //         .remainingAccounts(transferHookAccounts)
  //         .remainingAccounts(binArrayAccountsMeta)
  //         .instruction();

  //       preInstructions.push(createFeeOwnerTokenXIx);
  //       preInstructions.push(createFeeOwnerTokenYIx);
  //       postInstructions.push(claimSwapFeeIx);

  //       for (let i = 0; i < 2; i++) {
  //         const rewardInfo = this.lbPair.rewardInfos[i];
  //         if (!rewardInfo || rewardInfo.mint.equals(PublicKey.default))
  //           continue;

  //         const userRewardAccount = getAssociatedTokenAddressSync(
  //           rewardInfo.mint,
  //           user,
  //           true,
  //           this.rewards[i].owner,
  //         );

  //         const createUserRewardAccountIx =
  //           createAssociatedTokenAccountIdempotentInstruction(
  //             user,
  //             userRewardAccount,
  //             user,
  //             rewardInfo.mint,
  //             this.rewards[i].owner,
  //           );

  //         preInstructions.push(createUserRewardAccountIx);

  //         const { slices, accounts: transferHookAccounts } =
  //           this.getPotentialToken2022IxDataAndAccounts(ActionType.Reward, i);

  //         const claimRewardIx = await this.program.methods
  //           .claimReward2(new BN(i), lowerBinId, upperBinId, {
  //             slices,
  //           })
  //           .accountsPartial({
  //             lbPair: this.pubkey,
  //             sender: user,
  //             position,
  //             rewardVault: rewardInfo.vault,
  //             rewardMint: rewardInfo.mint,
  //             tokenProgram: this.rewards[i].owner,
  //             userTokenAccount: userRewardAccount,
  //             memoProgram: MEMO_PROGRAM_ID,
  //           })
  //           .remainingAccounts(transferHookAccounts)
  //           .remainingAccounts(binArrayAccountsMeta)
  //           .instruction();

  //         postInstructions.push(claimRewardIx);
  //       }

  //       const closePositionIx = await this.program.methods
  //         .closePositionIfEmpty()
  //         .accountsPartial({
  //           rentReceiver: owner, // Must be position owner
  //           position,
  //           sender: user,
  //         })
  //         .instruction();

  //       postInstructions.push(closePositionIx);
  //     }

  //     if (
  //       [
  //         this.tokenX.publicKey.toBase58(),
  //         this.tokenY.publicKey.toBase58(),
  //       ].includes(NATIVE_MINT.toBase58()) &&
  //       (!skipUnwrapSOL || !this.opt?.skipSolWrappingOperation)
  //     ) {
  //       const closeWrappedSOLIx = await unwrapSOLInstruction(user);
  //       closeWrappedSOLIx && postInstructions.push(closeWrappedSOLIx);
  //     }

  //     preInstructions.push(createUserTokenXIx);
  //     preInstructions.push(createUserTokenYIx);

  //     const binArrayBitmapExtension = this.binArrayBitmapExtension
  //       ? this.binArrayBitmapExtension.publicKey
  //       : this.program.programId;

  //     const removeLiquidityTx = await this.program.methods
  //       .removeLiquidityByRange2(lowerBinId, upperBinId, bps.toNumber(), {
  //         slices,
  //       })
  //       .accountsPartial({
  //         position,
  //         lbPair,
  //         userTokenX,
  //         userTokenY,
  //         reserveX: this.lbPair.reserveX,
  //         reserveY: this.lbPair.reserveY,
  //         tokenXMint: this.tokenX.publicKey,
  //         tokenYMint: this.tokenY.publicKey,
  //         binArrayBitmapExtension,
  //         tokenXProgram: this.tokenX.owner,
  //         tokenYProgram: this.tokenY.owner,
  //         sender: user,
  //         memoProgram: MEMO_PROGRAM_ID,
  //       })
  //       .remainingAccounts(transferHookAccounts)
  //       .remainingAccounts(binArrayAccountsMeta)
  //       .instruction();

  //     const instructions = [
  //       ...preInstructions,
  //       removeLiquidityTx,
  //       ...postInstructions,
  //     ];

  //     groupedInstructions.push(instructions);
  //   }

  //   const groupedInstructionsWithCUIx = await Promise.all(
  //     groupedInstructions.map(async (ixs) => {
  //       const setCUIx = await getEstimatedComputeUnitIxWithBuffer(
  //         this.program.provider.connection,
  //         ixs,
  //         user,
  //         0.3, // Extra 30% buffer CU
  //       );

  //       return [setCUIx, ...ixs];
  //     }),
  //   );

  //   const { blockhash, lastValidBlockHeight } =
  //     await this.program.provider.connection.getLatestBlockhash("confirmed");

  //   return groupedInstructionsWithCUIx.map((ixs) => {
  //     return new Transaction({
  //       blockhash,
  //       lastValidBlockHeight,
  //       feePayer: user,
  //     }).add(...ixs);
  //   });
  // }

  // TODO: Fix swap swapQuoteExactOut implementation
  // /**
  //  * The `swapQuoteExactOut` function returns a quote for a swap
  //  * @param
  //  *    - `outAmount`: Amount of lamport to swap out
  //  *    - `swapForY`: Swap token X to Y when it is true, else reversed.
  //  *    - `allowedSlippage`: Allowed slippage for the swap. Expressed in BPS. To convert from slippage percentage to BPS unit: SLIPPAGE_PERCENTAGE * 100
  //  *    - `maxExtraBinArrays`: Maximum number of extra binArrays to return
  //  * @returns {SwapQuote}
  //  *    - `inAmount`: Amount of lamport to swap in
  //  *    - `outAmount`: Amount of lamport to swap out
  //  *    - `fee`: Fee amount
  //  *    - `protocolFee`: Protocol fee amount
  //  *    - `maxInAmount`: Maximum amount of lamport to swap in
  //  *    - `binArraysPubkey`: Array of bin arrays involved in the swap
  //  * @throws {DlmmSdkError}
  //  *
  //  */
  // public swapQuoteExactOut(
  //   outAmount: BN,
  //   swapForY: boolean,
  //   allowedSlippage: BN,
  //   binArrays: BinArrayAccount[],
  //   maxExtraBinArrays: number = 0,
  // ): SwapQuoteExactOut {
  //   const currentTimestamp = Date.now() / 1000;

  //   const [inMint, outMint] = swapForY
  //     ? [this.tokenX.mint, this.tokenY.mint]
  //     : [this.tokenY.mint, this.tokenX.mint];

  //   let outAmountLeft = calculateTransferFeeIncludedAmount(
  //     outAmount,
  //     outMint,
  //     this.clock.epoch.toNumber(),
  //   ).amount;

  //   if (maxExtraBinArrays < 0 || maxExtraBinArrays > MAX_EXTRA_BIN_ARRAYS) {
  //     throw new DlmmSdkError(
  //       "INVALID_MAX_EXTRA_BIN_ARRAYS",
  //       `maxExtraBinArrays must be a value between 0 and ${MAX_EXTRA_BIN_ARRAYS}`,
  //     );
  //   }

  //   let vParameterClone = Object.assign({}, this.lbPair.vParameters);
  //   let activeId = new BN(this.lbPair.activeId);

  //   const binStep = this.lbPair.binStep;
  //   const sParameters = this.lbPair.parameters;

  //   DLMM.updateReference(
  //     activeId.toNumber(),
  //     vParameterClone,
  //     sParameters,
  //     currentTimestamp,
  //   );

  //   let startBinId = activeId;
  //   let binArraysForSwap = new Map();
  //   let actualInAmount: BN = new BN(0);
  //   let feeAmount: BN = new BN(0);
  //   let protocolFeeAmount: BN = new BN(0);

  //   while (!outAmountLeft.isZero()) {
  //     let binArrayAccountToSwap = findNextBinArrayWithLiquidity(
  //       swapForY,
  //       activeId,
  //       this.lbPair,
  //       this.binArrayBitmapExtension?.account ?? null,
  //       binArrays,
  //     );

  //     if (binArrayAccountToSwap == null) {
  //       throw new DlmmSdkError(
  //         "SWAP_QUOTE_INSUFFICIENT_LIQUIDITY",
  //         "Insufficient liquidity in binArrays",
  //       );
  //     }

  //     binArraysForSwap.set(binArrayAccountToSwap.publicKey, true);

  //     DLMM.updateVolatilityAccumulator(
  //       vParameterClone,
  //       sParameters,
  //       activeId.toNumber(),
  //     );

  //     if (
  //       isBinIdWithinBinArray(activeId, binArrayAccountToSwap.account.index)
  //     ) {
  //       const bin = getBinFromBinArray(
  //         activeId.toNumber(),
  //         binArrayAccountToSwap.account,
  //       );
  //       const { amountIn, amountOut, fee, protocolFee } =
  //         swapExactOutQuoteAtBin(
  //           bin,
  //           binStep,
  //           sParameters,
  //           vParameterClone,
  //           outAmountLeft,
  //           swapForY,
  //         );

  //       if (!amountOut.isZero()) {
  //         outAmountLeft = outAmountLeft.sub(amountOut);
  //         actualInAmount = actualInAmount.add(amountIn);
  //         feeAmount = feeAmount.add(fee);
  //         protocolFeeAmount = protocolFee.add(protocolFee);
  //       }
  //     }

  //     if (!outAmountLeft.isZero()) {
  //       if (swapForY) {
  //         activeId = activeId.sub(new BN(1));
  //       } else {
  //         activeId = activeId.add(new BN(1));
  //       }
  //     }
  //   }

  //   const startPrice = getPriceOfBinByBinId(
  //     startBinId.toNumber(),
  //     this.lbPair.binStep,
  //   );
  //   const endPrice = getPriceOfBinByBinId(
  //     activeId.toNumber(),
  //     this.lbPair.binStep,
  //   );

  //   const priceImpact = startPrice
  //     .sub(endPrice)
  //     .abs()
  //     .div(startPrice)
  //     .mul(new Decimal(100));

  //   actualInAmount = calculateTransferFeeIncludedAmount(
  //     actualInAmount.add(feeAmount),
  //     inMint,
  //     this.clock.epoch.toNumber(),
  //   ).amount;

  //   const maxInAmount = actualInAmount
  //     .mul(new BN(BASIS_POINT_MAX).add(allowedSlippage))
  //     .div(new BN(BASIS_POINT_MAX));

  //   if (maxExtraBinArrays > 0 && maxExtraBinArrays <= MAX_EXTRA_BIN_ARRAYS) {
  //     const extraBinArrays: Array<PublicKey> = new Array<PublicKey>();

  //     while (extraBinArrays.length < maxExtraBinArrays) {
  //       let binArrayAccountToSwap = findNextBinArrayWithLiquidity(
  //         swapForY,
  //         activeId,
  //         this.lbPair,
  //         this.binArrayBitmapExtension?.account ?? null,
  //         binArrays,
  //       );

  //       if (binArrayAccountToSwap == null) {
  //         break;
  //       }

  //       const binArrayAccountToSwapExisted = binArraysForSwap.has(
  //         binArrayAccountToSwap.publicKey,
  //       );

  //       if (binArrayAccountToSwapExisted) {
  //         if (swapForY) {
  //           activeId = activeId.sub(new BN(1));
  //         } else {
  //           activeId = activeId.add(new BN(1));
  //         }
  //       } else {
  //         extraBinArrays.push(binArrayAccountToSwap.publicKey);
  //         const [lowerBinId, upperBinId] = getBinArrayLowerUpperBinId(
  //           binArrayAccountToSwap.account.index,
  //         );

  //         if (swapForY) {
  //           activeId = lowerBinId.sub(new BN(1));
  //         } else {
  //           activeId = upperBinId.add(new BN(1));
  //         }
  //       }
  //     }

  //     // save to binArraysForSwap result
  //     extraBinArrays.forEach((binArrayPubkey) => {
  //       binArraysForSwap.set(binArrayPubkey, true);
  //     });
  //   }

  //   const binArraysPubkey = Array.from(binArraysForSwap.keys());

  //   return {
  //     inAmount: actualInAmount,
  //     maxInAmount,
  //     outAmount,
  //     priceImpact,
  //     fee: feeAmount,
  //     protocolFee: protocolFeeAmount,
  //     binArraysPubkey,
  //   };
  // }

  /**
   * The `swapQuote` function returns a quote for a swap
   * @param
   *    - `inAmount`: Amount of lamport to swap in
   *    - `swapForY`: Swap token X to Y when it is true, else reversed.
   *    - `allowedSlippage`: Allowed slippage for the swap. Expressed in BPS. To convert from slippage percentage to BPS unit: SLIPPAGE_PERCENTAGE * 100
   *    - `binArrays`: binArrays for swapQuote.
   *    - `isPartialFill`: Flag to check whether the the swapQuote is partial fill, default = false.
   *    - `maxExtraBinArrays`: Maximum number of extra binArrays to return
   * @returns {SwapQuote}
   *    - `consumedInAmount`: Amount of lamport to swap in
   *    - `outAmount`: Amount of lamport to swap out
   *    - `fee`: Fee amount
   *    - `protocolFee`: Protocol fee amount
   *    - `minOutAmount`: Minimum amount of lamport to swap out
   *    - `priceImpact`: Price impact of the swap
   *    - `binArraysPubkey`: Array of bin arrays involved in the swap
   * @throws {DlmmSdkError}
   */
  public swapQuote(
    inAmount: BN,
    swapForY: boolean,
    allowedSlippage: BN,
    binArrays: BinArrayAccount[],
    isPartialFill?: boolean,
    maxExtraBinArrays: number = 0,
  ): SwapQuote {
    const currentTimestamp = Date.now() / 1000;

    if (maxExtraBinArrays < 0 || maxExtraBinArrays > MAX_EXTRA_BIN_ARRAYS) {
      throw new DlmmSdkError(
        "INVALID_MAX_EXTRA_BIN_ARRAYS",
        `maxExtraBinArrays must be a value between 0 and ${MAX_EXTRA_BIN_ARRAYS}`,
      );
    }

    const [inMint, outMint] = swapForY
      ? [this.tokenX.mint, this.tokenY.mint]
      : [this.tokenY.mint, this.tokenX.mint];

    const inTransferFeeResult = calculateTransferFeeExcludedAmount(
      inAmount,
      inMint,
      this.clock.epoch.toNumber(),
    );
    let transferFeeExcludedAmountIn = inTransferFeeResult.amount;

    let inAmountLeft = transferFeeExcludedAmountIn;

    let vParameterClone = Object.assign({}, this.lbPair.vParameters);
    let activeId = new BN(this.lbPair.activeId);

    const binStep = this.lbPair.binStep;
    const sParameters = this.lbPair.parameters;

    DLMM.updateVolatilityAccumulator(
      vParameterClone,
      sParameters,
      activeId.toNumber(),
    );

    DLMM.updateReference(
      activeId.toNumber(),
      vParameterClone,
      sParameters,
      currentTimestamp,
    );

    let startBin: Bin | null = null;
    let binArraysForSwap = new Map();
    let totalOutAmount: BN = new BN(0);
    let feeAmount: BN = new BN(0);
    let protocolFeeAmount: BN = new BN(0);
    let lastFilledActiveBinId = activeId;
    let binCounter = 0;

    while (!inAmountLeft.isZero()) {
      let binArrayAccountToSwap = findNextBinArrayWithLiquidity(
        swapForY,
        activeId,
        this.lbPair,
        this.binArrayBitmapExtension?.account ?? null,
        binArrays,
      );

      if (binArrayAccountToSwap == null) {
        if (isPartialFill) {
          break;
        } else {
          throw new DlmmSdkError(
            "SWAP_QUOTE_INSUFFICIENT_LIQUIDITY",
            "Insufficient liquidity in binArrays for swapQuote",
          );
        }
      }

      binArraysForSwap.set(binArrayAccountToSwap.publicKey, true);

      if (
        isBinIdWithinBinArray(activeId, binArrayAccountToSwap.account.index)
      ) {
        const bin = getBinFromBinArray(
          activeId.toNumber(),
          binArrayAccountToSwap.account,
        );

        const { amountIn, amountOut, fee, protocolFee } = swapExactInQuoteAtBin(
          bin,
          binStep,
          sParameters,
          vParameterClone,
          inAmountLeft,
          swapForY,
        );

        if (!amountIn.isZero()) {
          inAmountLeft = inAmountLeft.sub(amountIn);
          totalOutAmount = totalOutAmount.add(amountOut);
          feeAmount = feeAmount.add(fee);
          protocolFeeAmount = protocolFeeAmount.add(protocolFee);

          if (!startBin) {
            startBin = bin;
          }

          lastFilledActiveBinId = activeId;
          binCounter++;
        }
      }

      if (!inAmountLeft.isZero()) {
        if (swapForY) {
          activeId = activeId.sub(new BN(1));
        } else {
          activeId = activeId.add(new BN(1));
        }
      }
    }

    if (!startBin) {
      throw new DlmmSdkError(
        "SWAP_QUOTE_INSUFFICIENT_LIQUIDITY",
        "Insufficient liquidity",
      );
    }

    const actualInAmount = transferFeeExcludedAmountIn.sub(inAmountLeft);

    let transferFeeIncludedInAmount = calculateTransferFeeIncludedAmount(
      actualInAmount,
      inMint,
      this.clock.epoch.toNumber(),
    ).amount;

    transferFeeIncludedInAmount = transferFeeIncludedInAmount.gt(inAmount)
      ? inAmount
      : transferFeeIncludedInAmount;

    // console.log("\n--- Price Impact Calculation ---");
    const outAmountWithoutSlippage = getOutAmount(
      startBin,
      actualInAmount.sub(
        computeFeeFromAmount(
          binStep,
          sParameters,
          vParameterClone,
          actualInAmount,
        ),
      ),
      swapForY,
    );

    const priceImpact = new Decimal(totalOutAmount.toString())
      .sub(new Decimal(outAmountWithoutSlippage.toString()))
      .div(new Decimal(outAmountWithoutSlippage.toString()))
      .mul(new Decimal(100))
      .abs();

    const endPrice = getPriceOfBinByBinId(
      lastFilledActiveBinId.toNumber(),
      this.lbPair.binStep,
    );

    if (maxExtraBinArrays > 0 && maxExtraBinArrays <= MAX_EXTRA_BIN_ARRAYS) {
      const extraBinArrays: Array<PublicKey> = new Array<PublicKey>();

      while (extraBinArrays.length < maxExtraBinArrays) {
        let binArrayAccountToSwap = findNextBinArrayWithLiquidity(
          swapForY,
          activeId,
          this.lbPair,
          this.binArrayBitmapExtension?.account ?? null,
          binArrays,
        );

        if (binArrayAccountToSwap == null) {
          break;
        }

        const binArrayAccountToSwapExisted = binArraysForSwap.has(
          binArrayAccountToSwap.publicKey,
        );

        if (binArrayAccountToSwapExisted) {
          if (swapForY) {
            activeId = activeId.sub(new BN(1));
          } else {
            activeId = activeId.add(new BN(1));
          }
        } else {
          extraBinArrays.push(binArrayAccountToSwap.publicKey);
          const [lowerBinId, upperBinId] = getBinArrayLowerUpperBinId(
            binArrayAccountToSwap.account.index,
          );

          if (swapForY) {
            activeId = lowerBinId.sub(new BN(1));
          } else {
            activeId = upperBinId.add(new BN(1));
          }
        }
      }

      // save to binArraysForSwap result
      extraBinArrays.forEach((binArrayPubkey) => {
        binArraysForSwap.set(binArrayPubkey, true);
      });
    }

    const binArraysPubkey = Array.from(binArraysForSwap.keys());

    const outTransferFeeResult = calculateTransferFeeExcludedAmount(
      totalOutAmount,
      outMint,
      this.clock.epoch.toNumber(),
    );
    const transferFeeExcludedAmountOut = outTransferFeeResult.amount;

    const minOutAmount = transferFeeExcludedAmountOut
      .mul(new BN(BASIS_POINT_MAX).sub(allowedSlippage))
      .div(new BN(BASIS_POINT_MAX));

    return {
      consumedInAmount: transferFeeIncludedInAmount,
      outAmount: transferFeeExcludedAmountOut,
      fee: feeAmount,
      protocolFee: protocolFeeAmount,
      minOutAmount,
      priceImpact,
      binArraysPubkey,
      endPrice,
    };
  }

  // TODO: Fix swapExactOut implementation
  // public async swapExactOut({
  //   inToken,
  //   outToken,
  //   outAmount,
  //   maxInAmount,
  //   lbPair,
  //   user,
  //   binArraysPubkey,
  // }: SwapExactOutParams): Promise<Transaction> {
  //   const preInstructions: TransactionInstruction[] = [];
  //   const postInstructions: Array<TransactionInstruction> = [];

  //   const [inTokenProgram, outTokenProgram] = inToken.equals(
  //     this.lbPair.tokenXMint,
  //   )
  //     ? [this.tokenX.owner, this.tokenY.owner]
  //     : [this.tokenY.owner, this.tokenX.owner];

  //   const [
  //     { ataPubKey: userTokenIn, ix: createInTokenAccountIx },
  //     { ataPubKey: userTokenOut, ix: createOutTokenAccountIx },
  //   ] = await Promise.all([
  //     getOrCreateATAInstruction(
  //       this.program.provider.connection,
  //       inToken,
  //       user,
  //       inTokenProgram,
  //     ),
  //     getOrCreateATAInstruction(
  //       this.program.provider.connection,
  //       outToken,
  //       user,
  //       outTokenProgram,
  //     ),
  //   ]);
  //   createInTokenAccountIx && preInstructions.push(createInTokenAccountIx);
  //   createOutTokenAccountIx && preInstructions.push(createOutTokenAccountIx);

  //   if (inToken.equals(NATIVE_MINT) && !this.opt?.skipSolWrappingOperation) {
  //     const wrapSOLIx = wrapSOLInstruction(
  //       user,
  //       userTokenIn,
  //       BigInt(maxInAmount.toString()),
  //     );

  //     preInstructions.push(...wrapSOLIx);

  //     const closeWrappedSOLIx = await unwrapSOLInstruction(user);
  //     closeWrappedSOLIx && postInstructions.push(closeWrappedSOLIx);
  //   }

  //   if (outToken.equals(NATIVE_MINT) && !this.opt?.skipSolWrappingOperation) {
  //     const closeWrappedSOLIx = await unwrapSOLInstruction(user);
  //     closeWrappedSOLIx && postInstructions.push(closeWrappedSOLIx);
  //   }

  //   const { slices, accounts: transferHookAccounts } =
  //     this.getPotentialToken2022IxDataAndAccounts(ActionType.Liquidity);

  //   const binArrays: AccountMeta[] = binArraysPubkey.map((pubkey) => {
  //     return {
  //       isSigner: false,
  //       isWritable: true,
  //       pubkey,
  //     };
  //   });

  //   const swapIx = await this.program.methods
  //     .swapExactOut2(maxInAmount, outAmount, { slices })
  //     .accountsPartial({
  //       lbPair,
  //       reserveX: this.lbPair.reserveX,
  //       reserveY: this.lbPair.reserveY,
  //       tokenXMint: this.lbPair.tokenXMint,
  //       tokenYMint: this.lbPair.tokenYMint,
  //       tokenXProgram: this.tokenX.owner,
  //       tokenYProgram: this.tokenY.owner,
  //       user,
  //       userTokenIn,
  //       userTokenOut,
  //       binArrayBitmapExtension: this.binArrayBitmapExtension
  //         ? this.binArrayBitmapExtension.publicKey
  //         : null,
  //       oracle: this.lbPair.oracle,
  //       hostFeeIn: null,
  //       memoProgram: MEMO_PROGRAM_ID,
  //     })
  //     .remainingAccounts(transferHookAccounts)
  //     .remainingAccounts(binArrays)
  //     .instruction();

  //   const instructions = [...preInstructions, swapIx, ...postInstructions];

  //   // const setCUIx = await getEstimatedComputeUnitIxWithBuffer(
  //   //   this.program.provider.connection,
  //   //   instructions,
  //   //   user
  //   // );

  //   // instructions.unshift(setCUIx);

  //   instructions.push(
  //     ComputeBudgetProgram.setComputeUnitLimit({
  //       units: 1_400_000,
  //     }),
  //   );

  //   const { blockhash, lastValidBlockHeight } =
  //     await this.program.provider.connection.getLatestBlockhash("confirmed");
  //   return new Transaction({
  //     blockhash,
  //     lastValidBlockHeight,
  //     feePayer: user,
  //   }).add(...instructions);
  // }

  /**
   * Returns a transaction to be signed and sent by user performing swap.
   * @param {SwapParams}
   *    - `inToken`: The public key of the token to be swapped in.
   *    - `outToken`: The public key of the token to be swapped out.
   *    - `inAmount`: The amount of token to be swapped in.
   *    - `minOutAmount`: The minimum amount of token to be swapped out.
   *    - `user`: The public key of the user account.
   *    - `binArraysPubkey`: Array of bin arrays involved in the swap
   * @returns {Promise<Transaction>}
   */
  public async swap({
    inToken,
    outToken,
    inAmount,
    minOutAmount,
    user,
    binArraysPubkey,
  }: SwapParams): Promise<Transaction> {
    const preInstructions: TransactionInstruction[] = [];
    const postInstructions: Array<TransactionInstruction> = [];

    const [inTokenProgram, outTokenProgram] = inToken.equals(
      this.lbPair.tokenXMint,
    )
      ? [this.tokenX.owner, this.tokenY.owner]
      : [this.tokenY.owner, this.tokenX.owner];

    const [
      { ataPubKey: userTokenIn, ix: createInTokenAccountIx },
      { ataPubKey: userTokenOut, ix: createOutTokenAccountIx },
    ] = await Promise.all([
      getOrCreateATAInstruction(
        this.program.provider.connection,
        inToken,
        user,
        inTokenProgram,
      ),
      getOrCreateATAInstruction(
        this.program.provider.connection,
        outToken,
        user,
        outTokenProgram,
      ),
    ]);
    createInTokenAccountIx && preInstructions.push(createInTokenAccountIx);
    createOutTokenAccountIx && preInstructions.push(createOutTokenAccountIx);

    if (inToken.equals(NATIVE_MINT) && !this.opt?.skipSolWrappingOperation) {
      const wrapSOLIx = wrapSOLInstruction(
        user,
        userTokenIn,
        BigInt(inAmount.toString()),
      );

      preInstructions.push(...wrapSOLIx);

      const closeWrappedSOLIx = await unwrapSOLInstruction(user);
      closeWrappedSOLIx && postInstructions.push(closeWrappedSOLIx);
    }

    if (outToken.equals(NATIVE_MINT) && !this.opt?.skipSolWrappingOperation) {
      const closeWrappedSOLIx = await unwrapSOLInstruction(user);
      closeWrappedSOLIx && postInstructions.push(closeWrappedSOLIx);
    }

    // TODO: needs some refinement in case binArray not yet initialized
    const binArrays: AccountMeta[] = binArraysPubkey.map((pubkey) => {
      return {
        isSigner: false,
        isWritable: true,
        pubkey,
      };
    });

    // const { slices, accounts: transferHookAccounts } =
    //   this.getPotentialToken2022IxDataAndAccounts(ActionType.Liquidity);

    const swapIx = await this.program.methods
      .swap(inAmount, minOutAmount)
      .accountsPartial({
        lbPair: this.pubkey,
        reserveX: this.lbPair.reserveX,
        reserveY: this.lbPair.reserveY,
        tokenXMint: this.lbPair.tokenXMint,
        tokenYMint: this.lbPair.tokenYMint,
        tokenXProgram: this.tokenX.owner,
        tokenYProgram: this.tokenY.owner,
        user,
        userTokenIn,
        userTokenOut,
        binArrayBitmapExtension: this.binArrayBitmapExtension
          ? this.binArrayBitmapExtension.publicKey
          : null,
        // oracle: this.lbPair.oracle,
        hostFeeIn: null,
        // memoProgram: MEMO_PROGRAM_ID,
      })
      // .remainingAccounts(transferHookAccounts)
      .remainingAccounts(binArrays)
      .instruction();

    const instructions = [...preInstructions, swapIx, ...postInstructions];

    const setCUIx = await getEstimatedComputeUnitIxWithBuffer(
      this.program.provider.connection,
      instructions,
      user,
    );

    instructions.unshift(setCUIx);

    const { blockhash, lastValidBlockHeight } =
      await this.program.provider.connection.getLatestBlockhash("confirmed");
    return new Transaction({
      blockhash,
      lastValidBlockHeight,
      feePayer: user,
    }).add(...instructions);
  }

  /**
   * The function `claimSwapFee` is used to claim swap fees for a specific position owned by a specific owner.
   * @param
   *    - `owner`: The public key of the owner of the position.
   *    - `position`: The public key of the position account.
   *    - `binRange`: The bin range to claim swap fees for. If not provided, the function claim swap fees for full range.
   * @returns {Promise<Transaction[]>} Claim swap fee transactions.
   */
  public async claimSwapFee({
    owner,
    position,
  }: {
    owner: PublicKey;
    position: LbPosition;
  }): Promise<Transaction[]> {
    if (isPositionNoFee(position.positionData)) {
      throw new Error("No fee to claim");
    }

    const claimFeeTxs = await this.createClaimSwapFeeMethod({
      owner,
      position,
    });

    const claimFeeTxsWithCUIx = await Promise.all(
      claimFeeTxs.map(async (tx) => {
        const setCUIx = await getEstimatedComputeUnitIxWithBuffer(
          this.program.provider.connection,
          tx.instructions,
          owner,
        );

        return [setCUIx, ...tx.instructions];
      }),
    );

    const { blockhash, lastValidBlockHeight } =
      await this.program.provider.connection.getLatestBlockhash("confirmed");

    return claimFeeTxsWithCUIx.map((ixs) => {
      return new Transaction({
        blockhash,
        lastValidBlockHeight,
        feePayer: owner,
      }).add(...ixs);
    });
  }

  /**
   * The `claimAllSwapFee` function to claim swap fees for multiple positions owned by a specific owner.
   * @param
   *    - `owner`: The public key of the owner of the positions.
   *    - `positions`: An array of objects of type `PositionData` that represents the positions to claim swap fees from.
   * @returns {Promise<Transaction[]>} Array of claim swap fee transactions.
   */
  public async claimAllSwapFee({
    owner,
    positions,
  }: {
    owner: PublicKey;
    positions: LbPosition[];
  }): Promise<Transaction[]> {
    if (positions.every((position) => isPositionNoFee(position.positionData))) {
      throw new Error("No fee to claim");
    }

    const claimAllTxs = (
      await Promise.all(
        positions
          .filter(
            ({ positionData: { feeX, feeY } }) =>
              !feeX.isZero() || !feeY.isZero(),
          )
          .map(async (position) => {
            return await this.createClaimSwapFeeMethod({
              owner,
              position,
            });
          }),
      )
    ).flat();

    const chunkedClaimAllTx = chunks(claimAllTxs, MAX_CLAIM_ALL_ALLOWED);

    if (chunkedClaimAllTx.length === 0) return [];

    const chunkedClaimAllTxIxs = await Promise.all(
      chunkedClaimAllTx.map(async (tx) => {
        const ixs = tx.map((t) => t.instructions).flat();

        const setCUIx = await getEstimatedComputeUnitIxWithBuffer(
          this.program.provider.connection,
          ixs,
          owner,
        );

        return [setCUIx, ...ixs];
      }),
    );

    const { blockhash, lastValidBlockHeight } =
      await this.program.provider.connection.getLatestBlockhash("confirmed");

    return Promise.all(
      chunkedClaimAllTxIxs.map(async (claimAllTx) => {
        return new Transaction({
          feePayer: owner,
          blockhash,
          lastValidBlockHeight,
        }).add(...claimAllTx);
      }),
    );
  }

  // TODO: Implement claimAllRewardsByPosition
  // /**
  //  * The function `claimAllRewardsByPosition` allows a user to claim all rewards for a specific
  //  * position.
  //  * @param
  //  *    - `owner`: The public key of the owner of the position.
  //  *    - `position`: The public key of the position account.
  //  * @returns {Promise<Transaction[]>} Array of claim reward transactions.
  //  */
  // public async claimAllRewardsByPosition({
  //   owner,
  //   position,
  // }: {
  //   owner: PublicKey;
  //   position: LbPosition;
  // }): Promise<Transaction[]> {
  //   if (
  //     isPositionNoFee(position.positionData) &&
  //     isPositionNoReward(position.positionData)
  //   ) {
  //     throw new Error("No fee/reward to claim");
  //   }

  //   const claimAllSwapFeeTxs = await this.createClaimSwapFeeMethod({
  //     owner,
  //     position,
  //   });

  //   const claimAllLMTxs = await this.createClaimBuildMethod({
  //     owner,
  //     position,
  //   });

  //   const claimAllTxs = chunks(
  //     [...claimAllSwapFeeTxs, ...claimAllLMTxs],
  //     MAX_CLAIM_ALL_ALLOWED,
  //   );

  //   const { blockhash, lastValidBlockHeight } =
  //     await this.program.provider.connection.getLatestBlockhash("confirmed");

  //   return Promise.all(
  //     claimAllTxs.map(async (txs) => {
  //       const instructions = txs.flatMap((tx) => tx.instructions);

  //       const setCUIx = await getEstimatedComputeUnitIxWithBuffer(
  //         this.program.provider.connection,
  //         instructions,
  //         owner,
  //       );

  //       const transaction = new Transaction({
  //         feePayer: owner,
  //         blockhash,
  //         lastValidBlockHeight,
  //       }).add(setCUIx, ...instructions);

  //       return transaction;
  //     }),
  //   );
  // }

  /**
   * Initializes bin arrays for the given bin array indexes if it wasn't initialized.
   *
   * @param {BN[]} binArrayIndexes - An array of bin array indexes to initialize.
   * @param {PublicKey} funder - The public key of the funder.
   * @return {Promise<TransactionInstruction[]>} An array of transaction instructions to initialize the bin arrays.
   */
  public async initializeBinArrays(
    binArrayIndexes: BN[],
    funder: PublicKey,
  ): Promise<TransactionInstruction[]> {
    const ixs: TransactionInstruction[] = [];

    for (const idx of binArrayIndexes) {
      const [binArray] = deriveBinArray(
        this.pubkey,
        idx,
        this.program.programId,
      );

      const binArrayAccount =
        await this.program.provider.connection.getAccountInfo(binArray);

      if (binArrayAccount === null) {
        const initBinArrayIx = await this.program.methods
          .initializeBinArray(idx)
          .accountsPartial({
            binArray,
            funder,
            lbPair: this.pubkey,
          })
          .instruction();
        ixs.push(initBinArrayIx);
      }
    }

    if (ixs.length > 0) {
      const setCUIx = await getEstimatedComputeUnitIxWithBuffer(
        this.program.provider.connection,
        ixs,
        funder,
      );

      ixs.unshift(setCUIx);
    }

    return ixs;
  }

  // TODO: Implement claimAllRewards function

  // /**
  //  * The `claimAllRewards` function to claim swap fees and LM rewards for multiple positions owned by a specific owner.
  //  * @param
  //  *    - `owner`: The public key of the owner of the positions.
  //  *    - `positions`: An array of objects of type `PositionData` that represents the positions to claim swap fees and LM rewards from.
  //  * @returns {Promise<Transaction[]>} Array of claim swap fee and LM reward transactions.
  //  */
  // public async claimAllRewards({
  //   owner,
  //   positions,
  // }: {
  //   owner: PublicKey;
  //   positions: LbPosition[];
  // }): Promise<Transaction[]> {
  //   // Filter only position with fees and/or rewards
  //   positions = positions.filter(
  //     ({ positionData: { feeX, feeY, rewardOne, rewardTwo } }) =>
  //       !feeX.isZero() ||
  //       !feeY.isZero() ||
  //       !rewardOne.isZero() ||
  //       !rewardTwo.isZero(),
  //   );

  //   const claimAllSwapFeeTxs = (
  //     await Promise.all(
  //       positions.map(async (position) => {
  //         return await this.createClaimSwapFeeMethod({
  //           owner,
  //           position,
  //         });
  //       }),
  //     )
  //   ).flat();

  //   const claimAllLMTxs = (
  //     await Promise.all(
  //       positions.map(async (position) => {
  //         return await this.createClaimBuildMethod({
  //           owner,
  //           position,
  //         });
  //       }),
  //     )
  //   ).flat();

  //   const transactions = chunks(
  //     [...claimAllSwapFeeTxs, ...claimAllLMTxs],
  //     MAX_CLAIM_ALL_ALLOWED,
  //   );

  //   const { blockhash, lastValidBlockHeight } =
  //     await this.program.provider.connection.getLatestBlockhash("confirmed");

  //   return Promise.all(
  //     transactions.map(async (txs) => {
  //       const instructions = txs.flatMap((i) => i.instructions);

  //       const setCUIx = await getEstimatedComputeUnitIxWithBuffer(
  //         this.program.provider.connection,
  //         instructions,
  //         owner,
  //       );

  //       const transaction = new Transaction({
  //         feePayer: owner,
  //         blockhash,
  //         lastValidBlockHeight,
  //       }).add(setCUIx, ...instructions);

  //       return transaction;
  //     }),
  //   );
  // }

  public canSyncWithMarketPrice(marketPrice: number, activeBinId: number) {
    const marketPriceBinId = this.getBinIdFromPrice(
      Number(
        DLMM.getPricePerLamport(
          this.tokenX.mint.decimals,
          this.tokenY.mint.decimals,
          marketPrice,
        ),
      ),
      false,
    );

    const marketPriceBinArrayIndex = binIdToBinArrayIndex(
      new BN(marketPriceBinId),
    );

    const swapForY = marketPriceBinId < activeBinId;
    const toBinArrayIndex = findNextBinArrayIndexWithLiquidity(
      swapForY,
      new BN(activeBinId),
      this.lbPair,
      this.binArrayBitmapExtension?.account ?? null,
    );
    if (toBinArrayIndex === null) return true;

    return swapForY
      ? marketPriceBinArrayIndex.gt(toBinArrayIndex)
      : marketPriceBinArrayIndex.lt(toBinArrayIndex);
  }

  public async getMaxPriceInBinArrays(
    binArrayAccounts: BinArrayAccount[],
  ): Promise<string> {
    // Don't mutate
    const sortedBinArrays = [...binArrayAccounts].sort(
      ({ account: { index: indexA } }, { account: { index: indexB } }) =>
        indexA.toNumber() - indexB.toNumber(),
    );
    let count = sortedBinArrays.length - 1;
    let binPriceWithLastLiquidity;
    while (count >= 0) {
      const binArray = sortedBinArrays[count];
      if (binArray) {
        const bins = binArray.account.bins;
        if (bins.every(({ amountX }) => amountX.isZero())) {
          count--;
        } else {
          const lastBinWithLiquidityIndex = bins.findLastIndex(
            ({ amountX }) => !amountX.isZero(),
          );
          binPriceWithLastLiquidity =
            bins[lastBinWithLiquidityIndex].price.toString();
          count = -1;
        }
      }
    }

    return this.fromPricePerLamport(
      Number(binPriceWithLastLiquidity) / (2 ** 64 - 1),
    );
  }

  // TODO: Implement decreasePositionLength function
  // /**
  //  * Decrease the length of a position. The segment of the position to be decreased must be empty.
  //  *
  //  * @param position The public key of the position to decrease.
  //  * @param side The side of the position to decrease.
  //  * @param length The amount of length to decrease.
  //  * @param allowParallelExecution If true, the instructions will be grouped to allow parallel execution. Otherwise, the instructions will be executed sequentially.
  //  * @returns An array of transactions if allowParallelExecution is true. Otherwise, an empty array.
  //  */
  // public async decreasePositionLength(
  //   position: PublicKey,
  //   side: ResizeSide,
  //   length: BN,
  //   allowParallelExecution = true,
  // ) {
  //   const positionAccount =
  //     await this.program.provider.connection.getAccountInfo(position);

  //   const positionState = wrapPosition(this.program, position, positionAccount);

  //   const newWidth = positionState.width().sub(length);

  //   // 1. Cap if it exceeds the min position length
  //   if (newWidth.lte(new BN(0))) {
  //     // Position must have at least one bin
  //     length = length.sub(newWidth.abs()).subn(1);
  //   }

  //   const groupedIxs: TransactionInstruction[][] = [];
  //   const promises = [];

  //   // 2. Split into multiple decrease position length ix to bypass stack size limit
  //   for (let i = length.toNumber(); i > 0; i -= MAX_RESIZE_LENGTH.toNumber()) {
  //     const lengthToReduce = Math.min(i, MAX_RESIZE_LENGTH.toNumber());

  //     const setCuIx = ComputeBudgetProgram.setComputeUnitLimit({
  //       units: getDefaultExtendPositionCU(side),
  //     });

  //     const ixPromise = this.program.methods
  //       .decreasePositionLength(lengthToReduce, Number(side))
  //       .accountsPartial({
  //         position,
  //         owner: positionState.owner(),
  //         rentReceiver: positionState.owner(),
  //       })
  //       .instruction()
  //       .then((decreasePositionLengthIx) => {
  //         if (allowParallelExecution) {
  //           // Trick to make each decrease position length transaction to be unique to allow parallel execution
  //           decreasePositionLengthIx.keys.push({
  //             isSigner: false,
  //             isWritable: false,
  //             pubkey: PublicKey.unique(),
  //           });
  //         }
  //         const ixs = [setCuIx, decreasePositionLengthIx];
  //         groupedIxs.push(ixs);
  //       });

  //     promises.push(ixPromise);
  //   }

  //   await Promise.all(promises);

  //   if (groupedIxs.length > 0) {
  //     const { blockhash, lastValidBlockHeight } =
  //       await this.program.provider.connection.getLatestBlockhash("confirmed");

  //     return groupedIxs.map((ixs) => {
  //       return new Transaction({
  //         feePayer: positionState.owner(),
  //         blockhash,
  //         lastValidBlockHeight,
  //       }).add(...ixs);
  //     });
  //   }
  // }

  // TODO: Implement increasePositionLength function
  // /**
  //  * Expand the position bin range to the left or right (lower or upper).
  //  *
  //  * @param position The address of the position to increase the length of.
  //  * @param side The side of the position to increase the length of. Must be either
  //  *             ResizeSide.Lower or ResizeSide.Upper.
  //  * @param length The number of bins to increase the length of. Position length after increase must be <= 1400.
  //  * @param funder The address to account rental and transaction fee.
  //  * @param allowParallelExecution Whether to allow parallel execution of the transaction.
  //  * @returns The transaction to execute this instruction.
  //  */
  // public async increasePositionLength(
  //   position: PublicKey,
  //   side: ResizeSide,
  //   length: BN,
  //   funder: PublicKey,
  //   allowParallelExecution = true,
  // ) {
  //   const positionAccount =
  //     await this.program.provider.connection.getAccountInfo(position);

  //   const positionState = wrapPosition(this.program, position, positionAccount);

  //   const newWidth = positionState.width().add(length);

  //   // 1. Cap if it exceeds the max position length
  //   if (newWidth.gt(POSITION_MAX_LENGTH)) {
  //     length = newWidth.sub(POSITION_MAX_LENGTH);
  //   }

  //   const groupedIxs = await this.increasePositionLengthIxs(
  //     position,
  //     side,
  //     length,
  //     funder,
  //     positionState.owner(),
  //     true,
  //     allowParallelExecution,
  //   );

  //   if (groupedIxs.length > 0) {
  //     const { blockhash, lastValidBlockHeight } =
  //       await this.program.provider.connection.getLatestBlockhash("confirmed");

  //     return groupedIxs.map((ixs) => {
  //       return new Transaction({
  //         feePayer: funder,
  //         blockhash,
  //         lastValidBlockHeight,
  //       }).add(...ixs);
  //     });
  //   }
  // }

  // public async simulateRebalancePositionWithBalancedStrategy(
  //   positionAddress: PublicKey,
  //   positionData: PositionData,
  //   strategy: StrategyType,
  //   topUpAmountX: BN,
  //   topUpAmountY: BN,
  //   xWithdrawBps: BN,
  //   yWithdrawBps: BN,
  // ) {
  //   const rebalancePosition = await RebalancePosition.create({
  //     program: this.program,
  //     positionAddress,
  //     positionData,
  //     shouldClaimFee: true,
  //     shouldClaimReward: true,
  //     pairAddress: this.pubkey,
  //   });

  //   const rebalanceStrategyBuilder = new BalancedStrategyBuilder(
  //     new BN(rebalancePosition.lbPair.activeId),
  //     new BN(rebalancePosition.lbPair.binStep),
  //     positionData,
  //     topUpAmountX,
  //     topUpAmountY,
  //     xWithdrawBps,
  //     yWithdrawBps,
  //     strategy,
  //   );

  //   return this.simulateRebalancePositionWithStrategy(
  //     rebalancePosition,
  //     rebalanceStrategyBuilder,
  //   );
  // }

  // private async simulateRebalancePositionWithStrategy(
  //   rebalancePosition: RebalancePosition,
  //   rebalanceStrategy: RebalanceStrategyBuilder,
  // ): Promise<
  //   RebalancePositionResponse & RebalancePositionBinArrayRentalCostQuote
  // > {
  //   const { deposits, withdraws } =
  //     rebalanceStrategy.buildRebalanceStrategyParameters();

  //   const simulationResult = await rebalancePosition.simulateRebalance(
  //     this.program.provider.connection,
  //     new BN(this.lbPair.binStep),
  //     new BN(this.tokenX.mint.decimals),
  //     new BN(this.tokenY.mint.decimals),
  //     withdraws,
  //     deposits,
  //   );

  //   const binArrayQuoteResult = await this.quoteBinArrayAccountsRentalCost(
  //     simulationResult.depositParams,
  //     simulationResult.withdrawParams,
  //     new BN(rebalancePosition.lbPair.activeId),
  //   );

  //   return {
  //     rebalancePosition,
  //     simulationResult,
  //     ...binArrayQuoteResult,
  //   };
  // }

  // /**
  //  * Simulates a rebalance operation on a position without actually executing it. It's recommended to use simulateRebalancePositionWithXStrategy instead unless you know what you're doing.
  //  *
  //  * @param positionAddress The address of the position to simulate rebalancing.
  //  * @param positionData The PositionData object associated with the position.
  //  * @param shouldClaimFee True if the fee should be claimed during rebalancing.
  //  * @param shouldClaimReward True if the reward should be claimed during rebalancing.
  //  * @param deposits An array of RebalanceWithDeposit objects representing the deposits to simulate.
  //  * @param withdraws An array of RebalanceWithWithdraw objects representing the withdraws to simulate.
  //  */
  // public async simulateRebalancePosition(
  //   positionAddress: PublicKey,
  //   positionData: PositionData,
  //   shouldClaimFee: boolean,
  //   shouldClaimReward: boolean,
  //   deposits: RebalanceWithDeposit[],
  //   withdraws: RebalanceWithWithdraw[],
  // ): Promise<
  //   RebalancePositionResponse & RebalancePositionBinArrayRentalCostQuote
  // > {
  //   const rebalancePosition = await RebalancePosition.create({
  //     program: this.program,
  //     positionAddress,
  //     positionData,
  //     shouldClaimFee,
  //     shouldClaimReward,
  //     pairAddress: this.pubkey,
  //   });

  //   const simulationResult = await rebalancePosition.simulateRebalance(
  //     this.program.provider.connection,
  //     new BN(this.lbPair.binStep),
  //     new BN(this.tokenX.mint.decimals),
  //     new BN(this.tokenY.mint.decimals),
  //     withdraws,
  //     deposits,
  //   );

  //   const binArrayQuoteResult = await this.quoteBinArrayAccountsRentalCost(
  //     simulationResult.depositParams,
  //     simulationResult.withdrawParams,
  //     new BN(rebalancePosition.lbPair.activeId),
  //   );

  //   return {
  //     rebalancePosition,
  //     simulationResult,
  //     ...binArrayQuoteResult,
  //   };
  // }

  // /**
  //  * Rebalances a position and claim rewards if specified.
  //  *
  //  * @param rebalancePositionResponse The result of `simulateRebalancePosition`.
  //  * @param maxActiveBinSlippage The maximum slippage allowed for active bin selection.
  //  * @param slippage The slippage tolerance percentage for rebalncing.
  //  *
  //  * @returns An object containing the instructions to initialize new bin arrays and the instruction to rebalance the position.
  //  */
  // public async rebalancePosition(
  //   rebalancePositionResponse: RebalancePositionResponse,
  //   maxActiveBinSlippage: BN,
  //   rentPayer?: PublicKey,
  //   slippage: number = 100,
  // ) {
  //   const { rebalancePosition, simulationResult } = rebalancePositionResponse;

  //   const { lbPair, shouldClaimFee, shouldClaimReward, owner, address } =
  //     rebalancePosition;
  //   const { depositParams, withdrawParams } = simulationResult;

  //   const activeId = new BN(lbPair.activeId);

  //   const { slices, accounts: transferHookAccounts } =
  //     this.getPotentialToken2022IxDataAndAccounts(ActionType.Liquidity);

  //   const preInstructions: TransactionInstruction[] = [];
  //   const harvestRewardRemainingAccountMetas: AccountMeta[] = [];

  //   if (shouldClaimReward) {
  //     for (const [idx, reward] of this.lbPair.rewardInfos.entries()) {
  //       if (!reward.mint.equals(PublicKey.default)) {
  //         const rewardTokenInfo = this.rewards[idx];
  //         slices.push({
  //           accountsType: {
  //             transferHookMultiReward: {
  //               0: idx,
  //             },
  //           },
  //           length: rewardTokenInfo.transferHookAccountMetas.length,
  //         });

  //         transferHookAccounts.push(
  //           ...rewardTokenInfo.transferHookAccountMetas,
  //         );

  //         const userTokenRewardAddress = getAssociatedTokenAddressSync(
  //           reward.mint,
  //           owner,
  //           true,
  //           rewardTokenInfo.owner,
  //         );

  //         preInstructions.push(
  //           createAssociatedTokenAccountIdempotentInstruction(
  //             owner,
  //             userTokenRewardAddress,
  //             owner,
  //             reward.mint,
  //             rewardTokenInfo.owner,
  //           ),
  //         );

  //         const rewardVault: AccountMeta = {
  //           pubkey: reward.vault,
  //           isSigner: false,
  //           isWritable: true,
  //         };

  //         const userTokenReward: AccountMeta = {
  //           pubkey: userTokenRewardAddress,
  //           isSigner: false,
  //           isWritable: true,
  //         };

  //         const rewardMint: AccountMeta = {
  //           pubkey: reward.mint,
  //           isSigner: false,
  //           isWritable: false,
  //         };

  //         const rewardTokenProgram: AccountMeta = {
  //           pubkey: rewardTokenInfo.owner,
  //           isSigner: false,
  //           isWritable: false,
  //         };

  //         harvestRewardRemainingAccountMetas.push(
  //           rewardVault,
  //           userTokenReward,
  //           rewardMint,
  //           rewardTokenProgram,
  //         );
  //       }
  //     }
  //   }

  //   const initBinArrayInstructions: TransactionInstruction[] = [];

  //   const { binArrayBitmap, binArrayIndexes } =
  //     getRebalanceBinArrayIndexesAndBitmapCoverage(
  //       depositParams,
  //       withdrawParams,
  //       activeId.toNumber(),
  //       this.pubkey,
  //       this.program.programId,
  //     );

  //   const binArrayPublicKeys = binArrayIndexes.map((index) => {
  //     const [binArrayPubkey] = deriveBinArray(
  //       this.pubkey,
  //       index,
  //       this.program.programId,
  //     );
  //     return binArrayPubkey;
  //   });

  //   const binArrayAccounts = await chunkedGetMultipleAccountInfos(
  //     this.program.provider.connection,
  //     binArrayPublicKeys,
  //   );

  //   for (let i = 0; i < binArrayAccounts.length; i++) {
  //     const binArrayAccount = binArrayAccounts[i];
  //     if (!binArrayAccount) {
  //       const binArrayPubkey = binArrayPublicKeys[i];
  //       const binArrayIndex = binArrayIndexes[i];
  //       const initBinArrayIx = await this.program.methods
  //         .initializeBinArray(binArrayIndex)
  //         .accountsPartial({
  //           binArray: binArrayPubkey,
  //           funder: owner,
  //           lbPair: this.pubkey,
  //         })
  //         .instruction();

  //       initBinArrayInstructions.push(initBinArrayIx);
  //     }
  //   }

  //   if (!binArrayBitmap.equals(PublicKey.default)) {
  //     const bitmapAccount =
  //       await this.program.provider.connection.getAccountInfo(binArrayBitmap);

  //     if (!bitmapAccount) {
  //       const initBitmapExtensionIx = await this.program.methods
  //         .initializeBinArrayBitmapExtension()
  //         .accountsPartial({
  //           binArrayBitmapExtension: binArrayBitmap,
  //           funder: owner,
  //           lbPair: this.pubkey,
  //         })
  //         .preInstructions([
  //           ComputeBudgetProgram.setComputeUnitLimit({
  //             units: DEFAULT_INIT_BIN_ARRAY_CU,
  //           }),
  //         ])
  //         .instruction();
  //       preInstructions.push(initBitmapExtensionIx);
  //     }
  //   }

  //   const [
  //     { ataPubKey: userTokenX, ix: createUserTokenXIx },
  //     { ataPubKey: userTokenY, ix: createUserTokenYIx },
  //   ] = await Promise.all([
  //     getOrCreateATAInstruction(
  //       this.program.provider.connection,
  //       this.tokenX.publicKey,
  //       owner,
  //       this.tokenX.owner,
  //     ),
  //     getOrCreateATAInstruction(
  //       this.program.provider.connection,
  //       this.tokenY.publicKey,
  //       owner,
  //       this.tokenY.owner,
  //     ),
  //   ]);
  //   createUserTokenXIx && preInstructions.push(createUserTokenXIx);
  //   createUserTokenYIx && preInstructions.push(createUserTokenYIx);

  //   slippage = capSlippagePercentage(slippage);

  //   const maxDepositXAmount = getSlippageMaxAmount(
  //     simulationResult.actualAmountXDeposited,
  //     slippage,
  //   );

  //   const maxDepositYAmount = getSlippageMaxAmount(
  //     simulationResult.actualAmountYDeposited,
  //     slippage,
  //   );

  //   const minWithdrawXAmount = getSlippageMinAmount(
  //     simulationResult.actualAmountXWithdrawn,
  //     slippage,
  //   );

  //   const minWithdrawYAmount = getSlippageMinAmount(
  //     simulationResult.actualAmountYWithdrawn,
  //     slippage,
  //   );

  //   const postInstructions: Array<TransactionInstruction> = [];

  //   // Add wrapSOL instructions if tokenX or tokenY is NATIVE_MINT
  //   if (
  //     this.tokenX.publicKey.equals(NATIVE_MINT) &&
  //     simulationResult.actualAmountXDeposited.gtn(0) &&
  //     !this.opt?.skipSolWrappingOperation
  //   ) {
  //     const wrapSOLIx = wrapSOLInstruction(
  //       owner,
  //       userTokenX,
  //       BigInt(simulationResult.actualAmountXDeposited.toString()),
  //     );
  //     preInstructions.push(...wrapSOLIx);
  //   }

  //   if (
  //     this.tokenY.publicKey.equals(NATIVE_MINT) &&
  //     simulationResult.actualAmountYDeposited.gtn(0) &&
  //     !this.opt?.skipSolWrappingOperation
  //   ) {
  //     const wrapSOLIx = wrapSOLInstruction(
  //       owner,
  //       userTokenY,
  //       BigInt(simulationResult.actualAmountYDeposited.toString()),
  //     );
  //     preInstructions.push(...wrapSOLIx);
  //   }

  //   // Add unwrapSOL instructions if tokenX or tokenY is NATIVE_MINT
  //   if (
  //     (this.tokenX.publicKey.equals(NATIVE_MINT) ||
  //       this.tokenY.publicKey.equals(NATIVE_MINT)) &&
  //     !this.opt?.skipSolWrappingOperation
  //   ) {
  //     const closeWrappedSOLIx = await unwrapSOLInstruction(owner);
  //     closeWrappedSOLIx && postInstructions.push(closeWrappedSOLIx);
  //   }

  //   const instruction = await this.program.methods
  //     .rebalanceLiquidity(
  //       {
  //         adds: depositParams,
  //         removes: withdrawParams,
  //         activeId: activeId.toNumber(),
  //         shouldClaimFee,
  //         shouldClaimReward,
  //         maxActiveBinSlippage: maxActiveBinSlippage.toNumber(),
  //         maxDepositXAmount,
  //         maxDepositYAmount,
  //         minWithdrawXAmount,
  //         minWithdrawYAmount,
  //         shrinkMode: ShrinkMode.ShrinkBoth,
  //         padding: REBALANCE_POSITION_PADDING,
  //       },
  //       {
  //         slices,
  //       },
  //     )
  //     .accountsPartial({
  //       lbPair: this.pubkey,
  //       binArrayBitmapExtension: binArrayBitmap,
  //       position: address,
  //       owner,
  //       userTokenX,
  //       userTokenY,
  //       reserveX: this.lbPair.reserveX,
  //       reserveY: this.lbPair.reserveY,
  //       tokenXMint: this.tokenX.publicKey,
  //       tokenYMint: this.tokenY.publicKey,
  //       tokenXProgram: this.tokenX.owner,
  //       tokenYProgram: this.tokenY.owner,
  //       memoProgram: MEMO_PROGRAM_ID,
  //       rentPayer: rentPayer ?? owner,
  //     })
  //     .remainingAccounts(transferHookAccounts)
  //     .remainingAccounts(
  //       binArrayPublicKeys.map((pubkey) => {
  //         return {
  //           pubkey,
  //           isSigner: false,
  //           isWritable: true,
  //         };
  //       }),
  //     )
  //     .instruction();

  //   const setCUIX = await getEstimatedComputeUnitIxWithBuffer(
  //     this.program.provider.connection,
  //     [instruction],
  //     owner,
  //   );

  //   const rebalancePositionInstruction = [
  //     setCUIX,
  //     ...preInstructions,
  //     instruction,
  //     ...postInstructions,
  //   ];

  //   return {
  //     initBinArrayInstructions,
  //     rebalancePositionInstruction,
  //   };
  // }

  /** Private static method */

  private static async getBinArrays(
    program: ClmmProgram,
    lbPairPubkey: PublicKey,
  ): Promise<Array<BinArrayAccount>> {
    return program.account.binArray.all([binArrayLbPairFilter(lbPairPubkey)]);
  }

  private static async processPosition(
    program: ClmmProgram,
    lbPair: LbPair,
    clock: Clock,
    position: IPosition,
    baseMint: Mint,
    quoteMint: Mint,
    rewardMint0: Mint | null,
    rewardMint1: Mint | null,
    binArrayMap: Map<String, BinArray>,
  ): Promise<PositionData | null> {
    const lbPairKey = position.lbPair();
    const lowerBinId = position.lowerBinId();
    const upperBinId = position.upperBinId();

    const posShares = position.liquidityShares();
    const lastUpdatedAt = position.lastUpdatedAt();
    const feeInfos = position.feeInfos();

    const totalClaimedFeeXAmount = position.totalClaimedFeeXAmount();
    const totalClaimedFeeYAmount = position.totalClaimedFeeYAmount();

    const positionRewardInfos = position.rewardInfos();

    const feeOwner = position.feeOwner();

    const bins = this.getBinsBetweenLowerAndUpperBound(
      lbPairKey,
      lbPair,
      lowerBinId.toNumber(),
      upperBinId.toNumber(),
      baseMint.decimals,
      quoteMint.decimals,
      binArrayMap,
      program.programId,
    );

    if (!bins.length) return null;

    const positionData: PositionBinData[] = [];

    let totalXAmount = new Decimal(0);
    let totalYAmount = new Decimal(0);

    const ZERO = new BN(0);

    let feeX = ZERO;
    let feeY = ZERO;

    let rewards = [ZERO, ZERO];

    bins.forEach((bin, idx) => {
      const binSupply = bin.supply;
      const posShare = posShares[idx];

      const posBinRewardInfo = positionRewardInfos[idx];

      const positionXAmount = binSupply.eq(ZERO)
        ? ZERO
        : posShare.mul(bin.xAmount).div(binSupply);

      const positionYAmount = binSupply.eq(ZERO)
        ? ZERO
        : posShare.mul(bin.yAmount).div(binSupply);

      totalXAmount = totalXAmount.add(new Decimal(positionXAmount.toString()));
      totalYAmount = totalYAmount.add(new Decimal(positionYAmount.toString()));

      const feeInfo = feeInfos[idx];

      const newFeeX = posShare.isZero()
        ? new BN(0)
        : mulShr(
            posShares[idx].shrn(SCALE_OFFSET),
            bin.feeAmountXPerTokenStored.sub(feeInfo.feeXPerTokenComplete),
            SCALE_OFFSET,
            Rounding.Down,
          );

      const newFeeY = posShare.isZero()
        ? new BN(0)
        : mulShr(
            posShares[idx].shrn(SCALE_OFFSET),
            bin.feeAmountYPerTokenStored.sub(feeInfo.feeYPerTokenComplete),
            SCALE_OFFSET,
            Rounding.Down,
          );

      const claimableFeeX = newFeeX.add(feeInfo.feeXPending);
      const claimableFeeY = newFeeY.add(feeInfo.feeYPending);

      feeX = feeX.add(claimableFeeX);
      feeY = feeY.add(claimableFeeY);

      const claimableRewardsInBin = [new BN(0), new BN(0)];

      // for (let j = 0; j < claimableRewardsInBin.length; j++) {
      //   const pairRewardInfo = lbPair.rewardInfos[j];

      //   if (!pairRewardInfo.mint.equals(PublicKey.default)) {
      //     let rewardPerTokenStored = bin.rewardPerTokenStored[j];

      //     if (bin.binId == lbPair.activeId && !bin.supply.isZero()) {
      //       const currentTime = new BN(
      //         Math.min(
      //           clock.unixTimestamp.toNumber(),
      //           pairRewardInfo.rewardDurationEnd.toNumber(),
      //         ),
      //       );

      //       const delta = currentTime.sub(pairRewardInfo.lastUpdateTime);
      //       const liquiditySupply = bin.supply.shrn(SCALE_OFFSET);

      //       const rewardPerTokenStoredDelta = pairRewardInfo.rewardRate
      //         .mul(delta)
      //         .div(new BN(15))
      //         .div(liquiditySupply);

      //       rewardPerTokenStored = rewardPerTokenStored.add(
      //         rewardPerTokenStoredDelta,
      //       );
      //     }

      //     const delta = rewardPerTokenStored.sub(
      //       posBinRewardInfo.rewardPerTokenCompletes[j],
      //     );

      //     const newReward = posShares[idx].isZero()
      //       ? new BN(0)
      //       : mulShr(
      //           delta,
      //           posShares[idx].shrn(SCALE_OFFSET),
      //           SCALE_OFFSET,
      //           Rounding.Down,
      //         );

      //     const claimableReward = newReward.add(
      //       posBinRewardInfo.rewardPendings[j],
      //     );

      //     claimableRewardsInBin[j] =
      //       claimableRewardsInBin[j].add(claimableReward);
      //     rewards[j] = rewards[j].add(claimableReward);
      //   }
      // }

      positionData.push({
        binId: bin.binId,
        price: bin.price,
        pricePerToken: bin.pricePerToken,
        binXAmount: bin.xAmount.toString(),
        binYAmount: bin.yAmount.toString(),
        binLiquidity: binSupply.toString(),
        positionLiquidity: posShare.toString(),
        positionXAmount: positionXAmount.toString(),
        positionYAmount: positionYAmount.toString(),
        positionFeeXAmount: claimableFeeX.toString(),
        positionFeeYAmount: claimableFeeY.toString(),
        positionRewardAmount: claimableRewardsInBin.map((amount) =>
          amount.toString(),
        ),
      });
    });

    const currentEpoch = clock.epoch.toNumber();

    const feeXExcludeTransferFee = calculateTransferFeeExcludedAmount(
      feeX,
      baseMint,
      currentEpoch,
    ).amount;

    const feeYExcludeTransferFee = calculateTransferFeeExcludedAmount(
      feeY,
      quoteMint,
      currentEpoch,
    ).amount;

    const rewardOne = rewards[0];
    const rewardTwo = rewards[1];

    let rewardOneExcludeTransferFee = new BN(0);
    let rewardTwoExcludeTransferFee = new BN(0);

    if (rewardMint0) {
      rewardOneExcludeTransferFee = calculateTransferFeeExcludedAmount(
        rewardOne,
        rewardMint0,
        currentEpoch,
      ).amount;
    }

    if (rewardMint1) {
      rewardTwoExcludeTransferFee = calculateTransferFeeExcludedAmount(
        rewardTwo,
        rewardMint1,
        currentEpoch,
      ).amount;
    }

    const totalXAmountExcludeTransferFee = calculateTransferFeeExcludedAmount(
      new BN(totalXAmount.floor().toString()),
      baseMint,
      currentEpoch,
    ).amount;

    const totalYAmountExcludeTransferFee = calculateTransferFeeExcludedAmount(
      new BN(totalYAmount.floor().toString()),
      quoteMint,
      currentEpoch,
    ).amount;

    return {
      totalXAmount: totalXAmount.toString(),
      totalYAmount: totalYAmount.toString(),
      positionBinData: positionData,
      lastUpdatedAt,
      lowerBinId: lowerBinId.toNumber(),
      upperBinId: upperBinId.toNumber(),
      feeX,
      feeY,
      rewardOne,
      rewardTwo,
      feeOwner,
      totalClaimedFeeXAmount,
      totalClaimedFeeYAmount,
      totalXAmountExcludeTransferFee,
      totalYAmountExcludeTransferFee,
      rewardOneExcludeTransferFee,
      rewardTwoExcludeTransferFee,
      feeXExcludeTransferFee,
      feeYExcludeTransferFee,
      owner: position.owner(),
    };
  }

  private static getBinsBetweenLowerAndUpperBound(
    lbPairKey: PublicKey,
    lbPair: LbPair,
    lowerBinId: number,
    upperBinId: number,
    baseTokenDecimal: number,
    quoteTokenDecimal: number,
    binArrayMap: Map<String, BinArray>,
    programId: PublicKey,
  ): BinLiquidity[] {
    const lowerBinArrayIndex = binIdToBinArrayIndex(new BN(lowerBinId));
    const upperBinArrayIndex = binIdToBinArrayIndex(new BN(upperBinId));

    let bins: BinLiquidity[] = [];
    const ZERO = new BN(0);

    for (
      let binArrayIndex = lowerBinArrayIndex.toNumber();
      binArrayIndex <= upperBinArrayIndex.toNumber();
      binArrayIndex++
    ) {
      const binArrayIndexBN = new BN(binArrayIndex);
      const binArrayKey = deriveBinArray(
        lbPairKey,
        binArrayIndexBN,
        programId,
      )[0];

      const [lowerBinIdForBinArray] =
        getBinArrayLowerUpperBinId(binArrayIndexBN);

      const binArray = binArrayMap.get(binArrayKey.toBase58());

      for (let i = 0; i < MAX_BIN_ARRAY_SIZE.toNumber(); i++) {
        const binId = lowerBinIdForBinArray.toNumber() + i;

        if (binId >= lowerBinId && binId <= upperBinId) {
          const pricePerLamport = getPriceOfBinByBinId(
            binId,
            lbPair.binStep,
          ).toString();

          if (!binArray) {
            bins.push({
              binId,
              xAmount: ZERO,
              yAmount: ZERO,
              supply: ZERO,
              feeAmountXPerTokenStored: ZERO,
              feeAmountYPerTokenStored: ZERO,
              rewardPerTokenStored: [ZERO, ZERO],
              price: pricePerLamport,
              version: 2,
              pricePerToken: new Decimal(pricePerLamport)
                .mul(new Decimal(10 ** (baseTokenDecimal - quoteTokenDecimal)))
                .toString(),
            });
          } else {
            const bin = binArray.bins[i];

            bins.push({
              binId,
              xAmount: bin.amountX,
              yAmount: bin.amountY,
              supply: bin.liquiditySupply,
              feeAmountXPerTokenStored: bin.feeAmountXPerTokenStored,
              feeAmountYPerTokenStored: bin.feeAmountYPerTokenStored,
              rewardPerTokenStored: bin.rewardPerTokenStored,
              price: pricePerLamport,
              version: 1,
              pricePerToken: new Decimal(pricePerLamport)
                .mul(new Decimal(10 ** (baseTokenDecimal - quoteTokenDecimal)))
                .toString(),
            });
          }
        }
      }
    }

    return bins;
  }

  /** Private method */

  private processXYAmountDistribution(
    xYAmountDistribution: BinLiquidityDistribution[],
  ) {
    let currentBinId: number | null = null;
    const xAmountDistribution: number[] = [];
    const yAmountDistribution: number[] = [];
    const binIds: number[] = [];

    xYAmountDistribution.forEach((binAndAmount) => {
      xAmountDistribution.push(binAndAmount.distributionX);
      yAmountDistribution.push(binAndAmount.distributionY);
      binIds.push(binAndAmount.binId);

      if (currentBinId && binAndAmount.binId !== currentBinId + 1) {
        throw new Error("Discontinuous Bin ID");
      } else {
        currentBinId = binAndAmount.binId;
      }
    });

    return {
      lowerBinId: xYAmountDistribution[0].binId,
      upperBinId: xYAmountDistribution[xYAmountDistribution.length - 1].binId,
      xAmountDistribution,
      yAmountDistribution,
      binIds,
    };
  }

  private async getBins(
    lbPairPubKey: PublicKey,
    lowerBinId: number,
    upperBinId: number,
    baseTokenDecimal: number,
    quoteTokenDecimal: number,
    lowerBinArray?: BinArray,
    upperBinArray?: BinArray,
  ) {
    const lowerBinArrayIndex = binIdToBinArrayIndex(new BN(lowerBinId));
    const upperBinArrayIndex = binIdToBinArrayIndex(new BN(upperBinId));

    const hasCachedLowerBinArray = lowerBinArray != null;
    const hasCachedUpperBinArray = upperBinArray != null;
    const isSingleBinArray = lowerBinArrayIndex.eq(upperBinArrayIndex);

    const lowerBinArrayIndexOffset = hasCachedLowerBinArray ? 1 : 0;
    const upperBinArrayIndexOffset = hasCachedUpperBinArray ? -1 : 0;

    const binArrayPubkeys = range(
      lowerBinArrayIndex.toNumber() + lowerBinArrayIndexOffset,
      upperBinArrayIndex.toNumber() + upperBinArrayIndexOffset,
      (i) => deriveBinArray(lbPairPubKey, new BN(i), this.program.programId)[0],
    );
    const fetchedBinArrays =
      binArrayPubkeys.length !== 0
        ? await this.program.account.binArray.fetchMultiple(binArrayPubkeys)
        : [];
    const binArrays = [
      ...(hasCachedLowerBinArray ? [lowerBinArray] : []),
      ...fetchedBinArrays,
      ...(hasCachedUpperBinArray && !isSingleBinArray ? [upperBinArray] : []),
    ];

    const binsById = new Map(
      binArrays
        .filter((x) => x != null)
        .flatMap(({ bins, index }) => {
          const [lowerBinId] = getBinArrayLowerUpperBinId(index);
          return bins.map(
            (b, i) => [lowerBinId.toNumber() + i, b] as [number, Bin],
          );
        }),
    );
    const version = 1;
    // binArrays.find((binArray) => binArray != null)?.version ?? 1;

    return Array.from(
      enumerateBins(
        binsById,
        lowerBinId,
        upperBinId,
        this.lbPair.binStep,
        baseTokenDecimal,
        quoteTokenDecimal,
        version,
      ),
    );
  }

  private async binArraysToBeCreate(
    lowerBinArrayIndex: BN,
    upperBinArrayIndex: BN,
  ) {
    const binArrayIndexes: BN[] = Array.from(
      { length: upperBinArrayIndex.sub(lowerBinArrayIndex).toNumber() + 1 },
      (_, index) => index + lowerBinArrayIndex.toNumber(),
    ).map((idx) => new BN(idx));

    const binArrays: PublicKey[] = [];
    for (const idx of binArrayIndexes) {
      const [binArrayPubKey] = deriveBinArray(
        this.pubkey,
        idx,
        this.program.programId,
      );
      binArrays.push(binArrayPubKey);
    }

    const binArrayAccounts =
      await this.program.provider.connection.getMultipleAccountsInfo(binArrays);

    return binArrayAccounts
      .filter((binArray) => binArray === null)
      .map((_, index) => binArrays[index]);
  }

  private async createBinArraysIfNeeded(
    binArrayIndexes: BN[],
    funder: PublicKey,
  ): Promise<TransactionInstruction[]> {
    const ixs: TransactionInstruction[] = [];

    for (const idx of binArrayIndexes) {
      const [binArrayKey] = deriveBinArray(
        this.pubkey,
        idx,
        this.program.programId,
      );
      const binArrayAccount =
        await this.program.provider.connection.getAccountInfo(binArrayKey);

      if (binArrayAccount === null) {
        ixs.push(
          await this.program.methods
            .initializeBinArray(idx)
            .accountsPartial({
              binArray: binArrayKey,
              funder,
              lbPair: this.pubkey,
            })
            .instruction(),
        );
      }
    }
    return ixs;
  }

  public static updateVolatilityAccumulator(
    vParameter: vParameters,
    sParameter: sParameters,
    activeId: number,
  ) {
    const deltaId = Math.abs(vParameter.indexReference - activeId);
    const newVolatilityAccumulator =
      vParameter.volatilityReference + deltaId * BASIS_POINT_MAX;

    vParameter.volatilityAccumulator = Math.min(
      newVolatilityAccumulator,
      sParameter.maxVolatilityAccumulator,
    );
  }

  public static updateReference(
    activeId: number,
    vParameter: vParameters,
    sParameter: sParameters,
    currentTimestamp: number,
  ) {
    const elapsed =
      currentTimestamp - vParameter.lastUpdateTimestamp.toNumber();

    if (elapsed >= sParameter.filterPeriod) {
      vParameter.indexReference = activeId;
      if (elapsed < sParameter.decayPeriod) {
        const decayedVolatilityReference = Math.floor(
          (vParameter.volatilityAccumulator * sParameter.reductionFactor) /
            BASIS_POINT_MAX,
        );
        vParameter.volatilityReference = decayedVolatilityReference;
      } else {
        vParameter.volatilityReference = 0;
      }
    }
  }

  private async createClaimSwapFeeMethod({
    owner,
    position,
  }: {
    owner: PublicKey;
    position: LbPosition;
  }): Promise<Transaction[]> {
    // Avoid to attempt to load uninitialized bin array on the program
    const maybeClaimableBinRange = getPositionLowerUpperBinIdWithLiquidity(
      position.positionData,
    );

    if (!maybeClaimableBinRange) return [];

    const { lowerBinId, upperBinId } = maybeClaimableBinRange;

    const chunkedBinRange = chunkBinRange(
      lowerBinId.toNumber(),
      upperBinId.toNumber(),
    );

    const claimFeeTxs = [];

    for (const {
      lowerBinId: chunkedLowerBinId,
      upperBinId: chunkedUpperBinId,
    } of chunkedBinRange) {
      const binArrayAccountsMeta = getBinArrayAccountMetasCoverage(
        new BN(chunkedLowerBinId),
        new BN(chunkedUpperBinId),
        this.pubkey,
        this.program.programId,
      );

      const { feeOwner } = position.positionData;

      const walletToReceiveFee = feeOwner.equals(PublicKey.default)
        ? owner
        : feeOwner;

      const preInstructions: TransactionInstruction[] = [];

      const userTokenX = getAssociatedTokenAddressSync(
        this.lbPair.tokenXMint,
        walletToReceiveFee,
        true,
        this.tokenX.owner,
      );

      const userTokenY = getAssociatedTokenAddressSync(
        this.lbPair.tokenYMint,
        walletToReceiveFee,
        true,
        this.tokenY.owner,
      );

      const createUserTokenXIx =
        createAssociatedTokenAccountIdempotentInstruction(
          owner,
          userTokenX,
          walletToReceiveFee,
          this.lbPair.tokenXMint,
          this.tokenX.owner,
        );

      const createUserTokenYIx =
        createAssociatedTokenAccountIdempotentInstruction(
          owner,
          userTokenY,
          walletToReceiveFee,
          this.lbPair.tokenYMint,
          this.tokenY.owner,
        );

      preInstructions.push(createUserTokenXIx);
      preInstructions.push(createUserTokenYIx);

      const postInstructions: Array<TransactionInstruction> = [];
      if (
        [
          this.tokenX.publicKey.toBase58(),
          this.tokenY.publicKey.toBase58(),
        ].includes(NATIVE_MINT.toBase58()) &&
        !this.opt?.skipSolWrappingOperation
      ) {
        const closeWrappedSOLIx = await unwrapSOLInstruction(owner);
        closeWrappedSOLIx && postInstructions.push(closeWrappedSOLIx);
      }

      // const { slices, accounts: transferHookAccounts } =
      //   this.getPotentialToken2022IxDataAndAccounts(ActionType.Liquidity);

      const claimFeeTx = await this.program.methods
        .claimFee(chunkedLowerBinId, chunkedUpperBinId)
        .accountsPartial({
          lbPair: this.pubkey,
          sender: owner,
          position: position.publicKey,
          reserveX: this.lbPair.reserveX,
          reserveY: this.lbPair.reserveY,
          tokenXProgram: this.tokenX.owner,
          tokenYProgram: this.tokenY.owner,
          tokenXMint: this.tokenX.publicKey,
          tokenYMint: this.tokenY.publicKey,
          userTokenX,
          userTokenY,
        })
        // .remainingAccounts(transferHookAccounts)
        .remainingAccounts(binArrayAccountsMeta)
        .preInstructions(preInstructions)
        .postInstructions(postInstructions)
        .transaction();

      claimFeeTxs.push(claimFeeTx);
    }

    return claimFeeTxs;
  }
}
