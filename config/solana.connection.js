const anchor = require("@project-serum/anchor");
const fs = require("fs");
const path = require("path");
const web3 = require("@solana/web3.js");
const {Token, TOKEN_PROGRAM_ID} = require("@solana/spl-token");
const DB = require('../db/db-connection');
const emailService = require('../email/email');

/*
    Define Constants
*/
const APP_ROOT = path.resolve(__dirname);
const TOKEN_ADDRESS = 'DotdtxnoYiTELUjGnjXorv5Xy2kngLRiaydYrBzUxHNL';
const connection = new web3.Connection("https://api.testnet.solana.com");
const TOKEN_MINT = new web3.PublicKey(TOKEN_ADDRESS);
const MIN_TOKEN_BALANCE = 100;
const REFILL_TOKEN_BALANCE = 500;
const REFILL_SOL_BALANCE = 0.01;
const TOKEN_PRICE = 0.02; // 2 cent
const PLAY_PRICE = 0.1;
const TOKEN_CURRENCY = 'USD';
const LAMPORTS_PER_TOKEN = 100000;
const SELF_WALLET_TYPE = 'big';
const BOT_PLAY_CREDIT = 100000;
// 1000 Min, 1 token = 1 cent
// Raydium


const tokenWallet = anchor.web3.Keypair.fromSecretKey(
    Buffer.from(
        JSON.parse(
            fs.readFileSync(APP_ROOT + "/id.json",
                {
                    encoding: "utf-8"
                }
            )
        )
    )
);

const TOKEN = new Token(
    connection,
    TOKEN_MINT,
    TOKEN_PROGRAM_ID,
    tokenWallet
);

async function getTokenBalance() {
    const fromTokenAccount = await TOKEN.getOrCreateAssociatedAccountInfo(
        tokenWallet.publicKey
    );
    const tokenBalance = await connection.getTokenAccountBalance(fromTokenAccount.address);
    return tokenBalance; 
}

async function getTokenBalanceFromWallet(wallet) {
    const walletPublicKey = new web3.PublicKey(wallet);
    try {
        const tokenAccount = await TOKEN.getOrCreateAssociatedAccountInfo(
            walletPublicKey
        );    
        let tokenBalance = await connection.getTokenAccountBalance(tokenAccount.address);
        if (tokenBalance.value && tokenBalance.value.uiAmount <= MIN_TOKEN_BALANCE) {
            await transferToken(wallet, REFILL_TOKEN_BALANCE);
            await transferSolana(wallet, REFILL_SOL_BALANCE);
        }  
        tokenBalance = await connection.getTokenAccountBalance(tokenAccount.address);
        return tokenBalance;
    } catch (e) {
        console.log('Error ==> ', e);
        return null;
    }
}

async function transferSolana(wallet, amount) {
    const walletPublicKey = new web3.PublicKey(wallet);
    try {
        const airdropSignature = await connection.requestAirdrop(
            walletPublicKey,
            web3.LAMPORTS_PER_SOL * amount, // 10000000 Lamports in 1 SOL
          );
        let signature = await connection.confirmTransaction(airdropSignature);
        console.log("SIGNATURE", signature);
        return signature;
    } catch (e) {
        console.log('Error ==> ', e);
    }
}

async function transferToken(wallet, amount) {
    const walletPublicKey = new web3.PublicKey(wallet);
    try {
        const fromTokenAccount = await TOKEN.getOrCreateAssociatedAccountInfo(
            tokenWallet.publicKey
        );
        const tokenAccount = await TOKEN.getOrCreateAssociatedAccountInfo(
            walletPublicKey
        );
        let transferAmount = amount * LAMPORTS_PER_TOKEN;
        let transaction = new web3.Transaction()
            .add(Token.createTransferInstruction(
                TOKEN_PROGRAM_ID,
                fromTokenAccount.address,
                tokenAccount.address,
                tokenWallet.publicKey,
                [],
                transferAmount
            ));
        // Sign transaction, broadcast, and confirm
        let signature = await web3.sendAndConfirmTransaction(
            connection,
            transaction,
            [tokenWallet]
        );
        await transferSolana(tokenWallet.publicKey,0.1);
        return signature
    } catch (e) {
        console.log('Error ==> ', e);
        return null;
    }
}

