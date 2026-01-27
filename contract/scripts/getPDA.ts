const anchor = require("@coral-xyz/anchor");

const programId = new anchor.web3.PublicKey("ERG6NmpTDnceeQiEG1KbyKj6THdB9oWrHwQBs4V8aDdF");
const [statePda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("state_v2")], // Seed utilizado en el contrato
    programId
);

console.log("PDA del estado inicializado:", statePda.toBase58());