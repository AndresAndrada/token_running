#![allow(deprecated)]
use anchor_lang::prelude::*;
use anchor_lang::solana_program::program::{invoke, invoke_signed};
use anchor_lang::solana_program::sysvar::instructions::{
    load_current_index_checked, load_instruction_at_checked,
};
use anchor_lang::system_program;
use spl_tlv_account_resolution::{account::ExtraAccountMeta, state::ExtraAccountMetaList};
use spl_transfer_hook_interface::instruction::{ExecuteInstruction, TransferHookInstruction};

use anchor_spl::token_interface::{self, Mint, MintTo, TokenAccount, TokenInterface};

declare_id!("7zaZpVzVD6FPtQTKjt7Z4vi46sD5uB6YzTYZC1gNRo89");

#[program]
pub mod list_contract {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, decimals: u8) -> Result<()> {
        let state = &mut ctx.accounts.state;
        state.admin = ctx.accounts.admin.key();
        state.price_usd_cents = 1.0;
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
        token_interface::mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                MintTo {
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.recipient.to_account_info(),
                    authority: ctx.accounts.mint_authority.to_account_info(),
                },
                &[&seeds[..]],
            ),
            amount,
        )?;
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
        let sol_price_usd = if let Ok(sol_feed) =
            pyth_sdk_solana::load_price_feed_from_account_info(&ctx.accounts.oracle_account)
        {
            let price_data = sol_feed.get_price_unchecked();
            price_data.price as f64 * 10f64.powi(price_data.expo)
        } else {
            100.0
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
        token_interface::mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                MintTo {
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.buyer_token_account.to_account_info(),
                    authority: ctx.accounts.mint_authority.to_account_info(),
                },
                &[&seeds[..]],
            ),
            mint_amount,
        )?;
        Ok(())
    }

    pub fn deposit_to_escrow<'info>(
        ctx: Context<'_, '_, '_, 'info, DepositToEscrow<'info>>,
        amount: u64,
    ) -> Result<()> {
        msg!("Program ID: {}", ctx.program_id);
        msg!("Remaining accounts: {}", ctx.remaining_accounts.len());
        for (i, acc) in ctx.remaining_accounts.iter().enumerate() {
            msg!(
                "Remaining[{}]: {} signer:{} writable:{}",
                i,
                acc.key,
                acc.is_signer,
                acc.is_writable
            );
        }

        let decimals = ctx.accounts.mint.decimals;

        let cpi_accounts = anchor_spl::token_2022::TransferChecked {
            from: ctx.accounts.advertiser_token_account.to_account_info(),
            mint: ctx.accounts.mint.to_account_info(),
            to: ctx.accounts.escrow_token_account.to_account_info(),
            authority: ctx.accounts.advertiser.to_account_info(),
        };

        let cpi_program = ctx.accounts.token_program.to_account_info();

        // IMPORTANT: Ensure remaining_accounts contains [ExtraMetaList, HookProgram, SysvarInstructions]
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts)
            .with_remaining_accounts(ctx.remaining_accounts.to_vec());

        anchor_spl::token_2022::transfer_checked(cpi_ctx, amount, decimals)?;

        Ok(())
    }

    pub fn deposit_to_campaign_escrow<'info>(
        ctx: Context<'_, '_, '_, 'info, DepositToCampaignEscrow<'info>>,
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
        let cpi_accounts = anchor_spl::token_2022::TransferChecked {
            from: ctx.accounts.advertiser_token_account.to_account_info(),
            mint: ctx.accounts.mint.to_account_info(),
            to: ctx.accounts.escrow_token_account.to_account_info(),
            authority: ctx.accounts.advertiser.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts)
            .with_remaining_accounts(ctx.remaining_accounts.to_vec());
        anchor_spl::token_2022::transfer_checked(cpi_ctx, amount, decimals)?;
        Ok(())
    }

    pub fn settle_click<'info>(
        ctx: Context<'_, '_, '_, 'info, SettleClick<'info>>,
        amount: u64,
    ) -> Result<()> {
        let seeds: &[&[u8]] = &[
            b"escrow",
            ctx.accounts.escrow_auth.advertiser.as_ref(),
            &[ctx.accounts.escrow_auth.bump],
        ];
        let decimals = ctx.accounts.mint.decimals;
        let cpi_accounts = anchor_spl::token_2022::TransferChecked {
            from: ctx.accounts.escrow_token_account.to_account_info(),
            mint: ctx.accounts.mint.to_account_info(),
            to: ctx.accounts.publisher_token_account.to_account_info(),
            authority: ctx.accounts.escrow_auth.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let signer_seeds: &[&[&[u8]]] = &[seeds];
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, &signer_seeds)
            .with_remaining_accounts(ctx.remaining_accounts.to_vec());
        anchor_spl::token_2022::transfer_checked(cpi_ctx, amount, decimals)?;
        Ok(())
    }

    pub fn settle_click_campaign<'info>(
        ctx: Context<'_, '_, '_, 'info, SettleClickCampaign<'info>>,
        amount: u64,
    ) -> Result<()> {
        let seeds: &[&[u8]] = &[
            b"campaign_escrow",
            ctx.accounts.campaign_escrow_auth.advertiser.as_ref(),
            ctx.accounts.campaign_escrow_auth.campaign.as_ref(),
            &[ctx.accounts.campaign_escrow_auth.bump],
        ];
        let decimals = ctx.accounts.mint.decimals;
        let cpi_accounts = anchor_spl::token_2022::TransferChecked {
            from: ctx.accounts.escrow_token_account.to_account_info(),
            mint: ctx.accounts.mint.to_account_info(),
            to: ctx.accounts.publisher_token_account.to_account_info(),
            authority: ctx.accounts.campaign_escrow_auth.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let signer_seeds: &[&[&[u8]]] = &[seeds];
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, &signer_seeds)
            .with_remaining_accounts(ctx.remaining_accounts.to_vec());
        anchor_spl::token_2022::transfer_checked(cpi_ctx, amount, decimals)?;
        Ok(())
    }

    pub fn initialize_extra_account_meta_list(
        ctx: Context<InitializeExtraAccountMetaList>,
    ) -> Result<()> {
        // Define the extra accounts required by the hook
        // 1. Sysvar Instructions (required to check the instruction introspection)
        // Note: The Hook Program itself is required for CPI but usually doesn't need to be in the meta list
        // unless the hook expects it as an argument. Token2022 finds the hook program by ID.
        let account_metas = vec![
            ExtraAccountMeta::new_with_pubkey(
                &anchor_lang::solana_program::sysvar::instructions::ID,
                false,
                false,
            )?,
        ];

        let account_data_size = ExtraAccountMetaList::size_of(account_metas.len())? as u64;
        let lamports = Rent::get()?.minimum_balance(account_data_size as usize);
        let mint = ctx.accounts.mint.key();
        let signer_seeds: &[&[&[u8]]] = &[&[
            b"extra-account-metas",
            mint.as_ref(),
            &[ctx.bumps.extra_account_meta_list],
        ]];

        anchor_lang::system_program::create_account(
            CpiContext::new_with_signer(
                ctx.accounts.system_program.to_account_info(),
                anchor_lang::system_program::CreateAccount {
                    from: ctx.accounts.payer.to_account_info(),
                    to: ctx.accounts.extra_account_meta_list.to_account_info(),
                },
                signer_seeds,
            ),
            lamports,
            account_data_size,
            &ctx.program_id,
        )?;
        let mut data = ctx.accounts.extra_account_meta_list.try_borrow_mut_data()?;
        ExtraAccountMetaList::init::<ExecuteInstruction>(&mut data, &account_metas)?;
        Ok(())
    }

    pub fn close_extra_account_meta_list(ctx: Context<CloseExtraAccountMetaList>) -> Result<()> {
        let dest_lamports = ctx.accounts.payer.lamports();
        **ctx.accounts.payer.lamports.borrow_mut() = dest_lamports
            .checked_add(ctx.accounts.extra_account_meta_list.lamports())
            .unwrap();
        **ctx.accounts.extra_account_meta_list.lamports.borrow_mut() = 0;
        Ok(())
    }

    pub fn fallback<'info>(
        program_id: &Pubkey,
        accounts: &'info [AccountInfo<'info>],
        data: &[u8],
    ) -> Result<()> {
        let instruction = TransferHookInstruction::unpack(data)?;
        match instruction {
            TransferHookInstruction::Execute { amount: _ } => {
                msg!("Hook executed. Accounts: {}", accounts.len());

                // VALIDACIÓN: Solo permitir transferencias iniciadas por este programa
                let instruction_sysvar = accounts
                    .iter()
                    .find(|a| a.key == &anchor_lang::solana_program::sysvar::instructions::ID);

                if let Some(ix_sysvar) = instruction_sysvar {
                    // FIX: Verificar la instrucción RAÍZ (Top-Level), no la actual (current_index)
                    // Si el usuario llama a depositToEscrow, esa es la instrucción 0.
                    // Si el usuario llama a transferChecked directo, esa es la instrucción 0.
                    let root_ix = load_instruction_at_checked(0, ix_sysvar)?;

                    // Si la instrucción raíz es de este programa, permitir.
                    if root_ix.program_id == *program_id {
                        msg!("Transfer allowed: Root instruction is our program.");
                        return Ok(());
                    }
                    
                    msg!("Root Program ID: {}", root_ix.program_id);
                    msg!("Expected Program ID: {}", program_id);
                }

                msg!("Transfer blocked: Not initiated by program.");
                return Err(ListError::TransferNotAllowed.into());
            }
            _ => return Err(ProgramError::InvalidInstructionData.into()),
        }
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
    #[account(init, payer = admin, space = 8 + 32 + 8 + 1 + 32 + 1, seeds = [b"state"], bump)]
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
    #[account(mut, seeds = [b"mint_auth"], bump)]
    pub treasury: AccountInfo<'info>,
    #[account(mut)]
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(mut)]
    pub buyer_token_account: InterfaceAccount<'info, TokenAccount>,
    #[account(seeds = [b"mint_auth"], bump)]
    pub mint_authority: AccountInfo<'info>,
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
    pub escrow_auth: AccountInfo<'info>,
    #[account(mut)]
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(mut)]
    pub advertiser_token_account: InterfaceAccount<'info, TokenAccount>,
    #[account(mut)]
    pub escrow_token_account: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct DepositToCampaignEscrow<'info> {
    #[account(mut)]
    pub advertiser: Signer<'info>,
    pub campaign: AccountInfo<'info>,
    #[account(init_if_needed, payer = advertiser, space = 8 + 32 + 32 + 32 + 1, seeds = [b"campaign_escrow", advertiser.key().as_ref(), campaign.key().as_ref()], bump)]
    pub campaign_escrow_auth: Account<'info, CampaignEscrowAuth>,
    #[account(mut)]
    pub advertiser_token_account: InterfaceAccount<'info, TokenAccount>,
    #[account(mut)]
    pub escrow_token_account: InterfaceAccount<'info, TokenAccount>,
    #[account(mut)]
    pub mint: InterfaceAccount<'info, Mint>,
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
    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct InitializeExtraAccountMetaList<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, seeds = [b"extra-account-metas", mint.key().as_ref()], bump)]
    pub extra_account_meta_list: AccountInfo<'info>,
    pub mint: InterfaceAccount<'info, Mint>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CloseExtraAccountMetaList<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, seeds = [b"extra-account-metas", mint.key().as_ref()], bump)]
    pub extra_account_meta_list: AccountInfo<'info>,
    pub mint: InterfaceAccount<'info, Mint>,
}

#[error_code]
pub enum ListError {
    #[msg("No estás autorizado.")]
    Unauthorized,
    #[msg("Monto inválido.")]
    InvalidAmount,
    #[msg("Monto muy pequeño.")]
    AmountTooSmall,
    #[msg("Transferencia bloqueada por Hook.")]
    TransferNotAllowed,
    #[msg("Fondos insuficientes.")]
    InsufficientFunds,
    #[msg("Error en datos de Pyth.")]
    OracleDataError,
}
