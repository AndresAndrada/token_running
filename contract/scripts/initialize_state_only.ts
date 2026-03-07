import * as anchor from "@coral-xyz/anchor";
import { PublicKey, Keypair } from "@solana/web3.js";
import * as fs from 'fs';
import * as path from 'path';

// --- CONFIGURATION ---
const RPC_URL = 'https://api.devnet.solana.com';
const PROGRAM_ID = new PublicKey('EqU2UP3TX9PXs5uAgU5LdKg361huEXjpWW59AvDD9wz6');
const IDL = require('../../../listi-app/lib/solana/idl/contract.json'); // Use frontend IDL which has discriminators

// Keypair Paths
const KEYPAIR_PATHS = [
  path.join(__dirname, '../../keypairs/mint-authority.json'),
  path.join(__dirname, '../test-wallet.json'), // Fallback
];

function loadWallet(): Keypair {
  for (const p of KEYPAIR_PATHS) {
    if (fs.existsSync(p)) {
      console.log(`🔑 Loading wallet from: ${p}`);
      const fileContent = fs.readFileSync(p, 'utf-8');
      const secretKey = new Uint8Array(JSON.parse(fileContent));
      return Keypair.fromSecretKey(secretKey);
    }
  }
  throw new Error("No wallet found");
}

async function main() {
  console.log("🚀 Initializing Contract State Only...");

  const connection = new anchor.web3.Connection(RPC_URL, "confirmed");
  const walletKeypair = loadWallet();
  const wallet = new anchor.Wallet(walletKeypair);
  
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);

  if (!IDL.address) {
    IDL.address = PROGRAM_ID.toBase58();
  }
  if (!IDL.metadata) {
      IDL.metadata = { address: PROGRAM_ID.toBase58() };
  }
  const program = new anchor.Program(IDL, provider) as any;

  // 1. Derive State PDA
  const [statePda] = PublicKey.findProgramAddressSync(
    [Buffer.from("state")],
    program.programId
  );
  console.log("📍 State PDA:", statePda.toBase58());

  // Derive Escrow PDA
  const [escrowPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("escrow")],
    program.programId
  );
  console.log("📍 Escrow PDA:", escrowPda.toBase58());

  // Mint Address from Constants or Hardcoded
  const MINT_ADDRESS = new PublicKey('Fe2XHjzSKo9qTZmhj4hUpHCaqh4i4t73YUa2T81X2UfB');

  // 2. Initialize
  try {
    // PATCH: The deployed contract likely matches lib.rs (takes decimals, 3 accounts), 
     // but the IDL says no args and 7 accounts. We patch the IDL in memory to match lib.rs.
     const initializeInstruction = IDL.instructions.find((ix: any) => ix.name === "initialize");
     if (initializeInstruction) {
       initializeInstruction.args = [{ name: "decimals", type: "u8" }];
       initializeInstruction.accounts = [
         { name: "state", writable: true, signer: false },
         { name: "admin", writable: true, signer: true },
         { name: "system_program", writable: false, signer: false }
       ];
     }
 
     // Re-create program with patched IDL
      const program = new anchor.Program(IDL, provider) as any;
  
      const tx = await program.methods
        .initialize(9) // 9 decimals
        .accounts({
          state: statePda,
          admin: wallet.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
      
      console.log("✅ State initialized! Transaction:", tx);
    } catch (e: any) {
        if (e.logs && e.logs.some((log: string) => log.includes("already in use"))) {
            console.log("⚠️ State already initialized (Account already in use). Skipping initialization.");
        } else {
            console.log("⚠️ Initialization failed:", e.message);
            if (e.logs) console.log(e.logs);
        }
    }

    // PATCH: Patch Account definition to match lib.rs State struct
     // pub struct State { pub admin: Pubkey, pub price_usd_cents: f64, pub use_oracle: bool, pub oracle_feed: Pubkey, pub decimals: u8, pub sol_price_manual: f64 }
     // Note: In this IDL format, struct definitions are in `types`, not `accounts`.
     const stateType = IDL.types.find((type: any) => type.name === "State");
     if (stateType) {
         stateType.type.fields = [
              { name: "admin", type: "pubkey" },
              { name: "priceUsdCents", type: "f64" },
              { name: "useOracle", type: "bool" },
              { name: "oracleFeed", type: "pubkey" },
              { name: "decimals", type: "u8" },
              { name: "solPriceManual", type: "f64" }
          ];
      } else {
         // Fallback if IDL structure is different (e.g. older Anchor)
         const stateAccount = IDL.accounts.find((acc: any) => acc.name === "State");
         if (stateAccount && stateAccount.type) {
             stateAccount.type.fields = [
                 { name: "admin", type: "pubkey" },
                 { name: "priceUsdCents", type: "f64" },
                 { name: "useOracle", type: "bool" },
                 { name: "oracleFeed", type: "pubkey" },
                 { name: "decimals", type: "u8" },
                 { name: "solPriceManual", type: "f64" }
             ];
         }
      }
     // Re-create program again for fetching
     const programForFetch = new anchor.Program(IDL, provider) as any;

  // 3. Verify State
  try {
    const stateAccount: any = await programForFetch.account.state.fetch(statePda);
    console.log("📊 Current State:", {
      admin: stateAccount.admin.toBase58(),
      price_usd_cents: stateAccount.priceUsdCents,
      use_oracle: stateAccount.useOracle,
      oracle_feed: stateAccount.oracleFeed.toBase58(),
      decimals: stateAccount.decimals,
      sol_price_manual: stateAccount.solPriceManual
    });
  } catch (e: any) {
    console.log("❌ Could not fetch state account:", e.message);
  }
}

main().catch(console.error);
