#![allow(deprecated)]
use anchor_lang::prelude::*;
use anchor_lang::system_program;
use anchor_spl::token_interface::{
    self, FreezeAccount, Mint, MintTo, ThawAccount, TokenAccount, TokenInterface,
};

declare_id!("D6J4e2nQDFupaitnirnp7HerHw5zdpGwNyRvJUrVu7ji");

#[program]
pub mod list_contract {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, decimals: u8) -> Result<()> {
        let state = &mut ctx.accounts.state;
        state.admin = ctx.accounts.admin.key();
        state.price_usd_cents = 1.0;
        state.sol_price_manual = 100.0;
        state.decimals = decimals;
        state.use_oracle = false;
        state.oracle_feed = Pubkey::default();
        Ok(())
    }

    pub fn update_price(ctx: Context<UpdatePrice>, new_price: f64) -> Result<()> {
        let state = &mut ctx.accounts.state;
        require_keys_eq!(
            ctx.accounts.admin.key(),
            state.admin,
            ListError::Unauthorized
        );
        state.price_usd_cents = new_price;
        Ok(())
    }

    pub fn update_sol_price(ctx: Context<UpdatePrice>, new_price: f64) -> Result<()> {
        let state = &mut ctx.accounts.state;
        require_keys_eq!(
            ctx.accounts.admin.key(),
            state.admin,
            ListError::Unauthorized
        );
        state.sol_price_manual = new_price;
        Ok(())
    }

    pub fn toggle_oracle(
        ctx: Context<UpdateConfig>,
        use_oracle: bool,
        oracle_feed: Option<Pubkey>,
    ) -> Result<()> {
        let state = &mut ctx.accounts.state;
        require_keys_eq!(
            ctx.accounts.admin.key(),
            state.admin,
            ListError::Unauthorized
        );
        state.use_oracle = use_oracle;
        if let Some(feed) = oracle_feed {
            state.oracle_feed = feed;
        }
        Ok(())
    }

    pub fn mint_to_admin(ctx: Context<MintToAdmin>, amount: u64) -> Result<()> {
        let bump = ctx.bumps.mint_authority;
        let seeds: &[&[u8]] = &[b"mint_auth" as &[u8], &[bump] as &[u8]];
        let signer_seeds: &[&[&[u8]]] = &[seeds];

        // 1. Thaw Recipient (Admin)
        token_interface::thaw_account(CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            ThawAccount {
                account: ctx.accounts.recipient.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                authority: ctx.accounts.mint_authority.to_account_info(),
            },
            signer_seeds,
        ))?;

        // 2. Mint
        token_interface::mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                MintTo {
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.recipient.to_account_info(),
                    authority: ctx.accounts.mint_authority.to_account_info(),
                },
                signer_seeds,
            ),
            amount,
        )?;

        // 3. Freeze Recipient
        token_interface::freeze_account(CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            FreezeAccount {
                account: ctx.accounts.recipient.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                authority: ctx.accounts.mint_authority.to_account_info(),
            },
            signer_seeds,
        ))?;

        Ok(())
    }

    pub fn withdraw_sol(ctx: Context<WithdrawSol>, amount: u64) -> Result<()> {
        let treasury = &ctx.accounts.treasury;
        let admin = &ctx.accounts.admin;
        let rent_exemption = Rent::get()?.minimum_balance(treasury.data_len());
        let withdrawable = treasury.lamports().saturating_sub(rent_exemption);
        require!(amount <= withdrawable, ListError::InsufficientFunds);
        **treasury.try_borrow_mut_lamports()? -= amount;
        **admin.try_borrow_mut_lamports()? += amount;
        Ok(())
    }

    pub fn buy_tokens(ctx: Context<BuyTokens>, sol_amount: u64) -> Result<()> {
        let state = &ctx.accounts.state;

        // Determine SOL price (USD)
        let sol_price_usd = if state.use_oracle {
            if let Ok(sol_feed) =
                pyth_sdk_solana::load_price_feed_from_account_info(&ctx.accounts.oracle_account)
            {
                let price_data = sol_feed.get_price_unchecked();
                price_data.price as f64 * 10f64.powi(price_data.expo)
            } else {
                return err!(ListError::OracleDataError);
            }
        } else {
            state.sol_price_manual
        };

        let token_price_usd = state.price_usd_cents / 100.0;
        let tokens_ui = (((sol_amount as f64 / 1_000_000_000.0) * sol_price_usd) / token_price_usd)
            .floor() as u64;
        let mint_amount = tokens_ui * 10u64.pow(state.decimals as u32);

        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.buyer.to_account_info(),
                    to: ctx.accounts.treasury.to_account_info(),
                },
            ),
            sol_amount,
        )?;

        let seeds = &[b"mint_auth" as &[u8], &[ctx.bumps.mint_authority]];
        let signer_seeds: &[&[&[u8]]] = &[&seeds[..]];

        // 1. Thaw Buyer
        token_interface::thaw_account(CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            ThawAccount {
                account: ctx.accounts.buyer_token_account.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                authority: ctx.accounts.mint_authority.to_account_info(),
            },
            signer_seeds,
        ))?;

        // 2. Mint
        token_interface::mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                MintTo {
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.buyer_token_account.to_account_info(),
                    authority: ctx.accounts.mint_authority.to_account_info(),
                },
                signer_seeds,
            ),
            mint_amount,
        )?;

        // 3. Freeze Buyer
        token_interface::freeze_account(CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            FreezeAccount {
                account: ctx.accounts.buyer_token_account.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                authority: ctx.accounts.mint_authority.to_account_info(),
            },
            signer_seeds,
        ))?;

        Ok(())
    }

    pub fn deposit_to_escrow(ctx: Context<DepositToEscrow>, amount: u64) -> Result<()> {
        // Initialize EscrowAuth if needed
        let escrow = &mut ctx.accounts.escrow_auth;
        if escrow.advertiser == Pubkey::default() {
            escrow.advertiser = ctx.accounts.advertiser.key();
            escrow.mint = ctx.accounts.mint.key();
            escrow.bump = ctx.bumps.escrow_auth;
        }

        let decimals = ctx.accounts.mint.decimals;

        // 1. Thaw User Account (Signed by Mint Authority PDA)
        let bump = ctx.bumps.mint_authority;
        let seeds: &[&[u8]] = &[b"mint_auth" as &[u8], &[bump] as &[u8]];
        let signer_seeds: &[&[&[u8]]] = &[seeds];

        if ctx.accounts.advertiser_token_account.is_frozen() {
            token_interface::thaw_account(CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                ThawAccount {
                    account: ctx.accounts.advertiser_token_account.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                    authority: ctx.accounts.mint_authority.to_account_info(),
                },
                signer_seeds,
            ))?;
        }

        // 2. Thaw Escrow Account (Destination)
        if ctx.accounts.escrow_token_account.is_frozen() {
            token_interface::thaw_account(CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                ThawAccount {
                    account: ctx.accounts.escrow_token_account.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                    authority: ctx.accounts.mint_authority.to_account_info(),
                },
                signer_seeds,
            ))?;
        }

        // 3. Transfer Tokens
        anchor_spl::token_2022::transfer_checked(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                anchor_spl::token_2022::TransferChecked {
                    from: ctx.accounts.advertiser_token_account.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.escrow_token_account.to_account_info(),
                    authority: ctx.accounts.advertiser.to_account_info(),
                },
            ),
            amount,
            decimals,
        )?;
        // 4. Freeze User Account (Source)
        token_interface::freeze_account(CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            FreezeAccount {
                account: ctx.accounts.advertiser_token_account.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                authority: ctx.accounts.mint_authority.to_account_info(),
            },
            signer_seeds,
        ))?;

        // 5. Freeze Escrow Account (Destination)
        token_interface::freeze_account(CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            FreezeAccount {
                account: ctx.accounts.escrow_token_account.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                authority: ctx.accounts.mint_authority.to_account_info(),
            },
            signer_seeds,
        ))?;

        Ok(())
    }

    pub fn deposit_to_campaign_escrow(
        ctx: Context<DepositToCampaignEscrow>,
        amount: u64,
    ) -> Result<()> {
        let escrow = &mut ctx.accounts.campaign_escrow_auth;
        if escrow.advertiser == Pubkey::default() {
            escrow.advertiser = ctx.accounts.advertiser.key();
            escrow.campaign = ctx.accounts.campaign.key();
            escrow.mint = ctx.accounts.mint.key();
            escrow.bump = ctx.bumps.campaign_escrow_auth;
        }

        let decimals = ctx.accounts.mint.decimals;

        // 1. Thaw User Account
        let bump = ctx.bumps.mint_authority;
        let seeds: &[&[u8]] = &[b"mint_auth" as &[u8], &[bump] as &[u8]];
        let signer_seeds: &[&[&[u8]]] = &[seeds];

        if ctx.accounts.advertiser_token_account.is_frozen() {
            token_interface::thaw_account(CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                ThawAccount {
                    account: ctx.accounts.advertiser_token_account.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                    authority: ctx.accounts.mint_authority.to_account_info(),
                },
                signer_seeds,
            ))?;
        }

        // 2. Thaw Escrow Account (Destination)
        if ctx.accounts.escrow_token_account.is_frozen() {
            token_interface::thaw_account(CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                ThawAccount {
                    account: ctx.accounts.escrow_token_account.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                    authority: ctx.accounts.mint_authority.to_account_info(),
                },
                signer_seeds,
            ))?;
        }

        // 3. Transfer Tokens
        anchor_spl::token_2022::transfer_checked(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                anchor_spl::token_2022::TransferChecked {
                    from: ctx.accounts.advertiser_token_account.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.escrow_token_account.to_account_info(),
                    authority: ctx.accounts.advertiser.to_account_info(),
                },
            ),
            amount,
            decimals,
        )?;

        // 4. Freeze User Account (Source)
        token_interface::freeze_account(CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            FreezeAccount {
                account: ctx.accounts.advertiser_token_account.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                authority: ctx.accounts.mint_authority.to_account_info(),
            },
            signer_seeds,
        ))?;

        // 5. Freeze Escrow Account (Destination)
        token_interface::freeze_account(CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            FreezeAccount {
                account: ctx.accounts.escrow_token_account.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                authority: ctx.accounts.mint_authority.to_account_info(),
            },
            signer_seeds,
        ))?;

        Ok(())
    }

    pub fn settle_click(ctx: Context<SettleClick>, amount: u64) -> Result<()> {
        // Escrow seeds (owner of the vault)
        let escrow_seeds: &[&[u8]] = &[
            b"escrow",
            ctx.accounts.escrow_auth.advertiser.as_ref(),
            &[ctx.accounts.escrow_auth.bump],
        ];
        let escrow_signer_seeds: &[&[&[u8]]] = &[escrow_seeds];

        // Mint Auth seeds (freeze authority)
        let auth_bump = ctx.bumps.mint_authority;
        let auth_seeds: &[&[u8]] = &[b"mint_auth" as &[u8], &[auth_bump] as &[u8]];
        let auth_signer_seeds: &[&[&[u8]]] = &[auth_seeds];

        let decimals = ctx.accounts.mint.decimals;

        // 1. Thaw Escrow Account (Source) - Only if frozen
        if ctx.accounts.escrow_token_account.is_frozen() {
            token_interface::thaw_account(CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                ThawAccount {
                    account: ctx.accounts.escrow_token_account.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                    authority: ctx.accounts.mint_authority.to_account_info(),
                },
                auth_signer_seeds,
            ))?;
        }

        // 2. Thaw Publisher Account (Destination) - Only if frozen
        if ctx.accounts.publisher_token_account.is_frozen() {
            token_interface::thaw_account(CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                ThawAccount {
                    account: ctx.accounts.publisher_token_account.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                    authority: ctx.accounts.mint_authority.to_account_info(),
                },
                auth_signer_seeds,
            ))?;
        }

        // 3. Transfer Tokens
        let cpi_accounts = anchor_spl::token_2022::TransferChecked {
            from: ctx.accounts.escrow_token_account.to_account_info(),
            mint: ctx.accounts.mint.to_account_info(),
            to: ctx.accounts.publisher_token_account.to_account_info(),
            authority: ctx.accounts.escrow_auth.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();

        // Signed by Escrow Auth (Vault Owner)
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, escrow_signer_seeds);
        anchor_spl::token_2022::transfer_checked(cpi_ctx, amount, decimals)?;

        // 4. Freeze Escrow Account (Source)
        token_interface::freeze_account(CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            FreezeAccount {
                account: ctx.accounts.escrow_token_account.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                authority: ctx.accounts.mint_authority.to_account_info(),
            },
            auth_signer_seeds,
        ))?;

        // 5. Freeze Publisher Account (Destination)
        token_interface::freeze_account(CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            FreezeAccount {
                account: ctx.accounts.publisher_token_account.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                authority: ctx.accounts.mint_authority.to_account_info(),
            },
            auth_signer_seeds,
        ))?;

        Ok(())
    }

    pub fn settle_click_campaign(ctx: Context<SettleClickCampaign>, amount: u64) -> Result<()> {
        // Campaign Escrow seeds
        let escrow_seeds: &[&[u8]] = &[
            b"campaign_escrow",
            ctx.accounts.campaign_escrow_auth.advertiser.as_ref(),
            ctx.accounts.campaign_escrow_auth.campaign.as_ref(),
            &[ctx.accounts.campaign_escrow_auth.bump],
        ];
        let escrow_signer_seeds: &[&[&[u8]]] = &[escrow_seeds];

        // Mint Auth seeds (freeze authority)
        let auth_bump = ctx.bumps.mint_authority;
        let auth_seeds: &[&[u8]] = &[b"mint_auth" as &[u8], &[auth_bump] as &[u8]];
        let auth_signer_seeds: &[&[&[u8]]] = &[auth_seeds];

        let decimals = ctx.accounts.mint.decimals;

        // 1. Thaw Escrow Account - Only if frozen
        if ctx.accounts.escrow_token_account.is_frozen() {
            token_interface::thaw_account(CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                ThawAccount {
                    account: ctx.accounts.escrow_token_account.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                    authority: ctx.accounts.mint_authority.to_account_info(),
                },
                auth_signer_seeds,
            ))?;
        }

        // 2. Thaw Publisher Account - Only if frozen
        if ctx.accounts.publisher_token_account.is_frozen() {
            token_interface::thaw_account(CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                ThawAccount {
                    account: ctx.accounts.publisher_token_account.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                    authority: ctx.accounts.mint_authority.to_account_info(),
                },
                auth_signer_seeds,
            ))?;
        }

        // 3. Transfer
        let cpi_accounts = anchor_spl::token_2022::TransferChecked {
            from: ctx.accounts.escrow_token_account.to_account_info(),
            mint: ctx.accounts.mint.to_account_info(),
            to: ctx.accounts.publisher_token_account.to_account_info(),
            authority: ctx.accounts.campaign_escrow_auth.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, escrow_signer_seeds);
        anchor_spl::token_2022::transfer_checked(cpi_ctx, amount, decimals)?;

        // 4. Freeze Escrow Account
        token_interface::freeze_account(CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            FreezeAccount {
                account: ctx.accounts.escrow_token_account.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                authority: ctx.accounts.mint_authority.to_account_info(),
            },
            auth_signer_seeds,
        ))?;

        // 5. Freeze Publisher Account
        token_interface::freeze_account(CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            FreezeAccount {
                account: ctx.accounts.publisher_token_account.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                authority: ctx.accounts.mint_authority.to_account_info(),
            },
            auth_signer_seeds,
        ))?;

        Ok(())
    }
}

