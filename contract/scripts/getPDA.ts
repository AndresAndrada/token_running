// import * as anchor from "@coral-xyz/anchor";
// import { 
//   TOKEN_2022_PROGRAM_ID, 
//   createMint,
// } from "@solana/spl-token";
// import { Keypair, PublicKey } from "@solana/web3.js";

// async function main() {
//   const provider = anchor.AnchorProvider.env();
//   anchor.setProvider(provider);
//   const payer = (provider.wallet as any).payer;

//   // TU PROGRAM ID
//   const programId = new PublicKey("5MzHuwF8dUQv6HtMJBy9QUegDHs9BRPUCJMFBLBh1Rop");

//   console.log("Creando Token-2022 con Transfer Hook en local...");

//   // Generamos un keypair para el nuevo token
//   const mintKeypair = Keypair.generate();

//   // Usamos createMint pero limitando los argumentos para que tu versión de TS no falle
//   // El truco es que si la versión es vieja, no podremos pasar el hook aquí,
//   // pero podemos hacerlo en dos pasos si fuera necesario. 
//   // Intentemos primero con la sintaxis simplificada:
  
//   try {
//     const mint = await createMint(
//         provider.connection,
//         payer,
//         payer.publicKey,
//         payer.publicKey,
//         9,
//         mintKeypair,
//         { commitment: "confirmed" },
//         TOKEN_2022_PROGRAM_ID,
//     );

//     console.log("------------------------------------------");
//     console.log("✅ Token Creado:", mint.toBase58());
//     console.log("⚠️  IMPORTANTE: Si este comando no aceptó el Hook por la versión,");
//     console.log("tendremos que inicializarlo mediante Playground para asegurar el bloqueo.");
//     console.log("------------------------------------------");
//   } catch (e) {
//     console.error("Error al crear el mint:", e);
//   }
// }

// main();

import * as anchor from "@coral-xyz/anchor";

async function main() {
  // 1. Configuramos el provider de Playground
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  // 2. Cargamos el programa actual
  const program = anchor.workspace.ListContract; // Asegúrate de que coincida con el nombre de tu contrato (CamelCase)

  // 3. Calculamos la PDA
  const [mintPda, bump] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("mint_auth")],
    program.programId
  );

  console.log("------------------------------------------");
  console.log("🚀 TU PROGRAM ID:", program.programId.toBase58());
  console.log("🔑 TU PDA (Mint Authority):", mintPda.toBase58());
  console.log("🔢 BUMP:", bump);
  console.log("------------------------------------------");
}

main();