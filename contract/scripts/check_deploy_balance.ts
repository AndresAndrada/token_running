import { Connection, Keypair, LAMPORTS_PER_SOL, clusterApiUrl } from "@solana/web3.js";
import * as fs from "fs";

async function checkBalance() {
  try {
    // 1. Cargar la wallet
    const secretKey = JSON.parse(fs.readFileSync("./contract/deploy-wallet.json", "utf-8"));
    const keypair = Keypair.fromSecretKey(new Uint8Array(secretKey));
    const walletAddress = keypair.publicKey.toBase58();

    console.log(`🔍 Consultando saldo para: ${walletAddress}`);

    // 2. Conectar a Mainnet (Usando RPC público por ahora solo para lectura)
    const connection = new Connection("https://api.mainnet-beta.solana.com", "confirmed");

    // 3. Obtener saldo
    const balance = await connection.getBalance(keypair.publicKey);
    const solBalance = balance / LAMPORTS_PER_SOL;

    console.log(`---------------------------------------------------`);
    console.log(`💰 Saldo Actual: ${solBalance} SOL`);
    console.log(`---------------------------------------------------`);

    if (solBalance < 3) {
      console.log("⚠️  ADVERTENCIA: El saldo es bajo para desplegar.");
      console.log("   Se recomienda tener al menos 3-5 SOL.");
    } else {
      console.log("✅ Saldo suficiente para intentar el despliegue.");
    }

  } catch (error) {
    console.error("❌ Error al consultar saldo:", error);
  }
}

checkBalance();
