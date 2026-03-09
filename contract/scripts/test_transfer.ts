
import { Connection, Keypair, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { 
    createAssociatedTokenAccount, 
    getAssociatedTokenAddress, 
    createTransferCheckedInstruction, 
    getExtraAccountMetaAddress 
} from "@solana/spl-token";
import fs from "fs";

// Load Wallet
const WALLET_PATH = "c:\\Users\\Pc\\Desktop\\list-token\\contract\\phantom-admin.json";
const walletData = JSON.parse(fs.readFileSync(WALLET_PATH, "utf-8"));
const wallet = Keypair.fromSecretKey(new Uint8Array(walletData));

// Config
const connection = new Connection("https://api.devnet.solana.com", "confirmed");
const MINT = new PublicKey("EXURUSEXwt17izMpL4b9o4eRAjDx3nYUGKGeVwHWNaSi"); // New Mint
const PROGRAM_ID = new PublicKey("7zaZpVzVD6FPtQTKjt7Z4vi46sD5uB6YzTYZC1gNRo89"); // Hook Program
const TOKEN_2022_PROGRAM_ID = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");

async function main() {
    console.log("🚀 Testing Direct Transfer with Hook...");
    console.log("Wallet:", wallet.publicKey.toString());
    console.log("Mint:", MINT.toString());

    // 1. Get User ATA
    const userATA = await getAssociatedTokenAddress(MINT, wallet.publicKey, false, TOKEN_2022_PROGRAM_ID);
    console.log("User ATA:", userATA.toString());

    // Check balance
    try {
        const balance = await connection.getTokenAccountBalance(userATA);
        console.log("User Balance:", balance.value.uiAmount);
        if (balance.value.uiAmount === 0) {
            console.log("❌ User has no tokens!");
            return;
        }
    } catch (e) {
        console.log("❌ User ATA not found or error:", e);
        return;
    }

    // 2. Create Receiver
    const receiver = Keypair.generate();
    console.log("Receiver:", receiver.publicKey.toString());
    
    // Create Receiver ATA
    console.log("Creating Receiver ATA...");
    try {
        await createAssociatedTokenAccount(
            connection,
            wallet, // payer
            MINT,
            receiver.publicKey,
            { commitment: "confirmed" },
            TOKEN_2022_PROGRAM_ID
        );
        console.log("✅ Receiver ATA created.");
    } catch (e) {
        console.log("❌ Failed to create Receiver ATA:", e);
        return;
    }
    
    const receiverATA = await getAssociatedTokenAddress(MINT, receiver.publicKey, false, TOKEN_2022_PROGRAM_ID);

    // 3. Construct Transfer Instruction manually with Extra Accounts
    console.log("Constructing Transfer Instruction...");
    
    const amount = BigInt(1000000); // 1 token
    const decimals = 6;
    
    const ix = createTransferCheckedInstruction(
        userATA,
        MINT,
        receiverATA,
        wallet.publicKey,
        amount,
        decimals,
        [],
        TOKEN_2022_PROGRAM_ID
    );
    
    // Add Extra Accounts
    const extraAccountMetaListPDA = getExtraAccountMetaAddress(MINT, PROGRAM_ID);
    const SYSVAR_INSTRUCTIONS_PUBKEY = new PublicKey("Sysvar1nstructions1111111111111111111111111");
    
    // Order from check_metas: [Program, Sysvar]
    // Order required by Token2022: [MetaList, ...Extras]
    
    console.log("Adding Extra Accounts...");
    // 1. ExtraAccountMetaList PDA (Required by Token2022 to find extras)
    ix.keys.push({ pubkey: extraAccountMetaListPDA, isSigner: false, isWritable: false });
    // 2. Program ID (Required for CPI execution)
    ix.keys.push({ pubkey: PROGRAM_ID, isSigner: false, isWritable: false });
    // 3. Sysvar Instructions (Required by Hook logic)
    ix.keys.push({ pubkey: SYSVAR_INSTRUCTIONS_PUBKEY, isSigner: false, isWritable: false });
    
    // Send Transaction
    const txTransfer = new Transaction().add(ix);
    
    try {
        const sig = await sendAndConfirmTransaction(connection, txTransfer, [wallet], { skipPreflight: true });
        console.log("✅ Transfer Successful! TX:", sig);
    } catch (e) {
        console.error("❌ Transfer Failed:", e);
        if (e.logs) console.log("Logs:", e.logs);
    }
}

main();
