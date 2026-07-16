import * as anchor from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import fs from "fs";

// === CONFIGURACIÓN ===
// Cambia esto a 'mainnet-beta' o usa tu RPC de Alchemy si vas a retirar en producción
const RPC_URL = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";

// El Program ID de tu contrato
const PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_PROGRAM_ID || "D6J4e2nQDFupaitnirnp7HerHw5zdpGwNyRvJUrVu7ji"
);

// Tu wallet de Administrador (la que desplegó el contrato o fue asignada como admin)
// Ajusta la ruta a tu keypair real
const ADMIN_WALLET_PATH = "./deploy-wallet.json";

// Cuánto SOL quieres retirar. Si pones "ALL", retirará todo lo disponible.
const AMOUNT_TO_WITHDRAW_SOL = "ALL"; // Puedes cambiar "ALL" por un número como 0.5

const IDL = require("../target/idl/list_contract.json");

async function main() {
  console.log("🚀 Iniciando proceso de retiro de SOL (withdraw_sol)...");
  console.log("📡 Red:", RPC_URL);

  const connection = new Connection(RPC_URL, "confirmed");

  // Cargar wallet del admin
  if (!fs.existsSync(ADMIN_WALLET_PATH)) {
    console.error(`❌ No se encontró la wallet del admin en: ${ADMIN_WALLET_PATH}`);
    process.exit(1);
  }
  const adminKeypair = Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync(ADMIN_WALLET_PATH, "utf-8")))
  );
  console.log("👤 Admin Wallet:", adminKeypair.publicKey.toBase58());

  // Configurar Provider de Anchor
  const wallet = new anchor.Wallet(adminKeypair);
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);

  // Cargar el programa
  const program = new anchor.Program(IDL as any, provider);

  // Derivar PDAs
  const [statePDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("state")],
    program.programId
  );
  const [treasuryPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("mint_auth")],
    program.programId
  );

  console.log("🏦 Treasury PDA (Caja Fuerte):", treasuryPDA.toBase58());

  // 1. Verificar balance del Treasury
  const treasuryBalanceLamports = await connection.getBalance(treasuryPDA);
  const treasuryBalanceSOL = treasuryBalanceLamports / anchor.web3.LAMPORTS_PER_SOL;
  console.log(`💰 Balance actual del Treasury: ${treasuryBalanceSOL} SOL`);

  if (treasuryBalanceLamports === 0) {
    console.log("⚠️ El treasury está vacío. No hay nada que retirar.");
    return;
  }

  // 2. Calcular monto a retirar
  // Necesitamos dejar la renta mínima (aprox 0.002 SOL) para que la cuenta no muera
  const rentExemption = await connection.getMinimumBalanceForRentExemption(0);
  const maxWithdrawableLamports = treasuryBalanceLamports - rentExemption;

  if (maxWithdrawableLamports <= 0) {
    console.log("⚠️ El balance del treasury solo alcanza para pagar la renta. No hay ganancias retirables.");
    return;
  }

  let withdrawLamports = new anchor.BN(0);
  if (AMOUNT_TO_WITHDRAW_SOL === "ALL") {
    withdrawLamports = new anchor.BN(maxWithdrawableLamports);
    console.log(`📉 Retirando TODO lo disponible: ${(maxWithdrawableLamports / anchor.web3.LAMPORTS_PER_SOL).toFixed(6)} SOL`);
  } else {
    const requestedLamports = parseFloat(AMOUNT_TO_WITHDRAW_SOL as string) * anchor.web3.LAMPORTS_PER_SOL;
    if (requestedLamports > maxWithdrawableLamports) {
      console.error(`❌ Estás pidiendo más SOL del que se puede retirar. Máximo retirable: ${(maxWithdrawableLamports / anchor.web3.LAMPORTS_PER_SOL).toFixed(6)} SOL`);
      return;
    }
    withdrawLamports = new anchor.BN(requestedLamports);
    console.log(`📉 Retirando: ${AMOUNT_TO_WITHDRAW_SOL} SOL`);
  }

  // 3. Ejecutar instrucción withdraw_sol
  console.log("⏳ Enviando transacción a la blockchain...");
  try {
    const tx = await program.methods
      .withdrawSol(withdrawLamports)
      .accounts({
        state: statePDA,
        admin: adminKeypair.publicKey,
        treasury: treasuryPDA,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([adminKeypair])
      .rpc();

    console.log("✅ ¡Retiro exitoso!");
    console.log(`🔗 Firma de la transacción: https://explorer.solana.com/tx/${tx}?cluster=devnet`);

    // Mostrar nuevo balance del admin
    const newAdminBalance = await connection.getBalance(adminKeypair.publicKey);
    console.log(`🤑 Nuevo balance del Admin: ${(newAdminBalance / anchor.web3.LAMPORTS_PER_SOL).toFixed(4)} SOL`);

  } catch (error: any) {
    console.error("❌ Ocurrió un error durante el retiro:");
    console.error(error.message);
    if (error.logs) {
      console.error("📜 Logs del programa:", error.logs);
    }
  }
}

main().catch(console.error);