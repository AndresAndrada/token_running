
import * as anchor from "@coral-xyz/anchor";
import { 
  Connection, 
  Keypair, 
  PublicKey, 
  SystemProgram, 
  Transaction,
  sendAndConfirmTransaction 
} from "@solana/web3.js";
import { 
  TOKEN_2022_PROGRAM_ID, 
  getMint 
} from "@solana/spl-token";
import * as crypto from "crypto";

// --- CONFIGURACIÓN ---
const PROGRAM_ID = new PublicKey("7zaZpVzVD6FPtQTKjt7Z4vi46sD5uB6YzTYZC1gNRo89");
const MINT_ADDRESS = new PublicKey("5gtfs7iQseasXy6nfv1BLjjtBn4ZUgkwGa7NSpiCYSjq");

// --- DISCRIMINADORES ---
function getDiscriminator(name: string): Buffer {
  return crypto.createHash("sha256")
    .update(`global:${name}`)
    .digest()
    .slice(0, 8);
}

const closeDiscriminator = getDiscriminator("close_extra_account_meta_list");
const initDiscriminator = getDiscriminator("initialize_extra_account_meta_list");

async function main() {
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  const walletKeypair = Keypair.fromSecretKey(
    new Uint8Array(require("../../mint-authority.json"))
  );
  const wallet = new anchor.Wallet(walletKeypair);
  
  console.log("Wallet:", wallet.publicKey.toBase58());

  // PDAs
  const [extraAccountMetaListPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("extra-account-metas"), MINT_ADDRESS.toBuffer()],
    PROGRAM_ID
  );

  console.log("ExtraAccountMetaList PDA:", extraAccountMetaListPDA.toBase58());

  // 1. Cerrar cuenta existente (si existe)
  console.log("Intentando cerrar ExtraAccountMetaList antigua...");
  try {
    const txClose = new Transaction().add(
      new anchor.web3.TransactionInstruction({
        programId: PROGRAM_ID,
        keys: [
          { pubkey: wallet.publicKey, isSigner: true, isWritable: true }, // payer
          { pubkey: extraAccountMetaListPDA, isSigner: false, isWritable: true }, // extra_account_meta_list
          { pubkey: MINT_ADDRESS, isSigner: false, isWritable: false }, // mint
        ],
        data: closeDiscriminator
      })
    );

    const sigClose = await sendAndConfirmTransaction(connection, txClose, [walletKeypair]);
    console.log("✅ Cuenta cerrada. Signature:", sigClose);
  } catch (e) {
    console.log("⚠️ Error cerrando cuenta (puede que no exista o instrucción no encontrada si no has actualizado el contrato):", e);
  }

  // 2. Inicializar nueva lista
  console.log("Inicializando nueva ExtraAccountMetaList...");
  try {
    const txInit = new Transaction().add(
      new anchor.web3.TransactionInstruction({
        programId: PROGRAM_ID,
        keys: [
          { pubkey: wallet.publicKey, isSigner: true, isWritable: true }, // payer
          { pubkey: extraAccountMetaListPDA, isSigner: false, isWritable: true }, // extra_account_meta_list
          { pubkey: MINT_ADDRESS, isSigner: false, isWritable: false }, // mint
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // system_program
        ],
        data: initDiscriminator
      })
    );

    const sigInit = await sendAndConfirmTransaction(connection, txInit, [walletKeypair]);
    console.log("✅ Inicialización exitosa. Signature:", sigInit);
  } catch (e) {
    console.error("❌ Error inicializando:", e);
  }
}

main().catch(console.error);
