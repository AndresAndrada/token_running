
import { 
  Connection, 
  PublicKey, 
  Keypair,
  TransactionInstruction
} from "@solana/web3.js";
import { 
  getMint, 
  getTransferHook, 
  getExtraAccountMetaAddress, 
  addExtraAccountMetasForExecute, 
  TOKEN_2022_PROGRAM_ID 
} from "@solana/spl-token";
import * as anchor from "@coral-xyz/anchor";

const PROGRAM_ID = new PublicKey("7zaZpVzVD6FPtQTKjt7Z4vi46sD5uB6YzTYZC1gNRo89");
const MINT_ADDRESS = new PublicKey("5gtfs7iQseasXy6nfv1BLjjtBn4ZUgkwGa7NSpiCYSjq");

async function main() {
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  const walletKeypair = Keypair.fromSecretKey(
    new Uint8Array(require("../../mint-authority.json"))
  );
  
  console.log("Resolviendo cuentas extra para Transfer Hook...");
  console.log("Mint:", MINT_ADDRESS.toBase58());
  console.log("Program:", PROGRAM_ID.toBase58());

  // 1. Obtener Mint y verificar Hook
  const mint = await getMint(connection, MINT_ADDRESS, "confirmed", TOKEN_2022_PROGRAM_ID);
  const transferHook = getTransferHook(mint);
  
  if (!transferHook) {
    console.error("❌ No hay Transfer Hook configurado en el Mint.");
    return;
  }
  console.log("✅ Transfer Hook ID:", transferHook.programId.toBase58());

  // 2. Simular una instrucción de transferencia para resolver cuentas
  const dummyInstruction = new TransactionInstruction({
    programId: TOKEN_2022_PROGRAM_ID,
    keys: [
      { pubkey: PublicKey.default, isSigner: false, isWritable: true }, // Source
      { pubkey: MINT_ADDRESS, isSigner: false, isWritable: false },     // Mint
      { pubkey: PublicKey.default, isSigner: false, isWritable: true }, // Destination
      { pubkey: walletKeypair.publicKey, isSigner: true, isWritable: false }, // Owner
      // Initial standard accounts only
    ],
    data: Buffer.alloc(0) 
  });

  try {
    // Esta función modifica dummyInstruction añadiendo las cuentas necesarias
    await addExtraAccountMetasForExecute(
      connection,
      dummyInstruction,
      transferHook.programId,
      dummyInstruction.keys[0].pubkey, // Source
      dummyInstruction.keys[1].pubkey, // Mint
      dummyInstruction.keys[2].pubkey, // Dest
      dummyInstruction.keys[3].pubkey, // Owner
      0, // Amount
      "confirmed"
    );

    console.log("\n✅ Cuentas Totales en Instrucción (Standard + Extra):");
    const extraAccounts = dummyInstruction.keys.slice(4); // Skip first 4 standard accounts
    
    extraAccounts.forEach((acc, i) => {
      console.log(`  ${i}: ${acc.pubkey.toBase58()} (Signer: ${acc.isSigner}, Writable: ${acc.isWritable})`);
      
      if (acc.pubkey.equals(PROGRAM_ID)) console.log("     -> Hook Program");
      if (acc.pubkey.toBase58() === "Sysvar1nstructions1111111111111111111111111") console.log("     -> SysvarInstructions");
      
      const expectedPDA = getExtraAccountMetaAddress(MINT_ADDRESS, PROGRAM_ID);
      if (acc.pubkey.equals(expectedPDA)) console.log("     -> ExtraAccountMetaList PDA");
    });

  } catch (e) {
    console.error("❌ Error resolviendo cuentas:", e);
  }
}

main().catch(console.error);
