import * as anchor from "@coral-xyz/anchor";
import { Connection, PublicKey } from "@solana/web3.js";
import fs from "fs";

// Configuración de Mainnet
const RPC_URL = "https://solana-mainnet.g.alchemy.com/v2/olUaug5e7HLKLIeYPBlUH";
const PROGRAM_ID = new PublicKey("D6J4e2nQDFupaitnirnp7HerHw5zdpGwNyRvJUrVu7ji");
const IDL = require("../target/idl/list_contract.json");

async function main() {
    console.log("🔍 Consultando estado del contrato en MAINNET...");
    const connection = new Connection(RPC_URL, "confirmed");
    
    // Configurar provider de solo lectura (wallet dummy)
    const mockWallet = {
        publicKey: PublicKey.default,
        signTransaction: async () => { throw new Error("Read only"); },
        signAllTransactions: async () => { throw new Error("Read only"); },
    };
    const provider = new anchor.AnchorProvider(connection, mockWallet as any, {});
    
    // Cargar programa
    const program = new anchor.Program(IDL as any, provider);

    // Derivar State PDA
    const [statePDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("state")],
        program.programId
    );
    console.log("📍 State PDA:", statePDA.toBase58());

    try {
        // Leer estado casteando program.account a any
        const stateAccount: any = await (program.account as any).state.fetch(statePDA);
        
        console.log("\n📊 ESTADO DEL CONTRATO (MAINNET):");
        console.log("------------------------------------------------");
        console.log("Administrador:", stateAccount.admin.toBase58());
        console.log("Precio en centavos de USD:", stateAccount.priceUsdCents);
        console.log("Precio calculado en USD: $", (stateAccount.priceUsdCents / 100).toFixed(2));
        console.log("Usa Oracle (Automático):", stateAccount.useOracle);
        console.log("Feed del Oracle:", stateAccount.oracleFeed.toBase58());
        console.log("------------------------------------------------\n");
        
    } catch (e: any) {
        console.error("❌ Error leyendo el estado:", e.message);
    }
}

main().catch(console.error);