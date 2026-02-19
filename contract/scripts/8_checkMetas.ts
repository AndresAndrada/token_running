
import { 
  Connection, 
  PublicKey, 
} from "@solana/web3.js";

// --- CONFIGURACIÓN ---
// Asegúrate de que estos coincidan con tu despliegue actual
const PROGRAM_ID = new PublicKey("7zaZpVzVD6FPtQTKjt7Z4vi46sD5uB6YzTYZC1gNRo89");
const MINT_ADDRESS = new PublicKey("5gtfs7iQseasXy6nfv1BLjjtBn4ZUgkwGa7NSpiCYSjq");

const connection = new Connection("https://api.devnet.solana.com", "confirmed");

async function main() {
  console.log("🔍 Verificando ExtraAccountMetaList on-chain...");
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
    console.error("❌ La cuenta ExtraAccountMetaList NO EXISTE.");
    console.log("Esto significa que 'initialize_extra_account_meta_list' no se ejecutó o falló.");
    return;
  }

  console.log("✅ Cuenta encontrada. Tamaño de datos:", accountInfo.data.length, "bytes");

  // Análisis básico de los datos
  const data = accountInfo.data;
  
  // El formato TLV (Type-Length-Value) es usado por spl-transfer-hook
  // Pero vamos a imprimir los bytes para ver qué hay.
  console.log("Datos (hex):", data.toString('hex'));

  // Buscar Pubkeys conocidas en los datos
  const knownPubkeys = {
    "SystemProgram": "11111111111111111111111111111111",
    "TokenProgram": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
    "AssociatedTokenProgram": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
    "SysvarInstructions": "Sysvar1nstructions1111111111111111111111111",
    "HookProgram": PROGRAM_ID.toBase58()
  };

  console.log("\nBuscando Pubkeys conocidas en los datos...");
  let foundAny = false;
  for (const [name, pubkeyStr] of Object.entries(knownPubkeys)) {
    const pubkeyBuffer = new PublicKey(pubkeyStr).toBuffer();
    if (data.includes(pubkeyBuffer)) {
      console.log(`✅ ENCONTRADO: ${name} (${pubkeyStr})`);
      foundAny = true;
    }
  }

  if (!foundAny) {
    console.log("⚠️ No se encontraron Pubkeys conocidas de forma directa.");
  } else {
    console.log("\nInterpretación:");
    if (data.includes(new PublicKey("Sysvar1nstructions1111111111111111111111111").toBuffer())) {
      console.log("- La lista incluye SysvarInstructions (Correcto para transferencias).");
    }
    if (data.includes(PROGRAM_ID.toBuffer())) {
      console.log("- La lista incluye el Hook Program (Correcto si se requiere validación extra).");
    } else {
      console.log("- ⚠️ La lista NO incluye el Hook Program explícitamente.");
      console.log("  Si tu instrucción 'deposit_to_escrow' hace un CPI que requiere el Hook,");
      console.log("  y el Hook requiere cuentas extras, estas deben estar aquí.");
    }
  }
}

main().catch(console.error);
