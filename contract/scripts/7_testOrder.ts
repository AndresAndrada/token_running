
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

const PROGRAM_ID = new PublicKey("7zaZpVzVD6FPtQTKjt7Z4vi46sD5uB6YzTYZC1gNRo89");
const MINT_ADDRESS = new PublicKey("5gtfs7iQseasXy6nfv1BLjjtBn4ZUgkwGa7NSpiCYSjq"); 
const SYSVAR_INSTRUCTIONS_PUBKEY = new PublicKey("Sysvar1nstructions1111111111111111111111111");

async function main() {
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  
  const walletKeypair = Keypair.fromSecretKey(
    new Uint8Array(require("../../mint-authority.json"))
  );

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

  const senderATA = getAssociatedTokenAddressSync(MINT_ADDRESS, walletKeypair.publicKey, false, TOKEN_2022_PROGRAM_ID);
  const recipientATA = getAssociatedTokenAddressSync(MINT_ADDRESS, escrowAuthPDA, true, TOKEN_2022_PROGRAM_ID);

  const tx = new Transaction();

  const transferIx = createTransferCheckedInstruction(
      senderATA, MINT_ADDRESS, recipientATA, walletKeypair.publicKey,
      1 * (10 ** 9), 9, [], TOKEN_2022_PROGRAM_ID
  );

  // --- PRUEBA DE ORDEN INCORRECTO (COMO EN LIB.RS ACTUAL) ---
  // Orden actual en lib.rs: [ExtraMeta, Hook, Sysvar]
  console.log("Probando orden: [ExtraMeta, Hook, Sysvar]...");
  transferIx.keys.push({ pubkey: extraAccountMetaListPDA, isSigner: false, isWritable: false });
  transferIx.keys.push({ pubkey: PROGRAM_ID, isSigner: false, isWritable: false });
  transferIx.keys.push({ pubkey: SYSVAR_INSTRUCTIONS_PUBKEY, isSigner: false, isWritable: false });

  tx.add(transferIx);

  try {
    await sendAndConfirmTransaction(connection, tx, [walletKeypair]);
    console.log("❌ ÉXITO INESPERADO (El orden incorrecto funcionó?)");
  } catch (error: any) {
    console.log("✅ FALLÓ (Como se esperaba con el orden incorrecto)");
    if (error.logs) {
        // Check if error is "Missing account" or similar
        const missing = error.logs.some(l => l.includes("An account required by the instruction is missing"));
        if (missing) {
            console.log("🏆 ERROR CONFIRMADO: 'An account required by the instruction is missing'");
        } else {
            console.log("Otro error:", error.logs);
        }
    } else {
        console.log(error.message);
    }
  }
}

main();
