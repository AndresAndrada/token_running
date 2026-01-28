#![allow(deprecated)]
use anchor_lang::prelude::*;
use anchor_lang::solana_program::program_option::COption;
use anchor_lang::system_program;
use anchor_lang::solana_program::sysvar::instructions::{
    load_current_index_checked, load_instruction_at_checked,
};
// Agregamos TransferHookInstruction aquí
use spl_transfer_hook_interface::instruction::{ExecuteInstruction, TransferHookInstruction}; 
use spl_tlv_account_resolution::{
    account::ExtraAccountMeta, state::ExtraAccountMetaList,
};

use anchor_spl::token_interface::{self, Mint, MintTo, TokenAccount, TokenInterface, Transfer};

// Tu ID original
declare_id!("2NszZaqQu9zn6u51ionxw4MwiRURSaZ1px3bKrds8VAS");

#[program]
pub mod list_contract {
    use super::*;

    /* ================= INIT ================= */

    pub fn initialize(ctx: Context<Initialize>, decimals: u8) -> Result<()> {
        let state = &mut ctx.accounts.state;
        state.admin = ctx.accounts.admin.key();
        state.price_usd_cents = 1.0;
        state.decimals = decimals;
        Ok(())
    }

    pub fn update_price(ctx: Context<UpdatePrice>, new_price: f64) -> Result<()> {
        require_keys_eq!(
            ctx.accounts.admin.key(),
            ctx.accounts.state.admin,
            ListError::Unauthorized
        );
        ctx.accounts.state.price_usd_cents = new_price;
        Ok(())
    }

    /* ================= BUY TOKENS ================= */

    pub fn buy_tokens(ctx: Context<BuyTokens>, sol_amount: u64) -> Result<()> {
        require!(sol_amount > 0, ListError::InvalidAmount);

        let sol = sol_amount as f64 / 1_000_000_000f64;
        let usd_value = sol * 100.0;

        let token_price = ctx.accounts.state.price_usd_cents / 100.0;
        let tokens_ui = (usd_value / token_price).floor() as u64;
        require!(tokens_ui > 0, ListError::AmountTooSmall);

        let scale = 10u64.pow(ctx.accounts.state.decimals as u32);
        let mint_amount = tokens_ui * scale;

        require!(
            ctx.accounts.mint.mint_authority == COption::Some(ctx.accounts.mint_authority.key()),
            ListError::InvalidMintAuthority
        );

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

        token_interface::mint_to(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                MintTo {
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.buyer_token_account.to_account_info(),
                    authority: ctx.accounts.mint_authority.to_account_info(),
                },
            ),
            mint_amount,
        )?;

