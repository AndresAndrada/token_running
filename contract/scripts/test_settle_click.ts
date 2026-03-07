
import * as anchor from "@coral-xyz/anchor";
import { BN } from "@coral-xyz/anchor";
import {
    Connection,
    Keypair,
    PublicKey,
    SystemProgram,
    Transaction,
    TransactionInstruction,
    sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
    ExtensionType,
    createInitializeMintInstruction,
    createInitializeTransferHookInstruction,
    createInitializeMetadataPointerInstruction,
    getMintLen,
    TOKEN_2022_PROGRAM_ID,
    getAssociatedTokenAddressSync,
    createAssociatedTokenAccountInstruction,
    createMintToInstruction,
    createFreezeAccountInstruction,
    createSetAuthorityInstruction,
    AuthorityType,
    ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import fs from "fs";
import { sha256 } from "@noble/hashes/sha256";
import path from "path";

// --- CONFIGURACIÓN ---
// Adjust path if needed. Assuming running from c:\Users\Pc\Desktop\list-token\contract
const WALLET_PATH = path.resolve(__dirname, "../phantom-admin.json"); 
const PROGRAM_ID = new PublicKey("7zaZpVzVD6FPtQTKjt7Z4vi46sD5uB6YzTYZC1gNRo89");
const DECIMALS = 6;
const MINT_AMOUNT = 1000 * 10 ** DECIMALS;
const DEPOSIT_AMOUNT = 50 * 10 ** DECIMALS;
const CLICK_AMOUNT = 1 * 10 ** DECIMALS;

// --- UTILS ---
function loadWallet(filePath: string): Keypair {
    const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    return Keypair.fromSecretKey(new Uint8Array(data));
}

function getDiscriminator(name: string): Buffer {
    const preimage = `global:${name}`;
    const hash = sha256(new TextEncoder().encode(preimage));
    return Buffer.from(hash.slice(0, 8));
}

async function main() {
    console.log("🚀 Iniciando Test de Settle Click (Manual Mode)...");

    // 1. Setup
    const connection = new Connection("https://api.devnet.solana.com", "confirmed");
    let wallet: Keypair;
    try {
        wallet = loadWallet(WALLET_PATH);
    } catch (e) {
        console.warn("⚠️ No se pudo cargar phantom-admin.json, usando Keypair temporal.");
        wallet = Keypair.generate();
        // Airdrop if using temp wallet (might fail on devnet if rate limited)
        const sig = await connection.requestAirdrop(wallet.publicKey, 1e9);
        await connection.confirmTransaction(sig);
    }
    
    const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(wallet), {
        commitment: "confirmed",
    });
    anchor.setProvider(provider);

    console.log("Wallet:", wallet.publicKey.toString());

    // 2. Crear Nuevo Mint con Transfer Hook (Para tener un entorno limpio)
    const mintKeypair = Keypair.generate();
    const mint = mintKeypair.publicKey;
    console.log("🆕 Nuevo Mint:", mint.toString());

    // PDAs
    const [extraAccountMetaListPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("extra-account-metas"), mint.toBuffer()],
        PROGRAM_ID
    );
    const [escrowAuthPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("escrow"), wallet.publicKey.toBuffer()],
        PROGRAM_ID
    );
    const [statePDA] = PublicKey.findProgramAddressSync([Buffer.from("state")], PROGRAM_ID);
    const [mintAuthPDA] = PublicKey.findProgramAddressSync([Buffer.from("mint_auth")], PROGRAM_ID);

    // ATAs
    const userATA = getAssociatedTokenAddressSync(mint, wallet.publicKey, false, TOKEN_2022_PROGRAM_ID);
    const escrowATA = getAssociatedTokenAddressSync(mint, escrowAuthPDA, true, TOKEN_2022_PROGRAM_ID);
    
    // Publisher (Treasury/Destination) Setup
    const publisherKeypair = Keypair.generate();
    const publisherATA = getAssociatedTokenAddressSync(mint, publisherKeypair.publicKey, false, TOKEN_2022_PROGRAM_ID);
    console.log("Publisher:", publisherKeypair.publicKey.toString());

    // Create Mint
    // NOT using TransferHook as it doesn't seem implemented in the contract (no execute instruction)
    // We set FreezeAuthority to WALLET initially to freeze accounts, then transfer to PDA.
    const mintLen = getMintLen([]); // No extensions needed for basic freeze auth
    const lamports = await connection.getMinimumBalanceForRentExemption(mintLen);

    const createMintTx = new Transaction().add(
        SystemProgram.createAccount({
            fromPubkey: wallet.publicKey,
            newAccountPubkey: mint,
            space: mintLen,
            lamports,
            programId: TOKEN_2022_PROGRAM_ID,
        }),
        createInitializeMintInstruction(
            mint,
            DECIMALS,
            wallet.publicKey, // Mint Authority
            wallet.publicKey, // Freeze Authority (TEMPORARY: Wallet)
            TOKEN_2022_PROGRAM_ID
        )
    );
    await sendAndConfirmTransaction(connection, createMintTx, [wallet, mintKeypair]);
    console.log("✅ Mint creado (FreezeAuth = Wallet temporal).");

    // 3. Initialize ExtraAccountMetaList - SKIPPED
    // 4. Initialize State (if needed)
    const stateInfo = await connection.getAccountInfo(statePDA);
    if (!stateInfo) {
        console.log("⚠️ State no inicializado. Inicializando...");
        const initDiscriminator = getDiscriminator("initialize");
        const decimalsBuffer = Buffer.alloc(1);
        decimalsBuffer.writeUInt8(DECIMALS, 0);
        const initData = Buffer.concat([initDiscriminator, decimalsBuffer]);
        const initIx = new TransactionInstruction({
            keys: [
                { pubkey: statePDA, isSigner: false, isWritable: true },
                { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
                { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
            ],
            programId: PROGRAM_ID,
            data: initData,
        });
        await sendAndConfirmTransaction(connection, new Transaction().add(initIx), [wallet]);
        console.log("✅ State inicializado.");
    }

    // 5. Mint tokens to User (Advertiser) & Create Escrow ATA
    console.log("💰 Minteando tokens y preparando cuentas...");
    
    // Create Escrow ATA manually now
    const prepareTx = new Transaction().add(
        createAssociatedTokenAccountInstruction(
            wallet.publicKey,
            userATA,
            wallet.publicKey,
            mint,
            TOKEN_2022_PROGRAM_ID
        ),
        createAssociatedTokenAccountInstruction(
            wallet.publicKey,
            escrowATA,
            escrowAuthPDA,
            mint,
            TOKEN_2022_PROGRAM_ID
        ),
        createMintToInstruction(
            mint,
            userATA,
            wallet.publicKey,
            MINT_AMOUNT,
            [],
            TOKEN_2022_PROGRAM_ID
        )
    );
    await sendAndConfirmTransaction(connection, prepareTx, [wallet]);
    console.log("✅ Tokens minteados y cuentas creadas.");
    
    // 6. Freeze Accounts (User & Escrow)
    // The contract expects accounts to be frozen for deposit_to_escrow (it blindly calls thaw)
    console.log("❄️ Congelando cuentas para simular estado válido...");
    const freezeTx = new Transaction().add(
        createFreezeAccountInstruction(
            userATA,
            mint,
            wallet.publicKey,
            [],
            TOKEN_2022_PROGRAM_ID
        ),
        createFreezeAccountInstruction(
            escrowATA,
            mint,
            wallet.publicKey,
            [],
            TOKEN_2022_PROGRAM_ID
        )
    );
    await sendAndConfirmTransaction(connection, freezeTx, [wallet]);
    console.log("✅ Cuentas congeladas.");

    // 7. Transfer Freeze Authority to PDA
    console.log("🔑 Transfiriendo Freeze Authority al PDA del contrato...");
    const authTx = new Transaction().add(
        createSetAuthorityInstruction(
            mint,
            wallet.publicKey,
            AuthorityType.FreezeAccount,
            mintAuthPDA,
            [],
            TOKEN_2022_PROGRAM_ID
        )
    );
    await sendAndConfirmTransaction(connection, authTx, [wallet]);
    console.log("✅ Freeze Authority transferido al PDA.");

    // 8. Create Publisher ATA (Destination)
    const pubAtaTx = new Transaction().add(
        createAssociatedTokenAccountInstruction(
            wallet.publicKey,
            publisherATA,
            publisherKeypair.publicKey,
            mint,
            TOKEN_2022_PROGRAM_ID
        )
    );
    await sendAndConfirmTransaction(connection, pubAtaTx, [wallet]);
    console.log("✅ Publisher ATA creada.");


    // ================= TEST SETTLE CLICK (Advertiser Escrow -> Publisher) =================

    // 9. Deposit to Escrow
    console.log("📥 Depositando a Escrow (Advertiser)...");
    
    // Escrow ATA already created and frozen above.

    const depositDiscriminator = getDiscriminator("deposit_to_escrow");
    const amountBuffer = new BN(DEPOSIT_AMOUNT).toArrayLike(Buffer, "le", 8);
    const depositData = Buffer.concat([depositDiscriminator, amountBuffer]);
    
    const depositIx = new TransactionInstruction({
        keys: [
            { pubkey: statePDA, isSigner: false, isWritable: true },
            { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
            { pubkey: escrowAuthPDA, isSigner: false, isWritable: true },
            { pubkey: mint, isSigner: false, isWritable: true },
            { pubkey: userATA, isSigner: false, isWritable: true },
            { pubkey: escrowATA, isSigner: false, isWritable: true },
            { pubkey: mintAuthPDA, isSigner: false, isWritable: false },
            { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        programId: PROGRAM_ID,
        data: depositData,
    });
    await sendAndConfirmTransaction(connection, new Transaction().add(depositIx), [wallet]);
    console.log("✅ Depósito a Escrow exitoso.");

    // 8. Execute Settle Click
    console.log("⚡ Ejecutando settle_click...");
    
    const settleDiscriminator = getDiscriminator("settle_click");
    const clickAmountBuffer = new BN(CLICK_AMOUNT).toArrayLike(Buffer, "le", 8);
    const settleData = Buffer.concat([settleDiscriminator, clickAmountBuffer]);

    const settleIx = new TransactionInstruction({
        keys: [
            { pubkey: statePDA, isSigner: false, isWritable: false },
            { pubkey: wallet.publicKey, isSigner: true, isWritable: true }, // admin
            { pubkey: escrowAuthPDA, isSigner: false, isWritable: true },
            { pubkey: escrowATA, isSigner: false, isWritable: true },
            { pubkey: publisherATA, isSigner: false, isWritable: true },
            { pubkey: mint, isSigner: false, isWritable: true },
            { pubkey: mintAuthPDA, isSigner: false, isWritable: false },
            { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
        ],
        programId: PROGRAM_ID,
        data: settleData,
    });

    try {
        const tx = await sendAndConfirmTransaction(connection, new Transaction().add(settleIx), [wallet]);
        console.log("✅ settle_click exitoso! TX:", tx);
    } catch (e: any) {
        console.error("❌ settle_click falló:", e);
        if (e.logs) console.log(e.logs);
    }

    // ================= TEST SETTLE CLICK CAMPAIGN =================
    
    console.log("--- Iniciando Test de Campaign Escrow ---");
    
    // Campaign setup
    const campaignKeypair = Keypair.generate();
    const [campaignEscrowAuthPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("campaign_escrow"), wallet.publicKey.toBuffer(), campaignKeypair.publicKey.toBuffer()],
        PROGRAM_ID
    );
    const campaignEscrowATA = getAssociatedTokenAddressSync(mint, campaignEscrowAuthPDA, true, TOKEN_2022_PROGRAM_ID);
    
    // Create Campaign Escrow ATA
    const createCampEscrowAtaTx = new Transaction().add(
        createAssociatedTokenAccountInstruction(
            wallet.publicKey,
            campaignEscrowATA,
            campaignEscrowAuthPDA,
            mint,
            TOKEN_2022_PROGRAM_ID
        )
    );
    await sendAndConfirmTransaction(connection, createCampEscrowAtaTx, [wallet]);

    // 9. Deposit to Campaign Escrow
    console.log("📥 Depositando a Campaign Escrow...");
    
    const depositCampDiscriminator = getDiscriminator("deposit_to_campaign_escrow");
    const depositCampData = Buffer.concat([depositCampDiscriminator, amountBuffer]); // reuse DEPOSIT_AMOUNT

    const depositCampIx = new TransactionInstruction({
        keys: [
            { pubkey: wallet.publicKey, isSigner: true, isWritable: true }, // advertiser
            { pubkey: campaignKeypair.publicKey, isSigner: false, isWritable: false }, // campaign
            { pubkey: campaignEscrowAuthPDA, isSigner: false, isWritable: true }, // auth init_if_needed
            { pubkey: userATA, isSigner: false, isWritable: true },
            { pubkey: campaignEscrowATA, isSigner: false, isWritable: true },
            { pubkey: mint, isSigner: false, isWritable: true },
            { pubkey: mintAuthPDA, isSigner: false, isWritable: false },
            { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        programId: PROGRAM_ID,
        data: depositCampData,
    });

    try {
        await sendAndConfirmTransaction(connection, new Transaction().add(depositCampIx), [wallet]);
        console.log("✅ Depósito a Campaign Escrow exitoso.");
    } catch (e: any) {
        console.error("❌ Depósito a Campaign Escrow falló:", e);
        if (e.logs) console.log(e.logs);
        return; // Stop if deposit fails
    }

    // 10. Execute Settle Click Campaign
    console.log("⚡ Ejecutando settle_click_campaign...");
    
    const settleCampDiscriminator = getDiscriminator("settle_click_campaign");
    const settleCampData = Buffer.concat([settleCampDiscriminator, clickAmountBuffer]);

    const settleCampIx = new TransactionInstruction({
        keys: [
            { pubkey: statePDA, isSigner: false, isWritable: false },
            { pubkey: wallet.publicKey, isSigner: true, isWritable: true }, // admin
            { pubkey: campaignEscrowAuthPDA, isSigner: false, isWritable: true },
            { pubkey: campaignEscrowATA, isSigner: false, isWritable: true },
            { pubkey: publisherATA, isSigner: false, isWritable: true },
            { pubkey: mint, isSigner: false, isWritable: true },
            { pubkey: mintAuthPDA, isSigner: false, isWritable: false },
            { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
        ],
        programId: PROGRAM_ID,
        data: settleCampData,
    });

    try {
        const tx = await sendAndConfirmTransaction(connection, new Transaction().add(settleCampIx), [wallet]);
        console.log("✅ settle_click_campaign exitoso! TX:", tx);
    } catch (e: any) {
        console.error("❌ settle_click_campaign falló:", e);
        if (e.logs) console.log(e.logs);
    }
}

main().catch(console.error);
