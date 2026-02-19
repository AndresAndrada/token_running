
import * as anchor from "@coral-xyz/anchor";
import { Connection, PublicKey } from "@solana/web3.js";
import * as fs from "fs";

// --- CONFIGURACIÓN ---
const PROGRAM_ID = "7zaZpVzVD6FPtQTKjt7Z4vi46sD5uB6YzTYZC1gNRo89";

async function main() {
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  console.log("Fetching IDL for program:", PROGRAM_ID);

  try {
    const idl = await anchor.Program.fetchIdl(PROGRAM_ID, { connection });
    if (!idl) {
      console.log("❌ No IDL found. The program might not have initialized the IDL account.");
      return;
    }
    console.log("✅ IDL found!");
    console.log(JSON.stringify(idl, null, 2));
    
    // Guardar en archivo para inspección
    fs.writeFileSync("fetched_idl.json", JSON.stringify(idl, null, 2));
    console.log("IDL saved to fetched_idl.json");

  } catch (e) {
    console.error("Error fetching IDL:", e);
  }
}

main();
