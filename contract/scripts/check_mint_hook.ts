
import { 
  Connection, 
  PublicKey 
} from "@solana/web3.js";
import { 
  getMint, 
  getExtensionTypes, 
  ExtensionType, 
  getTransferHook,
  TOKEN_2022_PROGRAM_ID 
} from "@solana/spl-token";

const MINT_ADDRESS = new PublicKey("5gtfs7iQseasXy6nfv1BLjjtBn4ZUgkwGa7NSpiCYSjq");
const PROGRAM_ID = new PublicKey("7zaZpVzVD6FPtQTKjt7Z4vi46sD5uB6YzTYZC1gNRo89");

async function main() {
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");

  console.log("Checking Mint:", MINT_ADDRESS.toBase58());
  
  try {
    const mint = await getMint(connection, MINT_ADDRESS, "confirmed", TOKEN_2022_PROGRAM_ID);
    const extensionTypes = getExtensionTypes(mint.tlvData);
    console.log("Extension Types:", extensionTypes.map(e => ExtensionType[e]));

    if (extensionTypes.includes(ExtensionType.TransferHook)) {
      const transferHook = getTransferHook(mint);
      if (transferHook) {
        console.log("Transfer Hook Authority:", transferHook.authority.toBase58());
        console.log("Transfer Hook Program ID:", transferHook.programId.toBase58());
        
        if (transferHook.programId.equals(PROGRAM_ID)) {
            console.log("✅ Hook Program ID matches contract.");
        } else {
            console.log("❌ Hook Program ID MISMATCH!");
            console.log("Expected:", PROGRAM_ID.toBase58());
        }
      } else {
        console.log("❌ Transfer Hook extension present but data is null.");
      }
    } else {
      console.log("❌ Transfer Hook extension NOT found on Mint.");
    }

    // Check ExtraAccountMetaList PDA
    const [expectedPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("extra-account-metas"), MINT_ADDRESS.toBuffer()],
        PROGRAM_ID
    );
    console.log("Expected ExtraAccountMetaList PDA:", expectedPDA.toBase58());

    const accountInfo = await connection.getAccountInfo(expectedPDA);
    if (accountInfo) {
        console.log("✅ ExtraAccountMetaList PDA exists.");
        console.log("Data Length:", accountInfo.data.length);
        console.log("Raw Data (Hex):", accountInfo.data.toString("hex"));

        const sysvar = new PublicKey("Sysvar1nstructions1111111111111111111111111");
        console.log("SysvarInstructions Hex:", sysvar.toBuffer().toString("hex"));
    } else {
        console.log("❌ ExtraAccountMetaList PDA NOT FOUND.");
    }

  } catch (e) {
    console.error("Error:", e);
  }
}

main();
