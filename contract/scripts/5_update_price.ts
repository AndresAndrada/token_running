import * as anchor from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import fs from "fs";
const RPC_URL = "https://api.devnet.solana.com";
const PROGRAM_ID = new PublicKey("D6J4e2nQDFupaitnirnp7HerHw5zdpGwNyRvJUrVu7ji");
const ADMIN_WALLET_PATH = "./deploy-wallet.json";
const NEW_PRICE_CENTS = 0.75;
const IDL = require("../target/idl/list_contract.json");
async function main() {
  const connection = new Connection(RPC_URL, "confirmed");
  const adminKeypair = Keypair.fromSecretKey(new Uint8Array(JSON.parse(fs.readFileSync(ADMIN_WALLET_PATH, "utf-8"))));
  const wallet = new anchor.Wallet(adminKeypair);
  const provider = new anchor.AnchorProvider(connection, wallet, { commitment: "confirmed" });
  anchor.setProvider(provider);
  if (!IDL.address) IDL.address = PROGRAM_ID.toBase58();
  if (!IDL.metadata) IDL.metadata = { address: PROGRAM_ID.toBase58() };
  const program = new anchor.Program(IDL as any, provider);
  const [statePda] = PublicKey.findProgramAddressSync([Buffer.from("state")], PROGRAM_ID);
  const tx = await program.methods
    .updatePrice(NEW_PRICE_CENTS)
    .accounts({
      state: statePda,
      admin: adminKeypair.publicKey
    })
    .signers([adminKeypair])
    .rpc();
  console.log("✅ Precio actualizado a", NEW_PRICE_CENTS, "centavos USD");
  console.log("🔗 Tx:", `https://explorer.solana.com/tx/${tx}?cluster=devnet`);
}
main().catch(console.error);