        Ok(())
    }

    /* ================= ESCROW ================= */

    pub fn deposit_to_escrow(ctx: Context<DepositToEscrow>, amount: u64) -> Result<()> {
        require!(amount > 0, ListError::InvalidAmount);

        let escrow = &mut ctx.accounts.escrow_auth;
        if escrow.advertiser == Pubkey::default() {
            escrow.advertiser = ctx.accounts.advertiser.key();
            escrow.mint = ctx.accounts.mint.key();
            escrow.bump = ctx.bumps.escrow_auth;
        } else {
            require_keys_eq!(
                escrow.advertiser,
                ctx.accounts.advertiser.key(),
                ListError::InvalidEscrowOwner
            );
        }

        token_interface::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.advertiser_token_account.to_account_info(),
                    to: ctx.accounts.escrow_token_account.to_account_info(),
                    authority: ctx.accounts.advertiser.to_account_info(),
                },
            ),
            amount,
        )?;

        Ok(())
    }

    pub fn deposit_to_campaign_escrow(
        ctx: Context<DepositToCampaignEscrow>,
        amount: u64,
    ) -> Result<()> {
        require!(amount > 0, ListError::InvalidAmount);

        let escrow = &mut ctx.accounts.campaign_escrow_auth;
        if escrow.advertiser == Pubkey::default() {
            escrow.advertiser = ctx.accounts.advertiser.key();
            escrow.campaign = ctx.accounts.campaign.key();
            escrow.mint = ctx.accounts.mint.key();
            escrow.bump = ctx.bumps.campaign_escrow_auth;
        }

        token_interface::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.advertiser_token_account.to_account_info(),
                    to: ctx.accounts.escrow_token_account.to_account_info(),
                    authority: ctx.accounts.advertiser.to_account_info(),
                },
            ),
            amount,
        )?;

        Ok(())
    }

    /* ================= SETTLEMENT ================= */

    pub fn settle_click(ctx: Context<SettleClick>, amount: u64) -> Result<()> {
        require!(amount > 0, ListError::InvalidAmount);
        require_keys_eq!(
            ctx.accounts.state.admin,
            ctx.accounts.state.admin,
            ListError::Unauthorized
        );

        let seeds = &[
            b"escrow",
            ctx.accounts.escrow_auth.advertiser.as_ref(),
            &[ctx.accounts.escrow_auth.bump],
        ];

        token_interface::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.escrow_token_account.to_account_info(),
                    to: ctx.accounts.publisher_token_account.to_account_info(),
                    authority: ctx.accounts.escrow_auth.to_account_info(),
                },
                &[seeds],
            ),
            amount,
        )?;

        Ok(())
    }

    pub fn settle_click_campaign(ctx: Context<SettleClickCampaign>, amount: u64) -> Result<()> {
        require!(amount > 0, ListError::InvalidAmount);

        let seeds = &[
            b"campaign_escrow",
            ctx.accounts.campaign_escrow_auth.advertiser.as_ref(),
            ctx.accounts.campaign_escrow_auth.campaign.as_ref(),
            &[ctx.accounts.campaign_escrow_auth.bump],
        ];

        token_interface::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.escrow_token_account.to_account_info(),
                    to: ctx.accounts.publisher_token_account.to_account_info(),
                    authority: ctx.accounts.campaign_escrow_auth.to_account_info(),
                },
                &[seeds],
            ),
            amount,
        )?;

        Ok(())
    }

    /* ================= HOOK ================= */

    pub fn initialize_extra_account_meta_list(
        ctx: Context<InitializeExtraAccountMetaList>,
    ) -> Result<()> {
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

    // CORREGIDO: Usamos TransferHookInstruction::unpack para evitar la dependencia faltante
    pub fn fallback<'info>(
        program_id: &Pubkey,
        accounts: &'info [AccountInfo<'info>],
        data: &[u8],
    ) -> Result<()> {
        // Desempaquetamos la instrucción usando la interfaz estándar
        let instruction = TransferHookInstruction::unpack(data)?;

        // Verificamos si es la instrucción 'Execute'
        match instruction {
            TransferHookInstruction::Execute { amount: _ } => {
                 let instruction_sysvar = accounts.iter().find(|a| a.key == &anchor_lang::solana_program::sysvar::instructions::ID);
                 
                 if let Some(ix_sysvar) = instruction_sysvar {
                     let current_index = load_current_index_checked(ix_sysvar)?;
                     let current_ix = load_instruction_at_checked(current_index as usize, ix_sysvar)?;
                     
                     // Permitir transferencias SOLO si la instrucción principal es de este programa
                     if current_ix.program_id == *program_id {
                         return Ok(());
                     }
                     
                     return Err(ListError::TransferNotAllowed.into());
                 }
                 
                 return Err(ListError::TransferNotAllowed.into());
            },
            _ => return Err(ProgramError::InvalidInstructionData.into())
        }
    }
}

/* ================= STATE ================= */