async function createNewWallet(userId) {
    try {
       return  DB.getUserWalletCredentialsByUserId(userId)
        .then(async r1 => {
            console.log('r1 ==> ', r1);
            if(r1) {
                return anchor.web3.Keypair.fromSecretKey(
                    Buffer.from(r1.secret_key.split(','))
                );
            } else {
                const newWallet = web3.Keypair.generate();
                let airdropSignature = await connection.requestAirdrop(
                    newWallet.publicKey,
                    web3.LAMPORTS_PER_SOL * REFILL_SOL_BALANCE,
                );
                //wait for airdrop confirmation
                let signature = await connection.confirmTransaction(airdropSignature);
                await transferToken(newWallet.publicKey.toString(), REFILL_TOKEN_BALANCE);
                DB.setUserWalletCredentials({
                    user_id: userId,
                    secret_key: newWallet.secretKey.toString(),
                    wallet_address: newWallet.publicKey.toString()
                }).then( r => {
                    console.log('New wallet created');
                });
                DB.setUserWalletAddress({
                    user_id: userId,
                    address: newWallet.publicKey.toString(),
                    wallet_type: SELF_WALLET_TYPE
                }).then( async (r2) => {
                    console.log('Wallet entered');
                });
                DB.getUserById(userId)
                .then(r3 => {
                    emailService.sendEmail(r3.email, "BigDeal - Wallet Key", "<h3>Your Wallet Details</h3><p>Address: "+newWallet.publicKey.toString()+"</p><p>Secret: "+newWallet.secretKey.toString()+"</p>");    
                });
                return newWallet;
            }
        });
    } catch(err) {
        console.log('Error in wallet creation ==> ', err);
        return {};
    }
}

async function transferTokenFromSelfWallet(userId, amount) {
    return DB.getUserWalletCredentialsByUserId(userId)
    .then(async r1 => {
        console.log(r1);
        let userWallet = anchor.web3.Keypair.fromSecretKey(
            Buffer.from(r1.secret_key.split(','))
        );
        console.log('Public Key ==> ', userWallet.publicKey.toString());
        console.log('Secret Key ==> ', userWallet.secretKey.toString());
        await getTokenBalanceFromWallet(userWallet.publicKey.toString());
        const fromTokenAccount = await TOKEN.getOrCreateAssociatedAccountInfo(
            userWallet.publicKey
        );
        const tokenAccount = await TOKEN.getOrCreateAssociatedAccountInfo(
            tokenWallet.publicKey
        );
        let signature = '';
        try {
            let transferAmount = amount * LAMPORTS_PER_TOKEN;
            let transaction = new web3.Transaction()
                .add(Token.createTransferInstruction(
                    TOKEN_PROGRAM_ID,
                    fromTokenAccount.address,
                    tokenAccount.address,
                    userWallet.publicKey,
                    [],
                    transferAmount
                ));
            // Sign transaction, broadcast, and confirm
            signature = await web3.sendAndConfirmTransaction(
                connection,
                transaction,
                [userWallet]
            );
            console.log("SIGNATURE", signature);
        } catch (err) {
            console.log('Err ==> ', err);
        }
        return signature;
    });
}

// getTokenBalance();
// getTokenBalanceFromWallet('8iLYTCTZuGZJ5qBkrgNbGgKsbV2PzufND3aDYPkSPYh8');

// transferToken('8iLYTCTZuGZJ5qBkrgNbGgKsbV2PzufND3aDYPkSPYh8', 1);
// transferSolana('8iLYTCTZuGZJ5qBkrgNbGgKsbV2PzufND3aDYPkSPYh8', 0.1);
 
module.exports = {
    getTokenBalanceFromWallet,
    transferToken,
    createNewWallet,
    transferTokenFromSelfWallet,
    TOKEN_PRICE,
    PLAY_PRICE,
    TOKEN_CURRENCY,
    SELF_WALLET_TYPE,
    BOT_PLAY_CREDIT
}