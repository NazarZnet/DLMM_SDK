/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/dlmm_contract_soratech.json`.
 */
export type DlmmContractSoratech = {
  address: "7PAPPM8tAPuhAmBsa7kbTcXNA6xXK3skXLdJLZ72sqZW";
  metadata: {
    name: "dlmmContractSoratech";
    version: "0.1.0";
    spec: "0.1.0";
    description: "Created with Anchor";
  };
  instructions: [
    {
      name: "addLiquidity";
      docs: ["Add liquidity to a liquidity book pair"];
      discriminator: [181, 157, 89, 67, 143, 182, 52, 72];
      accounts: [
        {
          name: "position";
          docs: ["User position account to update with new liquidity shares"];
          writable: true;
        },
        {
          name: "lbPair";
          docs: ["Liquidity book pair account containing bins and reserves"];
          writable: true;
          relations: ["position", "binArrayBitmapExtension"];
        },
        {
          name: "binArrayBitmapExtension";
          docs: [
            "Optional bitmap extension for tracking bin array initialization",
          ];
          writable: true;
          optional: true;
        },
        {
          name: "userTokenX";
          docs: ["User's token X account to transfer from"];
          writable: true;
        },
        {
          name: "userTokenY";
          docs: ["User's token Y account to transfer from"];
          writable: true;
        },
        {
          name: "reserveX";
          docs: ["Pair's token X reserve vault"];
          writable: true;
          relations: ["lbPair"];
        },
        {
          name: "reserveY";
          docs: ["Pair's token Y reserve vault"];
          writable: true;
          relations: ["lbPair"];
        },
        {
          name: "tokenXMint";
          docs: ["Base token mint account"];
          relations: ["lbPair"];
        },
        {
          name: "tokenYMint";
          docs: ["Quote token mint account"];
          relations: ["lbPair"];
        },
        {
          name: "sender";
          docs: ["Transaction sender and position owner"];
          signer: true;
        },
        {
          name: "tokenXProgram";
          docs: ["SPL Token program interface for token X"];
        },
        {
          name: "tokenYProgram";
          docs: ["SPL Token program interface for token Y"];
        },
        {
          name: "systemProgram";
          docs: ["Solana system program for account creation"];
          address: "11111111111111111111111111111111";
        },
        {
          name: "eventAuthority";
          pda: {
            seeds: [
              {
                kind: "const";
                value: [
                  95,
                  95,
                  101,
                  118,
                  101,
                  110,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121,
                ];
              },
            ];
          };
        },
        {
          name: "program";
        },
      ];
      args: [
        {
          name: "liquidityParameter";
          type: {
            defined: {
              name: "liquidityParameter";
            };
          };
        },
      ];
    },
    {
      name: "claimFee";
      docs: ["Claim accumulated fees from a position"];
      discriminator: [169, 32, 79, 137, 136, 232, 70, 137];
      accounts: [
        {
          name: "position";
          writable: true;
        },
        {
          name: "lbPair";
          writable: true;
          relations: ["position", "binArrayBitmapExtension"];
        },
        {
          name: "binArrayBitmapExtension";
          optional: true;
        },
        {
          name: "userTokenX";
          writable: true;
        },
        {
          name: "userTokenY";
          writable: true;
        },
        {
          name: "reserveX";
          writable: true;
          relations: ["lbPair"];
        },
        {
          name: "reserveY";
          writable: true;
          relations: ["lbPair"];
        },
        {
          name: "tokenXMint";
          relations: ["lbPair"];
        },
        {
          name: "tokenYMint";
          relations: ["lbPair"];
        },
        {
          name: "sender";
          signer: true;
        },
        {
          name: "tokenXProgram";
        },
        {
          name: "tokenYProgram";
        },
        {
          name: "eventAuthority";
          pda: {
            seeds: [
              {
                kind: "const";
                value: [
                  95,
                  95,
                  101,
                  118,
                  101,
                  110,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121,
                ];
              },
            ];
          };
        },
        {
          name: "program";
        },
      ];
      args: [
        {
          name: "minBinId";
          type: "i32";
        },
        {
          name: "maxBinId";
          type: "i32";
        },
      ];
    },
    {
      name: "initialize";
      docs: ["Initialize the program"];
      discriminator: [175, 175, 109, 31, 13, 152, 155, 237];
      accounts: [];
      args: [];
    },
    {
      name: "initializeBinArray";
      docs: ["Initialize a new bin array for a liquidity book pair"];
      discriminator: [35, 86, 19, 185, 78, 212, 75, 211];
      accounts: [
        {
          name: "lbPair";
          docs: ["The liquidity book pair that will own this bin array"];
        },
        {
          name: "binArray";
          docs: ["The bin array account being initialized"];
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [98, 105, 110, 95, 97, 114, 114, 97, 121];
              },
              {
                kind: "account";
                path: "lbPair";
              },
              {
                kind: "arg";
                path: "index";
              },
            ];
          };
        },
        {
          name: "funder";
          docs: ["Account paying for the bin array creation"];
          writable: true;
          signer: true;
        },
        {
          name: "systemProgram";
          docs: ["System program for account creation"];
          address: "11111111111111111111111111111111";
        },
      ];
      args: [
        {
          name: "index";
          type: "i64";
        },
      ];
    },
    {
      name: "initializeBinArrayBitmapExtension";
      docs: ["Initialize a new bitmap extension for a liquidity book pair."];
      discriminator: [47, 157, 226, 180, 12, 240, 33, 71];
      accounts: [
        {
          name: "lbPair";
          docs: ["The liquidity book pair that will own this bitmap extension"];
        },
        {
          name: "binArrayBitmapExtension";
          docs: ["The bitmap extension account being initialized"];
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [98, 105, 116, 109, 97, 112];
              },
              {
                kind: "account";
                path: "lbPair";
              },
            ];
          };
        },
        {
          name: "funder";
          docs: ["Account paying for the bitmap extension creation"];
          writable: true;
          signer: true;
        },
        {
          name: "systemProgram";
          docs: ["System program for account creation"];
          address: "11111111111111111111111111111111";
        },
      ];
      args: [];
    },
    {
      name: "initializeLbPair";
      docs: ["Initialize a new DLMM liquidity book pair"];
      discriminator: [45, 154, 237, 210, 221, 15, 166, 92];
      accounts: [
        {
          name: "lbPair";
          docs: ["Liquidity book pair account to initialize"];
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [108, 98, 95, 112, 97, 105, 114];
              },
              {
                kind: "account";
                path: "tokenMintX";
              },
              {
                kind: "account";
                path: "tokenMintY";
              },
              {
                kind: "arg";
                path: "binStep";
              },
            ];
          };
        },
        {
          name: "tokenMintX";
          docs: ["Base token mint account"];
        },
        {
          name: "tokenMintY";
          docs: ["Quote token mint account"];
        },
        {
          name: "reserveX";
          docs: ["Token vault for base asset reserves"];
          writable: true;
          pda: {
            seeds: [
              {
                kind: "account";
                path: "lbPair";
              },
              {
                kind: "account";
                path: "tokenMintX";
              },
            ];
          };
        },
        {
          name: "reserveY";
          docs: ["Token vault for quote asset reserves"];
          writable: true;
          pda: {
            seeds: [
              {
                kind: "account";
                path: "lbPair";
              },
              {
                kind: "account";
                path: "tokenMintY";
              },
            ];
          };
        },
        {
          name: "funder";
          docs: ["Account that pays for the initialization"];
          writable: true;
          signer: true;
        },
        {
          name: "feeOwner";
          docs: ["Protocol fee recipient account"];
        },
        {
          name: "tokenProgram";
          docs: ["SPL Token program interface"];
        },
        {
          name: "systemProgram";
          docs: ["Solana system program for account creation"];
          address: "11111111111111111111111111111111";
        },
        {
          name: "rent";
          docs: ["Solana rent sysvar for rent calculations"];
          address: "SysvarRent111111111111111111111111111111111";
        },
        {
          name: "eventAuthority";
          pda: {
            seeds: [
              {
                kind: "const";
                value: [
                  95,
                  95,
                  101,
                  118,
                  101,
                  110,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121,
                ];
              },
            ];
          };
        },
        {
          name: "program";
        },
      ];
      args: [
        {
          name: "activeId";
          type: "i32";
        },
        {
          name: "binStep";
          type: "u16";
        },
      ];
    },
    {
      name: "initializePosition";
      docs: ["Initialize a position for a LB pair and owner"];
      discriminator: [219, 192, 234, 71, 190, 191, 102, 80];
      accounts: [
        {
          name: "position";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [112, 111, 115, 105, 116, 105, 111, 110];
              },
              {
                kind: "account";
                path: "lbPair";
              },
              {
                kind: "account";
                path: "owner";
              },
              {
                kind: "arg";
                path: "lowerBinId";
              },
              {
                kind: "arg";
                path: "width";
              },
            ];
          };
        },
        {
          name: "lbPair";
        },
        {
          name: "owner";
        },
        {
          name: "payer";
          writable: true;
          signer: true;
        },
        {
          name: "systemProgram";
          address: "11111111111111111111111111111111";
        },
        {
          name: "eventAuthority";
          pda: {
            seeds: [
              {
                kind: "const";
                value: [
                  95,
                  95,
                  101,
                  118,
                  101,
                  110,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121,
                ];
              },
            ];
          };
        },
        {
          name: "program";
        },
      ];
      args: [
        {
          name: "lowerBinId";
          type: "i32";
        },
        {
          name: "width";
          type: "i32";
        },
      ];
    },
    {
      name: "removeAllLiquidity";
      discriminator: [10, 51, 61, 35, 112, 105, 24, 85];
      accounts: [
        {
          name: "position";
          docs: ["User position account to update with new liquidity shares"];
          writable: true;
        },
        {
          name: "lbPair";
          docs: ["Liquidity book pair account containing bins and reserves"];
          writable: true;
          relations: ["position", "binArrayBitmapExtension"];
        },
        {
          name: "binArrayBitmapExtension";
          docs: [
            "Optional bitmap extension for tracking bin array initialization",
          ];
          writable: true;
          optional: true;
        },
        {
          name: "userTokenX";
          docs: ["User's token X account to transfer from"];
          writable: true;
        },
        {
          name: "userTokenY";
          docs: ["User's token Y account to transfer from"];
          writable: true;
        },
        {
          name: "reserveX";
          docs: ["Pair's token X reserve vault"];
          writable: true;
          relations: ["lbPair"];
        },
        {
          name: "reserveY";
          docs: ["Pair's token Y reserve vault"];
          writable: true;
          relations: ["lbPair"];
        },
        {
          name: "tokenXMint";
          docs: ["Base token mint account"];
          relations: ["lbPair"];
        },
        {
          name: "tokenYMint";
          docs: ["Quote token mint account"];
          relations: ["lbPair"];
        },
        {
          name: "sender";
          docs: ["Transaction sender and position owner"];
          signer: true;
        },
        {
          name: "tokenXProgram";
          docs: ["SPL Token program interface for token X"];
        },
        {
          name: "tokenYProgram";
          docs: ["SPL Token program interface for token Y"];
        },
        {
          name: "systemProgram";
          docs: ["Solana system program for account creation"];
          address: "11111111111111111111111111111111";
        },
        {
          name: "eventAuthority";
          pda: {
            seeds: [
              {
                kind: "const";
                value: [
                  95,
                  95,
                  101,
                  118,
                  101,
                  110,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121,
                ];
              },
            ];
          };
        },
        {
          name: "program";
        },
      ];
      args: [];
    },
    {
      name: "swap";
      docs: ["Swap tokens in a liquidity book pair"];
      discriminator: [248, 198, 158, 145, 225, 117, 135, 200];
      accounts: [
        {
          name: "lbPair";
          writable: true;
          relations: ["binArrayBitmapExtension"];
        },
        {
          name: "binArrayBitmapExtension";
          optional: true;
        },
        {
          name: "reserveX";
          writable: true;
          relations: ["lbPair"];
        },
        {
          name: "reserveY";
          writable: true;
          relations: ["lbPair"];
        },
        {
          name: "userTokenIn";
          writable: true;
        },
        {
          name: "userTokenOut";
          writable: true;
        },
        {
          name: "tokenXMint";
          relations: ["lbPair"];
        },
        {
          name: "tokenYMint";
          relations: ["lbPair"];
        },
        {
          name: "hostFeeIn";
          writable: true;
          optional: true;
        },
        {
          name: "user";
          signer: true;
        },
        {
          name: "tokenXProgram";
        },
        {
          name: "tokenYProgram";
        },
        {
          name: "eventAuthority";
          pda: {
            seeds: [
              {
                kind: "const";
                value: [
                  95,
                  95,
                  101,
                  118,
                  101,
                  110,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121,
                ];
              },
            ];
          };
        },
        {
          name: "program";
        },
      ];
      args: [
        {
          name: "amountIn";
          type: "u64";
        },
        {
          name: "minAmountOut";
          type: "u64";
        },
      ];
    },
    {
      name: "updateFeeParameters";
      docs: ["Update fee parameters for a liquidity book pair"];
      discriminator: [128, 128, 208, 91, 246, 53, 31, 176];
      accounts: [
        {
          name: "lbPair";
          docs: ["Liquidity book pair account to update"];
          writable: true;
        },
        {
          name: "admin";
          docs: ["Authorized admin signer who can update fee parameters"];
          signer: true;
        },
        {
          name: "eventAuthority";
          pda: {
            seeds: [
              {
                kind: "const";
                value: [
                  95,
                  95,
                  101,
                  118,
                  101,
                  110,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121,
                ];
              },
            ];
          };
        },
        {
          name: "program";
        },
      ];
      args: [
        {
          name: "feeParameter";
          type: {
            defined: {
              name: "feeParameter";
            };
          };
        },
      ];
    },
    {
      name: "withdrawProtocolFee";
      docs: ["Withdraw accumulated protocol fees from a liquidity book pair"];
      discriminator: [158, 201, 158, 189, 33, 93, 162, 103];
      accounts: [
        {
          name: "lbPair";
          docs: [
            "The liquidity book pair containing accumulated protocol fees",
          ];
          writable: true;
        },
        {
          name: "reserveX";
          docs: ["Token X reserve vault (source of fee withdrawal)"];
          writable: true;
          relations: ["lbPair"];
        },
        {
          name: "reserveY";
          docs: ["Token Y reserve vault (source of fee withdrawal)"];
          writable: true;
          relations: ["lbPair"];
        },
        {
          name: "tokenXMint";
          docs: ["Token X mint information for validation"];
          relations: ["lbPair"];
        },
        {
          name: "tokenYMint";
          docs: ["Token Y mint information for validation"];
          relations: ["lbPair"];
        },
        {
          name: "receiverTokenX";
          docs: ["Destination account for withdrawn token X fees"];
          writable: true;
        },
        {
          name: "receiverTokenY";
          docs: ["Destination account for withdrawn token Y fees"];
          writable: true;
        },
        {
          name: "feeOwner";
          docs: ["Authorized fee owner who can withdraw protocol fees"];
          signer: true;
          relations: ["lbPair"];
        },
        {
          name: "tokenXProgram";
          docs: ["SPL Token program for token X transfers"];
        },
        {
          name: "tokenYProgram";
          docs: ["SPL Token program for token Y transfers"];
        },
      ];
      args: [
        {
          name: "amountX";
          type: "u64";
        },
        {
          name: "amountY";
          type: "u64";
        },
      ];
    },
  ];
  accounts: [
    {
      name: "binArray";
      discriminator: [92, 142, 92, 220, 5, 148, 70, 181];
    },
    {
      name: "binArrayBitmapExtension";
      discriminator: [80, 111, 124, 113, 55, 237, 18, 5];
    },
    {
      name: "lbPair";
      discriminator: [33, 11, 49, 98, 181, 101, 177, 13];
    },
    {
      name: "position";
      discriminator: [170, 188, 143, 228, 122, 64, 247, 208];
    },
  ];
  events: [
    {
      name: "addLiquidity";
      discriminator: [31, 94, 125, 90, 227, 52, 61, 186];
    },
    {
      name: "feeParameterUpdate";
      discriminator: [48, 76, 241, 117, 144, 215, 242, 44];
    },
    {
      name: "lbPairCreate";
      discriminator: [185, 74, 252, 125, 27, 215, 188, 111];
    },
    {
      name: "positionCreate";
      discriminator: [144, 142, 252, 84, 157, 53, 37, 121];
    },
  ];
  errors: [
    {
      code: 6000;
      name: "invalidAdmin";
      msg: "Access denied: Signer is not an authorized admin";
    },
    {
      code: 6001;
      name: "identicalTokenMints";
      msg: "Token mints cannot be identical";
    },
    {
      code: 6002;
      name: "invalidTokenDecimals";
      msg: "Token decimals cannot exceed 18";
    },
    {
      code: 6003;
      name: "invalidBinStep";
      msg: "Bin step must be between 1 and 100 basis points (0.0001 to 0.01)";
    },
    {
      code: 6004;
      name: "invalidInput";
      msg: "BinArrayManager invalid input";
    },
    {
      code: 6005;
      name: "nonContinuousBinArrays";
      msg: "Arrays are not loaded aligned to lower bin id";
    },
    {
      code: 6006;
      name: "invalidActiveId";
      msg: "Active ID must be within valid range";
    },
    {
      code: 6007;
      name: "invalidBinPrice";
      msg: "Invalid bin price: must be greater than 0";
    },
    {
      code: 6008;
      name: "invalidBinRange";
      msg: "Invalid bin range";
    },
    {
      code: 6009;
      name: "invalidBinId";
      msg: "Bin ID is outside the valid range";
    },
    {
      code: 6010;
      name: "invalidStartBinIndex";
      msg: "Start bin index is outside the valid range";
    },
    {
      code: 6011;
      name: "binRangeTooLarge";
      msg: "Range must be within the limit";
    },
    {
      code: 6012;
      name: "noBinArraysProvided";
      msg: "No bin arrays provided in remaining accounts";
    },
    {
      code: 6013;
      name: "binArrayVerificationFailure";
      msg: "Bin arrays does not match expected";
    },
    {
      code: 6014;
      name: "binArrayNotWritable";
      msg: "Bin array account is not writable";
    },
    {
      code: 6015;
      name: "binArrayMismatch";
      msg: "Bin array does not belong to the specified lb_pair";
    },
    {
      code: 6016;
      name: "binIdOutsidePositionRange";
      msg: "Bin ID is outside position range";
    },
    {
      code: 6017;
      name: "binArrayNotFound";
      msg: "Cannot find bin array with liquidity";
    },
    {
      code: 6018;
      name: "bitmapExtensionAccountIsNotProvided";
      msg: "Bitmap extension account is not provided";
    },
    {
      code: 6019;
      name: "invalidTokenDistributionForBin";
      msg: "Invalid token distribution for bin relative to active bin";
    },
    {
      code: 6020;
      name: "invalidLbPair";
      msg: "Invalid liquidity book pair";
    },
    {
      code: 6021;
      name: "mathOverflow";
      msg: "Math operation overflow";
    },
    {
      code: 6022;
      name: "cannotFindNonZeroLiquidityBinArrayId";
      msg: "Cannot find non-zero liquidity binArrayId";
    },
    {
      code: 6023;
      name: "unexpectedSwapError";
      msg: "Unexpected swap error";
    },
    {
      code: 6024;
      name: "binArrayError";
      msg: "Unexpected bin_array error";
    },
    {
      code: 6025;
      name: "swapCalculationError";
      msg: "Swap calculation error";
    },
    {
      code: 6026;
      name: "invalidSwapParams";
      msg: "Invalid swap parameters";
    },
    {
      code: 6027;
      name: "pairInsufficientLiquidity";
      msg: "Pair has insufficient liquidity for the requested operation";
    },
    {
      code: 6028;
      name: "unauthorizedFeeOwner";
      msg: "Position owner must be sender";
    },
    {
      code: 6029;
      name: "noFeesToClaim";
      msg: "No fees to claim found";
    },
    {
      code: 6030;
      name: "invalidPositionWidth";
      msg: "Position width cant be more that  (MAX_POSITION_BINS - 1)";
    },
    {
      code: 6031;
      name: "binIdOutsidePairRange";
      msg: "Bin ID is outside pair valid range";
    },
    {
      code: 6032;
      name: "divisionByZero";
      msg: "Division by zero";
    },
    {
      code: 6033;
      name: "binError";
      msg: "Unexpected bin error";
    },
    {
      code: 6034;
      name: "insufficientLiquidity";
      msg: "Not enough liquidity to claim fees";
    },
    {
      code: 6035;
      name: "notEnoughProtocolFees";
      msg: "Not enough protocol fees for withdrawal";
    },
    {
      code: 6036;
      name: "typeCastFailed";
      msg: "Type cast error";
    },
    {
      code: 6037;
      name: "zeroAmount";
      msg: "Amount cannot be zero";
    },
    {
      code: 6038;
      name: "distributionTotalInvalid";
      msg: "Invalid total distribution: must be exactly 0 or 100";
    },
    {
      code: 6039;
      name: "emptyDistribution";
      msg: "No bin distributions provided";
    },
    {
      code: 6040;
      name: "tooManyBins";
      msg: "Too many bins provided. It must be less than or equal to MAX_BIN_PER_ARRAY";
    },
    {
      code: 6041;
      name: "excessiveFeeUpdate";
      msg: "Fee parameter update exceeds maximum allowed change (max 1% or 100% of current value)";
    },
  ];
  types: [
    {
      name: "addLiquidity";
      type: {
        kind: "struct";
        fields: [
          {
            name: "lbPair";
            type: "pubkey";
          },
          {
            name: "from";
            type: "pubkey";
          },
          {
            name: "position";
            type: "pubkey";
          },
          {
            name: "amounts";
            type: {
              array: ["u64", 2];
            };
          },
          {
            name: "activeBinId";
            type: "i32";
          },
        ];
      };
    },
    {
      name: "bin";
      docs: [
        "Individual bin data containing liquidity and reserve information.",
        "",
        "Each bin represents a discrete price point in the liquidity book where users can",
        "provide liquidity. Bins store token amounts and track liquidity shares for",
        "proportional withdrawal calculations.",
      ];
      serialization: "bytemuck";
      repr: {
        kind: "c";
      };
      type: {
        kind: "struct";
        fields: [
          {
            name: "amountX";
            docs: ["Amount of token X in the bin (excluding protocol fees)"];
            type: "u64";
          },
          {
            name: "amountY";
            docs: ["Amount of token Y in the bin (excluding protocol fees)"];
            type: "u64";
          },
          {
            name: "price";
            docs: ["Cached bin price to avoid recalculation during operations"];
            type: "u128";
          },
          {
            name: "liquiditySupply";
            docs: [
              "Total liquidity shares issued for this bin (equivalent to LP token supply)",
            ];
            type: "u128";
          },
          {
            name: "rewardPerTokenStored";
            docs: ["reward_a_per_token_stored"];
            type: {
              array: ["u128", 2];
            };
          },
          {
            name: "feeAmountXPerTokenStored";
            docs: ["Accumulated fee amount of token X per liquidity share"];
            type: "u128";
          },
          {
            name: "feeAmountYPerTokenStored";
            docs: ["Accumulated fee amount of token Y per liquidity share"];
            type: "u128";
          },
        ];
      };
    },
    {
      name: "binArray";
      docs: [
        "Array of bins covering a specific range of bin IDs.",
        "",
        "Each bin array contains up to MAX_BIN_PER_ARRAY bins and represents a contiguous",
        "range of bin IDs. Multiple bin arrays can be linked to cover the full price range",
        "of a liquidity pair. The array index determines which range of bin IDs it contains.",
      ];
      serialization: "bytemuck";
      repr: {
        kind: "c";
      };
      type: {
        kind: "struct";
        fields: [
          {
            name: "index";
            docs: [
              "Array index determining the bin ID range (bins: index*MAX_BIN_PER_ARRAY to index*MAX_BIN_PER_ARRAY+MAX_BIN_PER_ARRAY-1)",
            ];
            type: "i64";
          },
          {
            name: "padding";
            docs: ["Padding for proper memory alignment"];
            type: {
              array: ["u8", 8];
            };
          },
          {
            name: "lbPair";
            docs: ["Associated liquidity book pair that owns this bin array"];
            type: "pubkey";
          },
          {
            name: "bins";
            docs: ["Individual bin data stored inline for efficient access"];
            type: {
              array: [
                {
                  defined: {
                    name: "bin";
                  };
                },
                70,
              ];
            };
          },
        ];
      };
    },
    {
      name: "binArrayBitmapExtension";
      docs: [
        "Extended bitmap structure for tracking bin array initialization states.",
        "",
        "This structure provides extended bitmap tracking for bin arrays beyond the basic",
        "bitmap capacity of the LbPair account. It uses separate bitmaps for positive",
        "and negative bin array indices to efficiently track liquidity distribution",
        "across a wider price range.",
      ];
      serialization: "bytemuck";
      repr: {
        kind: "c";
      };
      type: {
        kind: "struct";
        fields: [
          {
            name: "lbPair";
            docs: [
              "Associated liquidity book pair that owns this bitmap extension",
            ];
            type: "pubkey";
          },
          {
            name: "positiveBinArrayBitmap";
            docs: [
              "Packed initialized bin array state for positive bin array indices",
            ];
            type: {
              array: [
                {
                  array: ["u64", 8];
                },
                12,
              ];
            };
          },
          {
            name: "negativeBinArrayBitmap";
            docs: [
              "Packed initialized bin array state for negative bin array indices",
            ];
            type: {
              array: [
                {
                  array: ["u64", 8];
                },
                12,
              ];
            };
          },
        ];
      };
    },
    {
      name: "binLiquidityDistribution";
      docs: [
        "Configuration for distributing liquidity to a specific bin in the DLMM.",
        "",
        "Each distribution specifies a target bin ID and the percentage of tokens",
        "to allocate to that bin. Percentages are expressed as integers from 1-100.",
      ];
      type: {
        kind: "struct";
        fields: [
          {
            name: "binId";
            docs: ["Define the bin ID wish to deposit to."];
            type: "i32";
          },
          {
            name: "distributionX";
            docs: [
              "DistributionX (or distributionY) is the percentages of amountX (or amountY) you want to add to each bin.",
            ];
            type: "u16";
          },
          {
            name: "distributionY";
            docs: [
              "DistributionX (or distributionY) is the percentages of amountX (or amountY) you want to add to each bin.",
            ];
            type: "u16";
          },
        ];
      };
    },
    {
      name: "feeInfo";
      docs: [
        "Tracks per-bin fee accumulation and pending claimable fees for a position.",
      ];
      serialization: "bytemuck";
      repr: {
        kind: "c";
      };
      type: {
        kind: "struct";
        fields: [
          {
            name: "feeXPerTokenComplete";
            type: "u128";
          },
          {
            name: "feeYPerTokenComplete";
            type: "u128";
          },
          {
            name: "feeXPending";
            type: "u64";
          },
          {
            name: "feeYPending";
            type: "u64";
          },
        ];
      };
    },
    {
      name: "feeParameter";
      type: {
        kind: "struct";
        fields: [
          {
            name: "protocolShare";
            docs: [
              "Portion of swap fees retained by the protocol by controlling protocol_share parameter. protocol_swap_fee = protocol_share * total_swap_fee",
            ];
            type: "u16";
          },
          {
            name: "baseFactor";
            docs: ["Base factor for base fee rate"];
            type: "u16";
          },
        ];
      };
    },
    {
      name: "feeParameterUpdate";
      type: {
        kind: "struct";
        fields: [
          {
            name: "lbPair";
            type: "pubkey";
          },
          {
            name: "protocolShare";
            type: "u16";
          },
          {
            name: "baseFactor";
            type: "u16";
          },
        ];
      };
    },
    {
      name: "lbPair";
      docs: [
        "Core DLMM trading pair account containing all pair state and configuration.",
        "",
        "This account stores the complete state of a liquidity book pair including token",
        "configuration, fee parameters, active price bins, and liquidity distribution.",
        "Uses zero-copy serialization for efficient on-chain access.",
      ];
      serialization: "bytemuck";
      repr: {
        kind: "c";
      };
      type: {
        kind: "struct";
        fields: [
          {
            name: "parameters";
            docs: ["Static fee configuration parameters"];
            type: {
              defined: {
                name: "staticParameters";
              };
            };
          },
          {
            name: "vParameters";
            docs: [
              "Variable fee parameters that adjust based on market volatility",
            ];
            type: {
              defined: {
                name: "variableParameters";
              };
            };
          },
          {
            name: "lastUpdatedAt";
            docs: ["Unix timestamp of the last trading interaction"];
            type: "i64";
          },
          {
            name: "activationSlot";
            docs: [
              "Slot to enable the pair. Only available for permission pair.",
            ];
            type: "u64";
          },
          {
            name: "swapCapDeactivateSlot";
            docs: ["Last slot until pool remove max_swapped_amount for buying"];
            type: "u64";
          },
          {
            name: "maxSwappedAmount";
            docs: [
              "Max X swapped amount user can swap from y to x between activation_slot and last_slot",
            ];
            type: "u64";
          },
          {
            name: "binArrayBitmap";
            docs: ["Bitmap tracking liquidity distribution across price bins"];
            type: {
              array: ["u64", 16];
            };
          },
          {
            name: "protocolFee";
            docs: ["Accumulated protocol fees for both tokens"];
            type: {
              defined: {
                name: "protocolFee";
              };
            };
          },
          {
            name: "tokenXMint";
            docs: ["Base token mint address"];
            type: "pubkey";
          },
          {
            name: "tokenYMint";
            docs: ["Quote token mint address"];
            type: "pubkey";
          },
          {
            name: "reserveX";
            docs: ["Token X reserve vault account"];
            type: "pubkey";
          },
          {
            name: "reserveY";
            docs: ["Token Y reserve vault account"];
            type: "pubkey";
          },
          {
            name: "feeOwner";
            docs: ["Account authorized to collect protocol fees"];
            type: "pubkey";
          },
          {
            name: "baseKey";
            docs: ["Base keypair. Only required for permission pair"];
            type: "pubkey";
          },
          {
            name: "whitelistedWallet";
            docs: ["Whitelisted wallet"];
            type: {
              array: ["pubkey", 2];
            };
          },
          {
            name: "activeId";
            docs: [
              "Current active bin ID where trading activity is concentrated",
            ];
            type: "i32";
          },
          {
            name: "binStep";
            docs: ["Price step between adjacent bins in basis points"];
            type: "u16";
          },
          {
            name: "pairType";
            docs: ["Type of the pair (0 = Permissionless, 1 = Permission)"];
            type: "u8";
          },
          {
            name: "status";
            docs: [
              "Current operational status of the pair (0 = Enabled, 1 = Disabled)",
            ];
            type: "u8";
          },
          {
            name: "bumpSeed";
            docs: ["PDA bump seed for account derivation"];
            type: {
              array: ["u8", 1];
            };
          },
          {
            name: "binStepSeed";
            docs: ["Bin step encoded as bytes for PDA derivation"];
            type: {
              array: ["u8", 2];
            };
          },
          {
            name: "padding";
            docs: ["Memory alignment padding"];
            type: {
              array: ["u8", 5];
            };
          },
          {
            name: "reserved";
            docs: ["Reserved space for future protocol upgrades"];
            type: {
              array: ["u8", 64];
            };
          },
        ];
      };
    },
    {
      name: "lbPairCreate";
      type: {
        kind: "struct";
        fields: [
          {
            name: "lbPair";
            type: "pubkey";
          },
          {
            name: "binStep";
            type: "u16";
          },
          {
            name: "tokenX";
            type: "pubkey";
          },
          {
            name: "tokenY";
            type: "pubkey";
          },
        ];
      };
    },
    {
      name: "liquidityParameter";
      docs: [
        "Parameters for adding liquidity to a DLMM liquidity book pair.",
        "",
        "Specifies the total token amounts and how they should be distributed",
        "across multiple price bins according to DLMM rules.",
      ];
      type: {
        kind: "struct";
        fields: [
          {
            name: "amountX";
            docs: ["Amount of X token to deposit"];
            type: "u64";
          },
          {
            name: "amountY";
            docs: ["Amount of Y token to deposit"];
            type: "u64";
          },
          {
            name: "binLiquidityDist";
            docs: ["Liquidity distribution to each bins"];
            type: {
              vec: {
                defined: {
                  name: "binLiquidityDistribution";
                };
              };
            };
          },
        ];
      };
    },
    {
      name: "position";
      docs: [
        "User position account tracking liquidity shares across multiple bins.",
        "",
        "Each user can have one position per liquidity pair, which tracks their",
        "liquidity shares across all bins where they have deposited tokens.",
        "Uses zero-copy serialization for efficient on-chain access.",
      ];
      serialization: "bytemuck";
      repr: {
        kind: "c";
      };
      type: {
        kind: "struct";
        fields: [
          {
            name: "lbPair";
            docs: ["The LB pair of this position"];
            type: "pubkey";
          },
          {
            name: "owner";
            docs: [
              "Owner of the position. Client rely on this to to fetch their positions.",
            ];
            type: "pubkey";
          },
          {
            name: "liquidityShares";
            docs: [
              "Liquidity shares of this position in bins (lower_bin_id <-> upper_bin_id). This is the same as LP concept.",
            ];
            type: {
              array: ["u128", 70];
            };
          },
          {
            name: "rewardInfos";
            docs: ["Farming reward information"];
            type: {
              array: [
                {
                  defined: {
                    name: "userRewardInfo";
                  };
                },
                70,
              ];
            };
          },
          {
            name: "lowerBinId";
            docs: ["Lowest bin ID with liquidity in this position"];
            type: "i32";
          },
          {
            name: "upperBinId";
            docs: ["Highest bin ID with liquidity in this position"];
            type: "i32";
          },
          {
            name: "lastUpdatedAt";
            docs: ["Unix timestamp of last position modification"];
            type: "i64";
          },
          {
            name: "feeInfos";
            docs: ["Information about claimed and unclaimed fees"];
            type: {
              array: [
                {
                  defined: {
                    name: "feeInfo";
                  };
                },
                70,
              ];
            };
          },
          {
            name: "totalClaimedFeeXAmount";
            docs: ["Account authorized to claim fees from this position"];
            type: "u64";
          },
          {
            name: "totalClaimedFeeYAmount";
            docs: ["Total unclaimed fees earned in token Y"];
            type: "u64";
          },
          {
            name: "reserved";
            docs: ["Reserved space for future use"];
            type: {
              array: ["u8", 128];
            };
          },
        ];
      };
    },
    {
      name: "positionCreate";
      type: {
        kind: "struct";
        fields: [
          {
            name: "lbPair";
            type: "pubkey";
          },
          {
            name: "position";
            type: "pubkey";
          },
          {
            name: "owner";
            type: "pubkey";
          },
        ];
      };
    },
    {
      name: "protocolFee";
      docs: [
        "Protocol fee accumulator storing fees collected from swaps.",
        "",
        "Fees are tracked separately for each token to maintain accurate accounting",
        "and enable independent fee collection for X and Y tokens.",
      ];
      serialization: "bytemuck";
      repr: {
        kind: "c";
      };
      type: {
        kind: "struct";
        fields: [
          {
            name: "amountX";
            docs: ["Accumulated protocol fees for token X"];
            type: "u64";
          },
          {
            name: "amountY";
            docs: ["Accumulated protocol fees for token Y"];
            type: "u64";
          },
        ];
      };
    },
    {
      name: "staticParameters";
      docs: [
        "Static fee configuration parameters set by the protocol.",
        "",
        "These parameters remain constant during normal pair operation and control",
        "the base fee structure and operational limits for the liquidity book pair.",
      ];
      serialization: "bytemuck";
      repr: {
        kind: "c";
      };
      type: {
        kind: "struct";
        fields: [
          {
            name: "baseFactor";
            docs: ["Base factor for fee calculation formula"];
            type: "u16";
          },
          {
            name: "filterPeriod";
            docs: [
              "Filter period for high frequency trading detection in seconds",
            ];
            type: "u16";
          },
          {
            name: "decayPeriod";
            docs: ["Decay period for volatile fee reduction in seconds"];
            type: "u16";
          },
          {
            name: "reductionFactor";
            docs: ["Reduction factor controlling volatile fee decrement rate"];
            type: "u16";
          },
          {
            name: "variableFeeControl";
            docs: ["Variable fee scaling factor based on market dynamics"];
            type: "u32";
          },
          {
            name: "maxVolatilityAccumulator";
            docs: ["Maximum volatility accumulator to cap volatile fees"];
            type: "u32";
          },
          {
            name: "minBinId";
            docs: ["Minimum supported bin ID for this pair"];
            type: "i32";
          },
          {
            name: "maxBinId";
            docs: ["Maximum supported bin ID for this pair"];
            type: "i32";
          },
          {
            name: "protocolShare";
            docs: ["Protocol fee share in basis points"];
            type: "u16";
          },
          {
            name: "padding";
            docs: ["Memory alignment padding"];
            type: {
              array: ["u8", 6];
            };
          },
        ];
      };
    },
    {
      name: "userRewardInfo";
      docs: [
        "Tracks per-bin farming reward accumulation and pending rewards for all supported reward tokens.",
      ];
      serialization: "bytemuck";
      repr: {
        kind: "c";
      };
      type: {
        kind: "struct";
        fields: [
          {
            name: "rewardPerTokenCompletes";
            type: {
              array: ["u128", 2];
            };
          },
          {
            name: "rewardPendings";
            type: {
              array: ["u64", 2];
            };
          },
        ];
      };
    },
    {
      name: "variableParameters";
      docs: [
        "Variable fee parameters that adjust based on market dynamics.",
        "",
        "These parameters are updated during trading operations to reflect market",
        "volatility and recent trading activity patterns.",
      ];
      serialization: "bytemuck";
      repr: {
        kind: "c";
      };
      type: {
        kind: "struct";
        fields: [
          {
            name: "volatilityAccumulator";
            docs: ["Current volatility accumulator measuring bin crossings"];
            type: "u32";
          },
          {
            name: "volatilityReference";
            docs: ["Decayed volatility reference for fee calculation"];
            type: "u32";
          },
          {
            name: "indexReference";
            docs: ["Reference bin ID from the last swap operation"];
            type: "i32";
          },
          {
            name: "padding";
            docs: ["Memory alignment padding"];
            type: {
              array: ["u8", 4];
            };
          },
          {
            name: "lastUpdateTimestamp";
            docs: ["Timestamp of last parameter update"];
            type: "i64";
          },
          {
            name: "padding1";
            docs: ["Memory alignment padding"];
            type: {
              array: ["u8", 8];
            };
          },
        ];
      };
    },
  ];
  constants: [
    {
      name: "basisPointMax";
      docs: ["Smallest step between bin is 0.01%, 1 bps"];
      type: "i32";
      value: "10000";
    },
    {
      name: "binArray";
      docs: ["Seed constant for bin array PDA derivation"];
      type: "bytes";
      value: "[98, 105, 110, 95, 97, 114, 114, 97, 121]";
    },
    {
      name: "binArrayBitmapSeed";
      docs: ["Seed constant for bin array bitmap extension PDA derivation"];
      type: "bytes";
      value: "[98, 105, 116, 109, 97, 112]";
    },
    {
      name: "binArrayBitmapSize";
      docs: [
        "Number of bin arrays that can be tracked in a single bitmap slot",
      ];
      type: "i32";
      value: "512";
    },
    {
      name: "feePrecision";
      type: "u64";
      value: "1000000000";
    },
    {
      name: "maxBaseFactorStep";
      docs: ["Maximum allowed change in base factor per update (100 bps = 1%)"];
      type: "u16";
      value: "100";
    },
    {
      name: "maxBinId";
      docs: ["Maximum bin ID supported. Computed based on 1 bps."];
      type: "i32";
      value: "443636";
    },
    {
      name: "maxFeeRate";
      docs: ["Maximum fee rate. 10%"];
      type: "u64";
      value: "100000000";
    },
    {
      name: "maxProtocolShare";
      docs: ["Maximum protocol share of the fee. 25%"];
      type: "u16";
      value: "2500";
    },
    {
      name: "minBinId";
      docs: ["Minimum bin ID supported. Computed based on 1 bps."];
      type: "i32";
      value: "-443636";
    },
    {
      name: "minFeeUpdateWindow";
      docs: [
        "Minimum time window in seconds between fee parameter updates (0 = no restriction)",
      ];
      type: "i64";
      value: "0";
    },
    {
      name: "positionSeed";
      type: "bytes";
      value: "[112, 111, 115, 105, 116, 105, 111, 110]";
    },
    {
      name: "seed";
      docs: ["Seed constant for liquidity book pair PDA derivation"];
      type: "string";
      value: '"anchor"';
    },
  ];
};
