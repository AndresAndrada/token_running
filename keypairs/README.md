

# Usage


## Devnet token

```bash
# only if its not created
solana-keygen new --outfile ./keypairs/mint-authority.json


solana config set --url devnet
solana config set --keypair ./keypairs/mint-authority.json


# get current config

solana config get


# Get airdrop SOL to wallet (devnet)
solana airdrop 5


spl-token create-token --decimals 9


# Create the token (mint)

spl-token create-token


# This outputs the mint address (say TOKEN_MINT_ADDR). You can optionally set decimals:

spl-token create-token --decimals 9

# Creating token FLKaeiqS4o5F2A6p4Mt61VnJWSEYwMsTnz8HHeEFvMuk under program TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA

# Address:  FLKaeiqS4o5F2A6p4Mt61VnJWSEYwMsTnz8HHeEFvMuk
#Decimals:  9

# Signature: 3YD1rp6QMVBB7anWRBdyzi1ENj3ro5NNdpw8JNmXCXnguugwtPkk49KxWtoCEDQ4qL6rj3LAdMmW6X1hwkGFkZpr


# Create a token account to hold the token
spl-token create-account <TOKEN_MINT_ADDR> 
# TOKEN_MINT_ADDR=  (FLKaeiqS4o5F2A6p4Mt61VnJWSEYwMsTnz8HHeEFvMuk)
# Creating account 2EsakMYSDUr84VYXvpxr2Vn92LrQuLDwxbk9EpiYTTRj
# Signature: 2otwgHYBtVAMFvtHt5aXG2BC8186R9ikwwnVUcQVooDGDuzdUpfXZHhid1odpvGV35pZX4QHZ3N1H25gXXYyFBqj

# Mint tokens

spl-token mint <TOKEN_MINT_ADDR> <AMOUNT> <TOKEN_ACCOUNT_ADDR>

# Example: mint 1,000,000 tokens:

spl-token mint <TOKEN_MINT_ADDR> 1000000

# (By default to your associated token account.)

# Verify balance

spl-token balance <TOKEN_ACCOUNT_ADDR> (FLKaeiqS4o5F2A6p4Mt61VnJWSEYwMsTnz8HHeEFvMuk)

```


## Production Token


```bash 

# Use a secure keypair, better backup

# Do not use a keypair that is stored in a public or insecure place. Use hardware wallet if possible. Backup seed phrase, etc. The JSON with private key must be kept secret.

# Switch config to mainnet

solana config set --url https://api.mainnet-beta.solana.com
solana config set --keypair ./keypairs/mint-authority-mainnet.json


# Fund wallet with real SOL



# Create mint (token) as before

# spl-token create-token --decimals <your decimals>
# Create token account, mint supply
# Set metadata properly
# Use a well-trusted storage for logos/URIs, test the metadata program, verify on block explorers.

# Lock authorities / remove or transfer mint authority

# Once you're satisfied with the token supply, you’ll probably want to disable further minting (if supply is fixed) by setting mint authority to None:

spl-token authorize <TOKEN_MINT_ADDR> mint --disable


# Similarly, you may want to set freeze authority etc. also to None to prevent misuse.

# Remember to check fees, consensus, etc.
```