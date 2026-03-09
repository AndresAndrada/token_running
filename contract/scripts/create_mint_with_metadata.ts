
import * as anchor from "@coral-xyz/anchor";
import { 
    Connection, 
    Keypair, 
    PublicKey, 
    SystemProgram, 
    Transaction, 
    sendAndConfirmTransaction,
    TransactionInstruction
} from "@solana/web3.js";
import { 
    TOKEN_2022_PROGRAM_ID, 
    ExtensionType, 
    createInitializeMintInstruction, 
    createInitializeTransferHookInstruction, 
    createInitializeMetadataPointerInstruction,
    getMintLen,
    LENGTH_SIZE,
    TYPE_SIZE,
} from "@solana/spl-token";
import { 
    createInitializeInstruction, 
    pack, 
    TokenMetadata,
} from "@solana/spl-token-metadata";

// --- CONFIGURATION ---
const PROGRAM_ID = new PublicKey("7zaZpVzVD6FPtQTKjt7Z4vi46sD5uB6YzTYZC1gNRo89"); // Transfer Hook Program
const DECIMALS = 9;

// Metadata to add
const METADATA: TokenMetadata = {
    updateAuthority: PublicKey.default, // Will be updated later
    mint: PublicKey.default, // Will be updated later
    name: "List Token",
    symbol: "LIST",
    uri: "https://raw.githubusercontent.com/solana-developers/opos-asset/main/assets/DeveloperPortal/metadata.json", // Example URI
    additionalMetadata: [["description", "Token with Transfer Hook"]],
};

async function main() {
    // 1. Setup Provider
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);
    const wallet = provider.wallet as anchor.Wallet;
    const connection = provider.connection;

    console.log("🚀 Starting Mint Creation with Metadata and Transfer Hook...");
    console.log("Wallet:", wallet.publicKey.toBase58());

    // 2. Generate Mint Keypair
    const mintKeypair = Keypair.generate();
    const mint = mintKeypair.publicKey;
    console.log("Mint Address:", mint.toBase58());

    // Update metadata with actual keys
    METADATA.updateAuthority = wallet.publicKey;
    METADATA.mint = mint;

    // 3. Calculate Space Required
    // Base Mint Size + Extensions
    // Extensions: TransferHook, MetadataPointer
    const extensions = [ExtensionType.TransferHook, ExtensionType.MetadataPointer];
    const mintLen = getMintLen(extensions);

    // Calculate Metadata Size
    // pack() returns the buffer, we can get length from it
    // But we need to account for the extension header for the metadata itself if it's stored in the mint
    // Actually, Token-2022 stores variable length extensions at the end.
    // We need to add space for the metadata content.
    const metadataLen = pack(METADATA).length;
    
    // Total space: Mint + Extensions + Metadata (including its extension header)
    // The Metadata extension header is TYPE_SIZE + LENGTH_SIZE
    const totalLen = mintLen + TYPE_SIZE + LENGTH_SIZE + metadataLen;

    const lamports = await connection.getMinimumBalanceForRentExemption(totalLen);

    console.log("Space required:", totalLen);
    console.log("Lamports required:", lamports);

    // 4. Create Transaction
    const transaction = new Transaction();

    // A. Create Account
    transaction.add(
        SystemProgram.createAccount({
            fromPubkey: wallet.publicKey,
            newAccountPubkey: mint,
            space: totalLen,
            lamports,
            programId: TOKEN_2022_PROGRAM_ID,
        })
    );

    // B. Initialize Extensions (Order matters!)
    // 1. Transfer Hook
    transaction.add(
        createInitializeTransferHookInstruction(
            mint,
            wallet.publicKey,
            PROGRAM_ID, // Transfer Hook Program ID
            TOKEN_2022_PROGRAM_ID
        )
    );

    // 2. Metadata Pointer (Points to self)
    transaction.add(
        createInitializeMetadataPointerInstruction(
            mint,
            wallet.publicKey,
            mint, // Metadata address (self)
            TOKEN_2022_PROGRAM_ID
        )
    );

    // C. Initialize Mint
    transaction.add(
        createInitializeMintInstruction(
            mint,
            DECIMALS,
            wallet.publicKey,
            wallet.publicKey, // Freeze authority
            TOKEN_2022_PROGRAM_ID
        )
    );

    // D. Initialize Metadata (Writes content to the mint account)
    // Using the instruction from spl-token-metadata
    // Note: The instruction expects the mint to be initialized first (usually)
    // But for extensions, it writes to the allocated space.
    // The `createInitializeInstruction` handles writing the metadata into the extension data.
    transaction.add(
        createInitializeInstruction({
            programId: TOKEN_2022_PROGRAM_ID,
            metadata: mint, // Metadata is stored in the mint account
            updateAuthority: wallet.publicKey,
            mint: mint,
            mintAuthority: wallet.publicKey,
            name: METADATA.name,
            symbol: METADATA.symbol,
            uri: METADATA.uri,
        })
    );

    // E. Initialize ExtraAccountMetaList
    // We need to derive the PDA for the ExtraAccountMetaList
    const [extraAccountMetaListPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("extra-account-metas"), mint.toBuffer()],
        PROGRAM_ID
    );
    console.log("ExtraAccountMetaList PDA:", extraAccountMetaListPDA.toBase58());

    // Manually construct the instruction for initializeExtraAccountMetaList
    // This avoids dependency on IDL being present
    // Discriminator for "initialize_extra_account_meta_list": [92, 197, 174, 197, 41, 124, 19, 3]
    const discriminator = Buffer.from([92, 197, 174, 197, 41, 124, 19, 3]);
    
    const initExtraMetaIx = new TransactionInstruction({
        keys: [
            { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
            { pubkey: extraAccountMetaListPDA, isSigner: false, isWritable: true },
            { pubkey: mint, isSigner: false, isWritable: false },
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        programId: PROGRAM_ID,
        data: discriminator,
    });
    
    transaction.add(initExtraMetaIx);

    console.log("Sending transaction...");
    try {
        const txSig = await sendAndConfirmTransaction(connection, transaction, [wallet.payer, mintKeypair]);
        console.log("✅ Transaction successful:", txSig);
        console.log("Mint created:", mint.toBase58());
    } catch (e) {
        console.error("❌ Error:", e);
    }
}

main().catch(console.error);
