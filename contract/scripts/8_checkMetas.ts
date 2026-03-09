
import { 
  Connection, 
  PublicKey, 
} from "@solana/web3.js";

// --- CONFIGURACIÓN ---
// Asegúrate de que estos coincidan con tu despliegue actual
const PROGRAM_ID = new PublicKey("7zaZpVzVD6FPtQTKjt7Z4vi46sD5uB6YzTYZC1gNRo89");
const MINT_ADDRESS = new PublicKey("GcKEsQgJAJoVoZeTgdYhRNHJaMKpeEhuhfQ5prEQDPt9");

const connection = new Connection("https://api.devnet.solana.com", "confirmed");

async function main() {
  console.log("🔍 Verifying ExtraAccountMetaList on-chain...");
  console.log("Program ID:", PROGRAM_ID.toBase58());
  console.log("Mint:", MINT_ADDRESS.toBase58());

  // Derivar PDA
  const [extraAccountMetaListPDA] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("extra-account-metas"),
      MINT_ADDRESS.toBuffer(),
    ],
    PROGRAM_ID
  );

  console.log("ExtraAccountMetaList PDA:", extraAccountMetaListPDA.toBase58());

  // Obtener cuenta
  const accountInfo = await connection.getAccountInfo(extraAccountMetaListPDA);

  if (!accountInfo) {
    console.error("❌ The ExtraAccountMetaList account DOES NOT EXIST.");
    console.log("This means that 'initialize_extra_account_meta_list' did not execute or failed.");
    return;
  }

  console.log("✅ Account found. Data size:", accountInfo.data.length, "bytes");

  // Análisis básico de los datos
  const data = accountInfo.data;
  
  // El formato TLV (Type-Length-Value) es usado por spl-transfer-hook
  // Pero vamos a imprimir los bytes para ver qué hay.
  console.log("Data (hex):", data.toString('hex'));

  // Buscar Pubkeys conocidas en los datos
  const knownPubkeys = {
    "SystemProgram": "11111111111111111111111111111111",
    "TokenProgram": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
    "AssociatedTokenProgram": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
    "SysvarInstructions": "Sysvar1nstructions1111111111111111111111111",
    "HookProgram": PROGRAM_ID.toBase58()
  };

  console.log("\nSearching for known Pubkeys in the data...");
  let foundAny = false;
  for (const [name, pubkeyStr] of Object.entries(knownPubkeys)) {
    const pubkeyBuffer = new PublicKey(pubkeyStr).toBuffer();
    if (data.includes(pubkeyBuffer)) {
      console.log(`✅ FOUND: ${name} (${pubkeyStr})`);
      foundAny = true;
    }
  }

  if (!foundAny) {
    console.log("⚠️ No se encontraron Pubkeys conocidas de forma directa.");
  } else {
    console.log("\nInterpretación:");
    if (data.includes(new PublicKey("Sysvar1nstructions1111111111111111111111111").toBuffer())) {
      console.log("- The list includes SysvarInstructions (Correct for transfers).");
    }
    if (data.includes(PROGRAM_ID.toBuffer())) {
      console.log("- The list includes the Hook Program (Correct if extra validation is required).");

    } else {

console.log("- ⚠️ The list does NOT explicitly include the Hook Program.");

console.log("If your 'deposit_to_escrow' instruction makes a CPI that requires the Hook,");

console.log("and the Hook requires extra accounts, these must be here.");
  }
}}

main().catch(console.error);
