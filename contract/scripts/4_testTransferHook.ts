import { 
  Connection, 
  Keypair, 
  PublicKey, 
  Transaction, 
  sendAndConfirmTransaction,
  SystemProgram 
} from "@solana/web3.js";
import { 
  TOKEN_2022_PROGRAM_ID, 
  ASSOCIATED_TOKEN_PROGRAM_ID, 
  getMint, 
  getTransferHook, 
  createAssociatedTokenAccountInstruction, 
  createTransferCheckedInstruction, 
  getAssociatedTokenAddressSync 
} from "@solana/spl-token";

// --- CONFIGURACIÓN ---
const PROGRAM_ID = new PublicKey("7zaZpVzVD6FPtQTKjt7Z4vi46sD5uB6YzTYZC1gNRo89");
const MINT_ADDRESS = new PublicKey("5gtfs7iQseasXy6nfv1BLjjtBn4ZUgkwGa7NSpiCYSjq"); 

async function main() {
  // 1. Conexión y Wallet
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  
  const walletKeypair = Keypair.fromSecretKey(
    new Uint8Array(require("../../mint-authority.json"))
  );
  console.log("Wallet:", walletKeypair.publicKey.toBase58());

  // 2. Verificar Configuración del Hook
  console.log("\n--- Verificando Configuración del Mint ---");
  try {
    const mintInfo = await getMint(
      connection, 
      MINT_ADDRESS, 
      "confirmed", 
      TOKEN_2022_PROGRAM_ID
    );
    
    const transferHook = getTransferHook(mintInfo);
    if (transferHook) {
      console.log("✅ Transfer Hook detectado:");
      console.log("   Program ID:", transferHook.programId.toBase58());
      console.log("   Authority:", transferHook.authority?.toBase58());
    } else {
      console.error("❌ No se detectó Transfer Hook en este Mint.");
      return;
    }
  } catch (error) {
    console.error("Error obteniendo información del Mint:", error);
    return;
  }

  // 3. Preparar Transferencia de Prueba (FALLIDA)
  console.log("\n--- Iniciando Prueba de Transferencia (Debe Fallar) ---");
  
  // Generar un destinatario aleatorio
  const recipient = Keypair.generate();
  console.log("Destinatario (Random):", recipient.publicKey.toBase58());

  // Calcular ATAs
  const senderATA = getAssociatedTokenAddressSync(
    MINT_ADDRESS,
    walletKeypair.publicKey,
    false,
    TOKEN_2022_PROGRAM_ID
  );

  const recipientATA = getAssociatedTokenAddressSync(
    MINT_ADDRESS,
    recipient.publicKey,
    false,
    TOKEN_2022_PROGRAM_ID
  );

  // Crear transacción
  const tx = new Transaction();

  // Crear ATA del destinatario (necesario para recibir)
  tx.add(
    createAssociatedTokenAccountInstruction(
      walletKeypair.publicKey,
      recipientATA,
      recipient.publicKey,
      MINT_ADDRESS,
      TOKEN_2022_PROGRAM_ID
    )
  );

  // Intentar transferir 10 tokens
  // Esto debería activar el Hook y fallar porque no es una instrucción del programa
  const transferIx = createTransferCheckedInstruction(
      senderATA,
      MINT_ADDRESS,
      recipientATA,
      walletKeypair.publicKey,
      10 * (10 ** 9), // 10 tokens
      9,
      [],
      TOKEN_2022_PROGRAM_ID
  );

  // --- AGREGAR CUENTAS DEL HOOK MANUALMENTE ---
  // Para que el Transfer Hook se ejecute, Token-2022 necesita las cuentas extra.
  // En una app real, usaríamos `addExtraAccountsToInstruction` de @solana/spl-token.
  // Aquí lo hacemos manual para verificar.

  // 1. Hook Program ID (El contrato que tiene el hook)
  transferIx.keys.push({ pubkey: PROGRAM_ID, isSigner: false, isWritable: false });

  // 2. ExtraAccountMetaList PDA (Donde están definidas las cuentas extra)
  const [extraAccountMetaListPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("extra-account-metas"), MINT_ADDRESS.toBuffer()],
    PROGRAM_ID
  );
  transferIx.keys.push({ pubkey: extraAccountMetaListPDA, isSigner: false, isWritable: false });

  // 3. Sysvar Instructions (Requerido por nuestra lógica del hook)
  // Esto está definido en el ExtraAccountMetaList que inicializamos antes.
  transferIx.keys.push({ pubkey: new PublicKey("Sysvar1nstructions1111111111111111111111111"), isSigner: false, isWritable: false });

  tx.add(transferIx);

  try {
    console.log("Enviando transacción...");
    const sig = await sendAndConfirmTransaction(connection, tx, [walletKeypair]);
    console.log("❌ LA TRANSFERENCIA FUE EXITOSA (ESTO ES MALO).");
    console.log("Signature:", sig);
  } catch (error: any) {
    console.log("\n✅ LA TRANSFERENCIA FALLÓ (ESTO ES BUENO).");
    
    // Analizar el error
    if (error.logs) {
      console.log("Logs de la transacción:");
      const logs = error.logs as string[];
      logs.forEach(log => {
        if (log.includes("TransferNotAllowed") || log.includes("custom program error: 0x1770")) { // 0x1770 es 6000 en hex (TransferNotAllowed)
             console.log(`   > ${log} (Error confirmado del Hook)`);
        } else {
             // console.log(`   ${log}`);
        }
      });
      
      const isHookError = logs.some(l => l.includes("TransferNotAllowed") || l.includes("0x1770")); // 6000 decimal
      if (isHookError) {
        console.log("\n🏆 CONCLUSIÓN: El contrato está protegiendo el token correctamente.");
      } else {
        console.log("\n⚠️ La transacción falló, pero no estoy seguro si fue por el Hook. Revisa los logs.");
        console.log(logs);
      }
    } else {
      console.log("Error sin logs:", error.message);
    }
  }
}

main().catch(console.error);