#[account]
pub struct State {
    pub admin: Pubkey,
    pub price_usd_cents: f64,
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

/* ================= CONTEXTS ================= */

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(init, payer = admin, space = 8 + 32 + 8 + 1, seeds = [b"state"], bump)]
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
pub struct BuyTokens<'info> {
    #[account(mut, seeds = [b"state"], bump)]
    pub state: Account<'info, State>,
    #[account(mut)]
    pub buyer: Signer<'info>,
    /// CHECK: Treasury wallet
    #[account(mut)]
    pub treasury: AccountInfo<'info>,
    #[account(mut)]
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(mut)]
    pub buyer_token_account: InterfaceAccount<'info, TokenAccount>,
    /// CHECK: Mint authority (PDA)
    #[account(seeds = [b"mint_auth"], bump)]
    pub mint_authority: AccountInfo<'info>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct DepositToEscrow<'info> {
    #[account(mut)]
    pub advertiser: Signer<'info>,
    #[account(
        init_if_needed,
        payer = advertiser,
        space = 8 + 32 + 32 + 1,
        seeds = [b"escrow", advertiser.key().as_ref()],
        bump
    )]
    pub escrow_auth: Account<'info, EscrowAuth>,
    #[account(mut)]
    pub advertiser_token_account: InterfaceAccount<'info, TokenAccount>,
    #[account(mut)]
    pub escrow_token_account: InterfaceAccount<'info, TokenAccount>,
    pub mint: InterfaceAccount<'info, Mint>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct DepositToCampaignEscrow<'info> {
    #[account(mut)]
    pub advertiser: Signer<'info>,
    /// CHECK: Campaign ID
    pub campaign: AccountInfo<'info>,
    #[account(
        init_if_needed,
        payer = advertiser,
        space = 8 + 32 + 32 + 32 + 1,
        seeds = [b"campaign_escrow", advertiser.key().as_ref(), campaign.key().as_ref()],
        bump
    )]
    pub campaign_escrow_auth: Account<'info, CampaignEscrowAuth>,
    #[account(mut)]
    pub advertiser_token_account: InterfaceAccount<'info, TokenAccount>,
    #[account(mut)]
    pub escrow_token_account: InterfaceAccount<'info, TokenAccount>,
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
    #[account(
        mut,
        seeds = [b"escrow", escrow_auth.advertiser.as_ref()],
        bump = escrow_auth.bump
    )]
    pub escrow_auth: Account<'info, EscrowAuth>,
    #[account(mut)]
    pub escrow_token_account: InterfaceAccount<'info, TokenAccount>,
    #[account(mut)]
    pub publisher_token_account: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct SettleClickCampaign<'info> {
    #[account(seeds = [b"state"], bump)]
    pub state: Account<'info, State>,
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(
        mut,
        seeds = [b"campaign_escrow", campaign_escrow_auth.advertiser.as_ref(), campaign_escrow_auth.campaign.as_ref()],
        bump = campaign_escrow_auth.bump
    )]
    pub campaign_escrow_auth: Account<'info, CampaignEscrowAuth>,
    #[account(mut)]
    pub escrow_token_account: InterfaceAccount<'info, TokenAccount>,
    #[account(mut)]
    pub publisher_token_account: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct InitializeExtraAccountMetaList<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK: ExtraAccountMetaList PDA, init manually
    #[account(
        mut,
        seeds = [b"extra-account-metas", mint.key().as_ref()],
        bump
    )]
    pub extra_account_meta_list: AccountInfo<'info>,
    pub mint: InterfaceAccount<'info, Mint>,
    /// CHECK: System Program
    pub system_program: Program<'info, System>,
}

#[error_code]
pub enum ListError {
    #[msg("You are not authorized to perform this action.")]
    Unauthorized,
    #[msg("The amount must be greater than zero.")]
    InvalidAmount,
    #[msg("The amount is too small to mint any tokens.")]
    AmountTooSmall,
    #[msg("Invalid mint authority.")]
    InvalidMintAuthority,
    #[msg("Invalid escrow owner.")]
    InvalidEscrowOwner,
    #[msg("Transfer not allowed.")]
    TransferNotAllowed,
}