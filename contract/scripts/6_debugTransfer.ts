
import { 
  Connection, 
  Keypair, 
  PublicKey, 
  Transaction, 
  sendAndConfirmTransaction 
} from "@solana/web3.js";
import { 
  TOKEN_2022_PROGRAM_ID, 
  createTransferCheckedInstruction, 
  getAssociatedTokenAddressSync 
} from "@solana/spl-token";

// --- CONFIGURACIÓN ---
const PROGRAM_ID = new PublicKey("7zaZpVzVD6FPtQTKjt7Z4vi46sD5uB6YzTYZC1gNRo89");
const MINT_ADDRESS = new PublicKey("5gtfs7iQseasXy6nfv1BLjjtBn4ZUgkwGa7NSpiCYSjq"); 
const SYSVAR_INSTRUCTIONS_PUBKEY = new PublicKey("Sysvar1nstructions1111111111111111111111111");

async function main() {
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  
  const walletKeypair = Keypair.fromSecretKey(
    new Uint8Array(require("../../mint-authority.json"))
  );
  console.log("Wallet:", walletKeypair.publicKey.toBase58());

  // Escrow Auth PDA
  const [escrowAuthPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("escrow"), walletKeypair.publicKey.toBuffer()],
    PROGRAM_ID
  );

  // ExtraAccountMetaList PDA
  const [extraAccountMetaListPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("extra-account-metas"), MINT_ADDRESS.toBuffer()],
    PROGRAM_ID
  );

  // ATAs
  const senderATA = getAssociatedTokenAddressSync(
    MINT_ADDRESS,
    walletKeypair.publicKey,
    false,
    TOKEN_2022_PROGRAM_ID
  );

  const recipientATA = getAssociatedTokenAddressSync(
    MINT_ADDRESS,
    escrowAuthPDA,
    true,
    TOKEN_2022_PROGRAM_ID
  );

  console.log("Sender ATA:", senderATA.toBase58());
  console.log("Recipient ATA:", recipientATA.toBase58());

  // Crear transacción
  const tx = new Transaction();

  // Transferir 1 token (para probar)
  const transferIx = createTransferCheckedInstruction(
      senderATA,
      MINT_ADDRESS,
      recipientATA,
      walletKeypair.publicKey,
      1 * (10 ** 9),
      9,
      [],
      TOKEN_2022_PROGRAM_ID
  );

  // --- AGREGAR CUENTAS DEL HOOK ---
  // Probamos el orden que funcionó en 4_testTransferHook.ts
  transferIx.keys.push({ pubkey: PROGRAM_ID, isSigner: false, isWritable: false });
  transferIx.keys.push({ pubkey: extraAccountMetaListPDA, isSigner: false, isWritable: false });
  transferIx.keys.push({ pubkey: SYSVAR_INSTRUCTIONS_PUBKEY, isSigner: false, isWritable: false });

  tx.add(transferIx);

  try {
    console.log("Enviando transferencia directa de prueba...");
    const sig = await sendAndConfirmTransaction(connection, tx, [walletKeypair]);
    console.log("❌ TRANSFERENCIA DIRECTA EXITOSA (El hook no bloqueó o permitió si es válido)");
    console.log("Signature:", sig);
  } catch (error: any) {
    console.log("✅ TRANSFERENCIA DIRECTA FALLÓ");
    if (error.logs) {
      console.log("Logs:");
      error.logs.forEach(log => console.log(log));
    } else {
      console.log(error);
    }
  }
}

main().catch(console.error);
