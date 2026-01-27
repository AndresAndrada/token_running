import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { ListContract } from "../target/types/list_contract";
import { Connection, PublicKey, Keypair } from "@solana/web3.js";
import fs from "fs";
import os from "os";
import path from "path";

async function main() {
  // LEE LA WALLET MANUALMENTE
  const walletPath = path.join(os.homedir(), ".config", "solana", "id.json");
  if (!fs.existsSync(walletPath)) {
    console.error("Wallet no encontrada en:", walletPath);
    console.error("Ejecuta: solana-keygen new -o ~/.config/solana/id.json");
    return;
  }

  const secretKey = Uint8Array.from(JSON.parse(fs.readFileSync(walletPath, "utf8")));
  const wallet = Keypair.fromSecretKey(secretKey);

  // CONEXIÓN MANUAL
  const connection = new Connection("http://127.0.0.1:8899", "confirmed");
  anchor.setProvider(new anchor.AnchorProvider(connection, new anchor.Wallet(wallet), {}));

  const program = anchor.workspace.ListContract as Program<ListContract>;

  const [statePda] = PublicKey.findProgramAddressSync(
    [Buffer.from("state")],
    program.programId
  );

  try {
    // Cast accounts where used in RPCs to `any` when calling program methods to avoid
    // strict ResolvedAccounts typing errors under ts-node / ts-mocha.
    const state = await program.account.state.fetch(statePda as any);
    console.log("AUTHORITY (ADMIN):", state.admin.toBase58());
    console.log("STATE PDA:", statePda.toBase58());
    console.log("TU WALLET:", wallet.publicKey.toBase58());
  } catch (error) {
    console.error("Estado no inicializado. Ejecuta 'anchor run initialize' primero.");
    console.log("PDA:", statePda.toBase58());
  }
}

main().catch(console.error);