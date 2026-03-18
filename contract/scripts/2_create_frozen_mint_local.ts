import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import {
  ExtensionType,
  createInitializeMintInstruction,
  getMintLen,
  TYPE_SIZE,
  LENGTH_SIZE,
  TOKEN_2022_PROGRAM_ID,
  createInitializeMetadataPointerInstruction,
  createInitializeDefaultAccountStateInstruction,
  AccountState,
  createSetAuthorityInstruction,
  AuthorityType,
} from '@solana/spl-token';
import {
  createInitializeInstruction,
  pack,
  TokenMetadata,
} from '@solana/spl-token-metadata';
import * as fs from 'fs';
import * as path from 'path';

// --- CONFIGURATION ---
const RPC_URL = process.env.ANCHOR_PROVIDER_URL || 'https://api.mainnet-beta.solana.com';
const PROGRAM_ID = new PublicKey('D6J4e2nQDFupaitnirnp7HerHw5zdpGwNyRvJUrVu7ji');

// Keypair Paths
const KEYPAIR_PATHS = [
  path.join(__dirname, '../deploy-wallet.json'),
  // path.join(__dirname, '../phantom-admin.json'),
];

function loadWallet(): Keypair {
  for (const p of KEYPAIR_PATHS) {
    if (fs.existsSync(p)) {
      console.log(`🔑 Loading wallet from: ${p}`);
      try {
        const fileContent = fs.readFileSync(p, 'utf-8');
        const secretKey = new Uint8Array(JSON.parse(fileContent));
        return Keypair.fromSecretKey(secretKey);
      } catch (e) {
        console.error(`❌ Failed to parse wallet ${p}:`, e);
      }
    }
  }
  throw new Error(
    `❌ No valid wallet found! Please ensure one of these exists:\n${KEYPAIR_PATHS.join(
      '\n'
    )}`
  );
}

// --- HELPERS ---

function getMetadataLen(metadata: any) {
  const meta: TokenMetadata = {
    updateAuthority: metadata.updateAuthority,
    mint: metadata.mint,
    name: metadata.name,
    symbol: metadata.symbol,
    uri: metadata.uri,
    additionalMetadata: metadata.additionalMetadata.map((m: any) => [m.key, m.value]),
  };
  return pack(meta).length;
}

// --- MAIN ---

async function main() {
  console.log('🚀 Starting Frozen Token Mint Creation (No Hook)...');

  // 1. Setup
  const connection = new Connection(RPC_URL, 'confirmed');
  const wallet = loadWallet();
  console.log('Wallet:', wallet.publicKey.toBase58());
  console.log('Program ID (Contract):', PROGRAM_ID.toBase58());

  // 2. Derive Mint Authority PDA (Contract Freeze Authority)
  const [mintAuthPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from('mint_auth')],
    PROGRAM_ID
  );
  console.log('❄️ Contract PDA (Future Authority):', mintAuthPDA.toBase58());

  // 3. Generate Mint Keypair
  const mintKeypair = Keypair.generate();
  const mint = mintKeypair.publicKey;
  console.log('🆕 New Mint Address:', mint.toBase58());

  // 4. Metadata Config
  // TODO: Update URI with your own JSON (hosted on Arweave/IPFS/S3) containing image/description
  const metaData = {
    updateAuthority: wallet.publicKey,
    mint: mint,
    name: 'LIST',
    symbol: 'LIST',
    uri: 'https://blush-urgent-halibut-281.mypinata.cloud/ipfs/bafkreiaqu55podf6vayu5svrg6aptuers4b5gxbhtn4afbjleiyxw6rsje',
    additionalMetadata: [],
  };

  // 5. Calculate Space & Rent
  // We use DefaultAccountState (Frozen) and MetadataPointer
  const fixedExtensions = [
    ExtensionType.MetadataPointer, 
    ExtensionType.DefaultAccountState // Frozen by default
  ];
  const mintSpace = getMintLen(fixedExtensions);
  
  const metadataSpace = TYPE_SIZE + LENGTH_SIZE + getMetadataLen(metaData);
  const totalLen = mintSpace + metadataSpace;

  const mintLamports = await connection.getMinimumBalanceForRentExemption(mintSpace);
  const totalLamports = await connection.getMinimumBalanceForRentExemption(totalLen);
  const extraLamports = totalLamports - mintLamports;

  console.log(
    `📊 Space: Mint=${mintSpace}, Meta=${metadataSpace}, Total=${totalLen}`
  );
  console.log(`💰 Rent: Mint=${mintLamports/1e9} SOL, Extra=${extraLamports/1e9} SOL`);

  // 6. Build Transaction
  const transaction = new Transaction();

  // 6.1 Create Account
  transaction.add(
    SystemProgram.createAccount({
      fromPubkey: wallet.publicKey,
      newAccountPubkey: mint,
      space: mintSpace,
      lamports: mintLamports,
      programId: TOKEN_2022_PROGRAM_ID,
    })
  );

  // 6.2 Init Default Account State (Frozen)
  transaction.add(
    createInitializeDefaultAccountStateInstruction(
      mint,
      AccountState.Frozen, // ALL new accounts will be frozen
      TOKEN_2022_PROGRAM_ID
    )
  );

  // 6.3 Init Metadata Pointer
  transaction.add(
    createInitializeMetadataPointerInstruction(
      mint,
      wallet.publicKey,
      mint, // Metadata Address = Mint Address
      TOKEN_2022_PROGRAM_ID
    )
  );

  // 6.4 Init Mint
  transaction.add(
    createInitializeMintInstruction(
      mint,
      9, // Decimals
      wallet.publicKey, // mint authority (temp)
      mintAuthPDA,      // freeze authority (contract) - CRITICAL
      TOKEN_2022_PROGRAM_ID
    )
  );

  // 6.5 Transfer Extra Rent (Funding for Metadata Realloc)
  transaction.add(
    SystemProgram.transfer({
      fromPubkey: wallet.publicKey,
      toPubkey: mint,
      lamports: extraLamports,
    })
  );

  // 6.6 Init Metadata
  transaction.add(
    createInitializeInstruction({
      programId: TOKEN_2022_PROGRAM_ID,
      metadata: mint,
      updateAuthority: wallet.publicKey,
      mint: mint,
      mintAuthority: wallet.publicKey,
      name: metaData.name,
      symbol: metaData.symbol,
      uri: metaData.uri,
    })
  );

  // 6.7 Transfer Mint Authority to Contract PDA
  transaction.add(
    createSetAuthorityInstruction(
      mint,
      wallet.publicKey,
      AuthorityType.MintTokens,
      mintAuthPDA,
      [],
      TOKEN_2022_PROGRAM_ID
    )
  );

  console.log('📝 Sending transaction...');
  try {
    const txHash = await sendAndConfirmTransaction(
      connection,
      transaction,
      [wallet, mintKeypair],
      {
        skipPreflight: true,
        commitment: 'confirmed',
      }
    );
    console.log(`\n🎉 DONE! New Frozen Token (No Hook) created.`);
    console.log(`👉 Token Mint Address: ${mint.toBase58()}`);
    console.log(`🔗 Transaction: https://explorer.solana.com/tx/${txHash}?cluster=devnet`);
    console.log(
      `⚠️ ACTION REQUIRED: Update 'TOKEN_MINT' in your app's constants.ts file.`
    );
  } catch (error: any) {
    console.error('❌ Error sending transaction:', error);
    if (error.logs) {
      console.error('📜 Logs:', error.logs);
    }
  }
}

main().catch((err) => {
  console.error(err);
});
