import * as anchor from "@coral-xyz/anchor";
import { BN } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync, TOKEN_2022_PROGRAM_ID, createAssociatedTokenAccountInstruction, ASSOCIATED_TOKEN_PROGRAM_ID } from "@solana/spl-token";
import fs from "fs";

// --- CONFIGURATION ---
// IMPORTANT: Make sure this is your Mainnet token mint
const MINT_ADDRESS = new PublicKey(process.env.NEXT_PUBLIC_TOKEN_MINT || "3f6cL1rZV1vG7Ffkaes3361diBkFN38bT7mPbu4wGKGz");
const PROGRAM_ID = new PublicKey(process.env.NEXT_PUBLIC_PROGRAM_ID || "D6J4e2nQDFupaitnirnp7HerHw5zdpGwNyRvJUrVu7ji");
const RPC_URL = process.env.ANCHOR_PROVIDER_URL || "https://solana-mainnet.g.alchemy.com/v2/olUaug5e7HLKLIeYPBlUH";
const DECIMALS = 9;
const AMOUNT_TO_MINT = 1; // Number of tokens to mint (1 token)

// Path to your admin wallet (deploy-wallet.json)
const WALLET_PATH = "./deploy-wallet.json";

// Import IDL
const IDL = require("../target/idl/list_contract.json");

function loadWallet(): Keypair {
  if (!fs.existsSync(WALLET_PATH)) {
    throw new Error(`Wallet not found at ${WALLET_PATH}`);
  }
  const fileContent = fs.readFileSync(WALLET_PATH, "utf-8");
  const secretKey = new Uint8Array(JSON.parse(fileContent));
  return Keypair.fromSecretKey(secretKey);
}

async function main() {
  console.log("🚀 Starting mint_to_admin script...");
  console.log(`🎯 Target Mint: ${MINT_ADDRESS.toBase58()}`);
  console.log(`🪙 Amount to mint: ${AMOUNT_TO_MINT} $LIST`);

  // 1. Setup Provider
  const connection = new Connection(RPC_URL, "confirmed");
  const walletKeypair = loadWallet();
  const wallet = new anchor.Wallet(walletKeypair);
  
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);

  console.log("🔑 Using Admin Wallet:", wallet.publicKey.toBase58());

  // 2. Setup Program
  const program = new anchor.Program(IDL as anchor.Idl, provider);

  // 3. Derive PDAs
  const [statePda] = PublicKey.findProgramAddressSync(
    [Buffer.from("state")],
    program.programId
  );
  
  const [mintAuthPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("mint_auth")],
    program.programId
  );

  // 4. Calculate Admin's Associated Token Account (ATA)
  const recipientAta = getAssociatedTokenAddressSync(
    MINT_ADDRESS,
    wallet.publicKey, // Admin is the recipient
    false,
    TOKEN_2022_PROGRAM_ID
  );

  console.log("📍 State PDA:", statePda.toBase58());
  console.log("📍 Mint Auth PDA:", mintAuthPda.toBase58());
  console.log("📍 Recipient ATA:", recipientAta.toBase58());

  const ataInfo = await provider.connection.getAccountInfo(recipientAta);
  if (!ataInfo) {
    const ix = createAssociatedTokenAccountInstruction(
      wallet.publicKey,
      recipientAta,
      wallet.publicKey,
      MINT_ADDRESS,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );
    await anchor.web3.sendAndConfirmTransaction(
      provider.connection,
      new anchor.web3.Transaction().add(ix),
      [walletKeypair]
    );
  }

  // 5. Execute mintToAdmin
  const amountToMintRaw = new BN(AMOUNT_TO_MINT * (10 ** DECIMALS));

  console.log("\n⏳ Sending transaction to network...");
  
  try {
    const txSig = await program.methods
      .mintToAdmin(amountToMintRaw)
      .accounts({
        state: statePda,
        admin: wallet.publicKey,
        mint: MINT_ADDRESS,
        recipient: recipientAta,
        mintAuthority: mintAuthPda,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      } as any)
      .rpc();

    console.log("\n========================================");
    console.log(`✅ SUCCESS! Minted ${AMOUNT_TO_MINT} $LIST to Admin`);
    console.log(`🔗 Transaction Signature: ${txSig}`);
    console.log(`🔍 View on Explorer: https://explorer.solana.com/tx/${txSig}`);
    const start = Date.now();
    while (Date.now() - start < 60000) {
      const s = await provider.connection.getSignatureStatuses([txSig]);
      const st = s.value[0];
      if (st && (st.confirmationStatus === "confirmed" || st.confirmationStatus === "finalized")) {
        const mintInfo = await (await import("@solana/spl-token")).getMint(provider.connection, MINT_ADDRESS, undefined, TOKEN_2022_PROGRAM_ID);
        const supply = Number(mintInfo.supply) / 10 ** DECIMALS;
        const accInfo = await (await import("@solana/spl-token")).getAccount(provider.connection, recipientAta, undefined, TOKEN_2022_PROGRAM_ID);
        const bal = Number(accInfo.amount) / 10 ** DECIMALS;
        console.log(`📦 Supply: ${supply}`);
        console.log(`👤 Admin Balance: ${bal}`);
        break;
      }
      await new Promise(r => setTimeout(r, 1500));
    }
    console.log("========================================\n");

  } catch (error) {
    console.error("\n❌ ERROR executing mint_to_admin:");
    console.error(error);
    // Fallback: poll signature if available
    const sig = (error as any)?.signature;
    if (sig) {
      console.log(`⏳ Polling for signature: ${sig}`);
      const start = Date.now();
      while (Date.now() - start < 60000) {
        const s = await provider.connection.getSignatureStatuses([sig]);
        const st = s.value[0];
        if (st && (st.confirmationStatus === "confirmed" || st.confirmationStatus === "finalized")) {
          const mintInfo = await (await import("@solana/spl-token")).getMint(provider.connection, MINT_ADDRESS, undefined, TOKEN_2022_PROGRAM_ID);
          const supply = Number(mintInfo.supply) / 10 ** DECIMALS;
          const accInfo = await (await import("@solana/spl-token")).getAccount(provider.connection, recipientAta, undefined, TOKEN_2022_PROGRAM_ID);
          const bal = Number(accInfo.amount) / 10 ** DECIMALS;
          console.log("========================================");
          console.log(`✅ SUCCESS! Minted ${AMOUNT_TO_MINT} $LIST to Admin`);
          console.log(`🔗 Transaction Signature: ${sig}`);
          console.log(`📦 Supply: ${supply}`);
          console.log(`👤 Admin Balance: ${bal}`);
          console.log("========================================\n");
          break;
        }
        await new Promise(r => setTimeout(r, 1500));
      }
    }
  }
}

main().catch(console.error);
