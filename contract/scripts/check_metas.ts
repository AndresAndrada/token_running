
import { Connection, PublicKey } from "@solana/web3.js";
import { getExtraAccountMetaAddress, getExtraAccountMetas } from "@solana/spl-token";

const connection = new Connection("https://api.devnet.solana.com", "confirmed");
const MINT = new PublicKey("9ro1XPWvWq4kpBnKGbCjDfsTJmf2nfXvmtzhYbPWf4sF"); // Mint from last run
const PROGRAM_ID = new PublicKey("7zaZpVzVD6FPtQTKjt7Z4vi46sD5uB6YzTYZC1gNRo89");

async function check() {
    const extraAccountMetaListPDA = getExtraAccountMetaAddress(MINT, PROGRAM_ID);
    console.log("ExtraAccountMetaList PDA:", extraAccountMetaListPDA.toString());

    const accountInfo = await connection.getAccountInfo(extraAccountMetaListPDA);
    if (!accountInfo) {
        console.log("Account not found!");
        return;
    }

    console.log("Account found. Data length:", accountInfo.data.length);

    try {
        const metas = await getExtraAccountMetas(connection, MINT, PROGRAM_ID);
        console.log("Metas:", metas);
        metas.forEach((meta, i) => {
            console.log(`Meta ${i}: Pubkey=${meta.addressConfig.toString()}, IsSigner=${meta.isSigner}, IsWritable=${meta.isWritable}`);
        });
    } catch (e) {
        console.log("Error decoding metas:", e);
    }
}

check();