/* ================= ESTRUCTURAS ================= */

#[account]
pub struct State {
    pub admin: Pubkey,
    pub price_usd_cents: f64,
    pub use_oracle: bool,
    pub oracle_feed: Pubkey,
    pub decimals: u8,
    pub sol_price_manual: f64,
}
#[account]
pub struct EscrowAuth {
    pub advertiser: Pubkey,
    pub mint: Pubkey,
    pub bump: u8,
}
#[account]
pub struct CampaignEscrowAuth {
    pub advertiser: Pubkey,
    pub campaign: Pubkey,
    pub mint: Pubkey,
    pub bump: u8,
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(init, payer = admin, space = 8 + 32 + 8 + 1 + 32 + 1 + 8, seeds = [b"state"], bump)]
    pub state: Account<'info, State>,
    #[account(mut)]
    pub admin: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdatePrice<'info> {
    #[account(mut, seeds = [b"state"], bump)]
    pub state: Account<'info, State>,
    pub admin: Signer<'info>,
}

#[derive(Accounts)]
pub struct UpdateConfig<'info> {
    #[account(mut, seeds = [b"state"], bump)]
    pub state: Account<'info, State>,
    pub admin: Signer<'info>,
}

#[derive(Accounts)]
pub struct MintToAdmin<'info> {
    #[account(seeds = [b"state"], bump)]
    pub state: Account<'info, State>,
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(mut)]
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(mut)]
    pub recipient: InterfaceAccount<'info, TokenAccount>,
    /// CHECK: PDA used as mint/freeze authority, validated by seeds
    #[account(seeds = [b"mint_auth"], bump)]
    pub mint_authority: AccountInfo<'info>,
    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct WithdrawSol<'info> {
    #[account(seeds = [b"state"], bump)]
    pub state: Account<'info, State>,
    #[account(mut)]
    pub admin: Signer<'info>,
    /// CHECK: PDA used as treasury, validated by seeds
    #[account(mut, seeds = [b"mint_auth"], bump)]
    pub treasury: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct BuyTokens<'info> {
    #[account(seeds = [b"state"], bump)]
    pub state: Account<'info, State>,
    #[account(mut)]
    pub buyer: Signer<'info>,
    /// CHECK: PDA used as treasury, validated by seeds
    #[account(mut, seeds = [b"mint_auth"], bump)]
    pub treasury: AccountInfo<'info>,
    #[account(mut)]
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(mut)]
    pub buyer_token_account: InterfaceAccount<'info, TokenAccount>,
    /// CHECK: PDA used as mint/freeze authority, validated by seeds
    #[account(seeds = [b"mint_auth"], bump)]
    pub mint_authority: AccountInfo<'info>,
    /// CHECK: Pyth oracle price feed account, validated in instruction logic
    pub oracle_account: AccountInfo<'info>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct DepositToEscrow<'info> {
    #[account(mut)]
    pub state: Account<'info, State>,
    #[account(mut)]
    pub advertiser: Signer<'info>,
    #[account(init_if_needed, payer = advertiser, space = 8 + 32 + 32 + 1, seeds = [b"escrow", advertiser.key().as_ref()], bump)]
    pub escrow_auth: Account<'info, EscrowAuth>,
    #[account(mut)]
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(mut)]
    pub advertiser_token_account: InterfaceAccount<'info, TokenAccount>,
    #[account(mut)]
    pub escrow_token_account: InterfaceAccount<'info, TokenAccount>,
    /// CHECK: PDA used as mint/freeze authority, validated by seeds
    #[account(seeds = [b"mint_auth"], bump)]
    pub mint_authority: AccountInfo<'info>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct DepositToCampaignEscrow<'info> {
    #[account(mut)]
    pub advertiser: Signer<'info>,
    /// CHECK: Campaign identifier account, used only as PDA seed
    pub campaign: AccountInfo<'info>,
    #[account(init_if_needed, payer = advertiser, space = 8 + 32 + 32 + 32 + 1, seeds = [b"campaign_escrow", advertiser.key().as_ref(), campaign.key().as_ref()], bump)]
    pub campaign_escrow_auth: Account<'info, CampaignEscrowAuth>,
    #[account(mut)]
    pub advertiser_token_account: InterfaceAccount<'info, TokenAccount>,
    #[account(mut)]
    pub escrow_token_account: InterfaceAccount<'info, TokenAccount>,
    #[account(mut)]
    pub mint: InterfaceAccount<'info, Mint>,
    /// CHECK: PDA used as mint/freeze authority, validated by seeds
    #[account(seeds = [b"mint_auth"], bump)]
    pub mint_authority: AccountInfo<'info>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SettleClick<'info> {
    #[account(seeds = [b"state"], bump)]
    pub state: Account<'info, State>,
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(mut, seeds = [b"escrow", escrow_auth.advertiser.as_ref()], bump = escrow_auth.bump)]
    pub escrow_auth: Account<'info, EscrowAuth>,
    #[account(mut)]
    pub escrow_token_account: InterfaceAccount<'info, TokenAccount>,
    #[account(mut)]
    pub publisher_token_account: InterfaceAccount<'info, TokenAccount>,
    #[account(mut)]
    pub mint: InterfaceAccount<'info, Mint>,
    /// CHECK: PDA used as mint/freeze authority, validated by seeds
    #[account(seeds = [b"mint_auth"], bump)]
    pub mint_authority: AccountInfo<'info>,
    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct SettleClickCampaign<'info> {
    #[account(seeds = [b"state"], bump)]
    pub state: Account<'info, State>,
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(mut, seeds = [b"campaign_escrow", campaign_escrow_auth.advertiser.as_ref(), campaign_escrow_auth.campaign.as_ref()], bump = campaign_escrow_auth.bump)]
    pub campaign_escrow_auth: Account<'info, CampaignEscrowAuth>,
    #[account(mut)]
    pub escrow_token_account: InterfaceAccount<'info, TokenAccount>,
    #[account(mut)]
    pub publisher_token_account: InterfaceAccount<'info, TokenAccount>,
    #[account(mut)]
    pub mint: InterfaceAccount<'info, Mint>,
    /// CHECK: PDA used as mint/freeze authority, validated by seeds
    #[account(seeds = [b"mint_auth"], bump)]
    pub mint_authority: AccountInfo<'info>,
    pub token_program: Interface<'info, TokenInterface>,
}

#[error_code]
pub enum ListError {
    #[msg("You are not authorized.")]
    Unauthorized,
    #[msg("Invalid amount.")]
    InvalidAmount,
    #[msg("Amount too small.")]
    AmountTooSmall,
    #[msg("Insufficient funds.")]
    InsufficientFunds,
    #[msg("Pyth data error.")]
    OracleDataError,
}
