import * as anchor from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import {
  getAssociatedTokenAddressSync,
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
} from "@solana/spl-token";

async function runBuyTokens() {
  const program = pg.program;
  const buyer = pg.wallet;

  // 1. CONFIGURACIÓN
  // Dirección del Mint de tu token LISTI
  const mintAddress = new PublicKey(
    "CpovxbxCDN33waPnDs8zA7XmUYLKdsqwBAXQnzKE8i8d"
  );

  // Oráculo de SOL (aunque falle, el contrato usará el fallback de $100)
  const SOL_USD_PYTH_FEED = new PublicKey(
    "H6ARHfE2xtZTSw7nPBp9sN7ifSYSzkTW7hrypCjS9pA1"
  );

  // PDAs necesarias
  const [statePda] = PublicKey.findProgramAddressSync(
    [Buffer.from("state")],
    program.programId
  );
  const [mintAuthPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("mint_auth")],
    program.programId
  );

  // Calcular la ATA del comprador
  const buyerTokenAccount = getAssociatedTokenAddressSync(
    mintAddress,
    buyer.publicKey,
    false,
    TOKEN_2022_PROGRAM_ID
  );

  console.log("🚀 Iniciando proceso de compra...");

  try {
    const tx = new Transaction();

    // 2. VERIFICAR SI LA ATA YA EXISTE
    const accountInfo = await pg.connection.getAccountInfo(buyerTokenAccount);
    if (!accountInfo) {
      console.log("📦 Creando cuenta asociada de tokens (ATA)...");
      tx.add(
        createAssociatedTokenAccountInstruction(
          buyer.publicKey,
          buyerTokenAccount,
          buyer.publicKey,
          mintAddress,
          TOKEN_2022_PROGRAM_ID
        )
      );
    } else {
      console.log("✨ La cuenta de tokens ya existe, saltando creación.");
    }

    // 3. DEFINIR MONTO (0.1 SOL)
    const amountInSol = 0.1;
    const solAmountLamports = new anchor.BN(
      amountInSol * anchor.web3.LAMPORTS_PER_SOL
    );

    // 4. CONSTRUIR INSTRUCCIÓN DE COMPRA
    const buyIx = await program.methods
      .buyTokens(solAmountLamports)
      .accounts({
        state: statePda,
        buyer: buyer.publicKey,
        treasury: mintAuthPda, // Tu PDA que recibe los SOL
        mint: mintAddress,
        buyerTokenAccount: buyerTokenAccount,
        mintAuthority: mintAuthPda,
        oracleAccount: SOL_USD_PYTH_FEED,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .instruction();

    tx.add(buyIx);

    // 5. ENVIAR Y CONFIRMAR
    console.log("📡 Enviando transacción a la red...");
    const signature = await anchor.web3.sendAndConfirmTransaction(
      pg.connection,
      tx,
      [buyer.keypair],
      { commitment: "confirmed" }
    );

    console.log("-----------------------------------------");
    console.log("✅ ¡COMPRA COMPLETADA CON ÉXITO!");
    console.log("💰 SOL Enviados:", amountInSol);
    console.log("🔗 Ver en Explorer:");
    console.log(`https://explorer.solana.com/tx/${signature}?cluster=devnet`);
    console.log("-----------------------------------------");
  } catch (err) {
    console.error("❌ Error en la transacción:");
    console.error(err);
  }
}

runBuyTokens();
