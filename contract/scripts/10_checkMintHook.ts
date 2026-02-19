
import { 
  Connection, 
  PublicKey, 
} from "@solana/web3.js";
import { 
  getMint, 
  getTransferHook,
  TOKEN_2022_PROGRAM_ID
} from "@solana/spl-token";

// --- CONFIGURACIÓN ---
const MINT_ADDRESS = new PublicKey("5gtfs7iQseasXy6nfv1BLjjtBn4ZUgkwGa7NSpiCYSjq");
const connection = new Connection("https://api.devnet.solana.com", "confirmed");

async function main() {
  console.log("🔍 Verificando Transfer Hook en el Mint...");
  console.log("Mint:", MINT_ADDRESS.toBase58());

  try {
    const mint = await getMint(
      connection,
      MINT_ADDRESS,
      "confirmed",
      TOKEN_2022_PROGRAM_ID
    );

    const transferHook = getTransferHook(mint);
    
    if (transferHook) {
      console.log("✅ Transfer Hook Configurado:");
      console.log("  - Program ID:", transferHook.programId.toBase58());
      console.log("  - Authority:", transferHook.authority ? transferHook.authority.toBase58() : "None");
    } else {
      console.log("❌ Transfer Hook NO configurado en este Mint.");
    }

  } catch (e) {
    console.error("Error obteniendo Mint:", e);
  }
}

main().catch(console.error);
