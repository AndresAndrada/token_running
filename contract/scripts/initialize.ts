import * as anchor from "@coral-xyz/anchor";
import { 
  TOKEN_2022_PROGRAM_ID, 
  createMint, 
  createInitializeTransferHookInstruction 
} from "@solana/spl-token";

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.ListContract;
  const payer = provider.wallet as anchor.Wallet;

  console.log("🚀 Iniciando configuración completa...");

  // 1. INICIALIZAR EL ESTADO (PDA b"state")
  const [statePda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("state")],
    program.programId
  );

  try {
    console.log("📝 Inicializando cuenta de Estado...");
    await program.methods
      .initialize(9) // 9 decimales para el token
      .accounts({
        state: statePda,
        admin: payer.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();
    console.log("✅ Estado inicializado.");
  } catch (e) {
    console.log("⚠️ El estado ya estaba inicializado o hubo un error:", e.message);
  }

  // 2. CREAR EL TOKEN MINT
  const mintKeypair = anchor.web3.Keypair.generate();
  const mintAuthority = new anchor.web3.PublicKey("6WRsdavcc4hc2jSC7tw8nT74DH2iGdaZEBcZsYfrmECq");

  console.log("🛠️ Creando nuevo Token con Extensiones...");
  const mint = await createMint(
    provider.connection,
    payer.payer,
    mintAuthority, 
    mintAuthority, 
    9,             
    mintKeypair,
    { commitment: "confirmed" },
    TOKEN_2022_PROGRAM_ID
  );
  console.log("✅ Token creado:", mint.toBase58());

  // 3. VINCULAR TRANSFER HOOK Y METADATOS
  const transaction = new anchor.web3.Transaction().add(
    createInitializeTransferHookInstruction(
      mint,
      payer.publicKey,
      program.programId,
      TOKEN_2022_PROGRAM_ID
    )
  );

  const [extraMetasPda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("extra-account-metas"), mint.toBuffer()],
    program.programId
  );

  const initIx = await program.methods
    .initializeExtraAccountMetaList()
    .accounts({
      payer: payer.publicKey,
      extraAccountMetaList: extraMetasPda,
      mint: mint,
      systemProgram: anchor.web3.SystemProgram.programId,
    })
    .instruction();
  
  transaction.add(initIx);

  await provider.sendAndConfirm(transaction);
  
  console.log("---------------------------------------");
  console.log("🎉 SYSTEM READY TO OPERATE!");
  console.log("📍 STATE PDA:", statePda.toBase58());
  console.log("📱 TOKEN MINT:", mint.toBase58());
  console.log("🔑 MINT AUTHORITY (PDA):", mintAuthority.toBase58());
  console.log("---------------------------------------");
}

main();