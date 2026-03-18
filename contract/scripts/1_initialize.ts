import * as anchor from "@coral-xyz/anchor";

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

  console.log("📍 STATE PDA CALCULADO:", statePda.toBase58());

  try {
    console.log("📝 Inicializando cuenta de Estado...");
    const tx = await program.methods
      .initialize(9) // 9 decimales para el token
      .accounts({
        state: statePda,
        admin: payer.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();
    
    console.log("✅ Estado inicializado con éxito.");
    console.log("� Transaction Signature:", tx);
  } catch (e) {
    console.log("⚠️ El estado ya estaba inicializado o hubo un error:", e.message);
    if (e.logs) {
        console.log("Logs del error:", e.logs);
    }
  }

  console.log("---------------------------------------");
  console.log("🎉 INICIALIZACIÓN DE ESTADO COMPLETADA!");
  console.log("---------------------------------------");
}

main();
