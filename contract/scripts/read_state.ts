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

  const state = await program.account.state.fetch(statePda);

  console.log("📦 State:");
  console.log(state);
}

main().catch(console.error);
