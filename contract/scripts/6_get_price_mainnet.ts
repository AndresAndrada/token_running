import * as anchor from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import fs from "fs";

const RPC_URL =
  process.env.SOLANA_RPC_URL ||
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
  "https://api.mainnet-beta.solana.com";
const PROGRAM_ID = new PublicKey(process.env.NEXT_PUBLIC_PROGRAM_ID || "D6J4e2nQDFupaitnirnp7HerHw5zdpGwNyRvJUrVu7ji");
const ADMIN_WALLET_PATH = "./deploy-wallet.json";
const IDL = require("../target/idl/list_contract.json");

async function main() {
  const connection = new Connection(RPC_URL, "confirmed");
  const adminKeypair = Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync(ADMIN_WALLET_PATH, "utf-8")))
  );
  const wallet = new anchor.Wallet(adminKeypair);
  const provider = new anchor.AnchorProvider(connection, wallet, { commitment: "confirmed" });
  anchor.setProvider(provider);

  if (!IDL.address) IDL.address = PROGRAM_ID.toBase58();
  if (!IDL.metadata) IDL.metadata = { address: PROGRAM_ID.toBase58() };
  const program = new anchor.Program(IDL as any, provider);

  const [statePda] = PublicKey.findProgramAddressSync([Buffer.from("state")], program.programId);
  const state: any = await (program.account as any).state.fetch(statePda);

  const tokenUsd = Number(state.priceUsdCents) / 100.0;
  const useOracle = Boolean(state.useOracle);
  const oracleFeed = (state.oracleFeed as PublicKey).toBase58();
  const manualSolUsd = Number(state.solPriceManual);
  const overrideSolUsd = process.env.OVERRIDE_SOL_USD ? Number(process.env.OVERRIDE_SOL_USD) : undefined;

  console.log("📍 State PDA:", statePda.toBase58());
  console.log("🪙 Token price (USD):", tokenUsd.toFixed(6));
  console.log("🔧 useOracle:", useOracle);
  console.log("🛰️ oracleFeed:", oracleFeed);
  console.log("⚙️ solPriceManual (USD):", manualSolUsd);
  if (overrideSolUsd !== undefined) {
    console.log("🧪 OVERRIDE_SOL_USD:", overrideSolUsd);
  }

  let solUsdForCalc: number | undefined;
  if (useOracle) {
    solUsdForCalc = overrideSolUsd;
    if (solUsdForCalc === undefined) {
      console.log("ℹ️ El contrato usa Oracle para SOL/USD. Para calcular en SOL sin decodificar Pyth, define OVERRIDE_SOL_USD en el entorno.");
    }
  } else {
    solUsdForCalc = manualSolUsd;
  }

  if (solUsdForCalc !== undefined && solUsdForCalc > 0) {
    const priceSolPerToken = tokenUsd / solUsdForCalc;
    const tokensPerSol = solUsdForCalc / tokenUsd;
    console.log("💵 SOL/USD usado:", solUsdForCalc.toFixed(6));
    console.log("🧮 Precio del token en SOL:", priceSolPerToken.toFixed(12), "SOL por LIST");
    console.log("🧮 Tokens por SOL:", Math.floor(tokensPerSol), "LIST por 1 SOL");
  } else {
    console.log("⚠️ No se puede calcular precio en SOL sin SOL/USD. Provee OVERRIDE_SOL_USD o desactiva oracle (useOracle=false).");
  }
}

main().catch(console.error);
