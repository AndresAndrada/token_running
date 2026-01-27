import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { ListContract } from "../target/types/list_contract";

const provider = anchor.AnchorProvider.env();
anchor.setProvider(provider);

const program = anchor.workspace.ListContract as Program<ListContract>;

async function main() {

  const [statePda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("state_v2")],
    program.programId
  );
  console.log("🚀 ~ main ~ statePda:", statePda.toBase58());

  const tx = await program.methods
    .initialize(6) // Decimals como primer parámetro
    .accounts({
      state: statePda,
      admin: provider.wallet.publicKey,
      systemProgram: anchor.web3.SystemProgram.programId,
    })
    .rpc();

  console.log("✅ Initialize OK");
  console.log("Tx:", tx);
}

main().catch(console.error);