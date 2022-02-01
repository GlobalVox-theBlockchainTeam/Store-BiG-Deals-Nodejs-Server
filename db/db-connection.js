const Mysqli = require('mysqli');
const dotenv = require("dotenv");
dotenv.config();

const conn = new Mysqli({
    host: process.env.DB_HOST, // IP/domain  
    port: parseInt(process.env.DB_PORT), //port, default 3306  
    user: process.env.DB_USER, // username
    passwd: process.env.DB_PASS, // password
    db: process.env.DB_NAME // the default database name  【optional】
  });
const db = conn.emit();

const USER_WALLET_ADDRESS_TABLE = 'user_wallet_address';
const USER_WALLET_CREDENTIALS_TABLE = 'user_wallet_credential';
const PLAY_PACKAGES_TABLE = 'play_packages';
const PLAY_PURCHASE_HISTORY_TABLE = 'play_purchase_history';
const PLAY_TX_HISTORY_TABLE = 'play_tx_history';
const BID_HISTORY_TABLE = 'product_bid_history';
const PRODUCT_AUCTION_TABLE = 'product_auction';
const BOT_USERS_TABLE = 'bot_users';
const USERS_TABLE = 'customer_entity';

function getUserById(userId) {
    return db.table(USERS_TABLE)
    .filter({ entity_id: userId })
    .get();
  }

function setProductAuction(data) {
    return db.table(PRODUCT_AUCTION_TABLE)
    .insert(data);
  }
  
  function setUserWalletCredentials(credentials) {
    return db.table(USER_WALLET_CREDENTIALS_TABLE)
      .insert(credentials);
  }
  
  function setUserWalletAddress(addressData) {
    return db.table(USER_WALLET_ADDRESS_TABLE)
        .insert(addressData);
  }
  
  function disconnectUserWallets(userId) {
    return db.table(USER_WALLET_ADDRESS_TABLE)
        .filter({user_id: userId})
        .update({wallet_status: 0});
  }
  
  function getUserWalletAddressByUserId(user_id) {
    return db.table(USER_WALLET_ADDRESS_TABLE)
    .filter({user_id: user_id, wallet_status: 1})
    .getAll();
  }
  
  function getUserWalletCredentialsByUserId(user_id) {
    return db.table(USER_WALLET_CREDENTIALS_TABLE)
    .filter({user_id: user_id})
    .get();
  }
  
  function getPlayPackages() {
    return db.table(PLAY_PACKAGES_TABLE)
    .getAll();
  }
  
  function getPlayPackageById(packageId) {
    return db.table(PLAY_PACKAGES_TABLE)
    .filter({ id: packageId })
    .get();
  }
  
  function setUserPlayTransactionHistory(userId, play_token) {
    return db.table(PLAY_TX_HISTORY_TABLE)
    .insert({
      user_id: userId,
      play_token: play_token
    });
  }
  
  function creditUserPlay(userId, data) {
    return db.table(PLAY_TX_HISTORY_TABLE)
    .insert({
      user_id: userId,
      play_token: data.play_token,
      big_token: data.big_token,
      signature: data.signature,
      wallet_type: data.wallet_type,
      wallet_address: data.wallet_address
    });
  }
  
  function setProductBidHistory(data) {
    return db.table(BID_HISTORY_TABLE)
    .insert(data);
  }
  
  function setUserPlayPurchaseHistory(purchaseData) {
    return db.table(PLAY_PURCHASE_HISTORY_TABLE)
    .insert(purchaseData);
  }
  
  function getUserPlayBalance(userId) {
    return db.query(`SELECT SUM(play_token) AS total_play FROM ${PLAY_TX_HISTORY_TABLE} WHERE user_id=${userId}`);
  }

  function insertBot(bot) {
    return db.table(BOT_USERS_TABLE)
    .insert({
        fname: bot.customer.firstname,
        lname: bot.customer.lastname,
        email: bot.customer.email,
        password: bot.password
    });
  }

  function getNotCreatedBot() {
    return db.table(BOT_USERS_TABLE)
    .filter({ user_id: 0 })
    .limit(500)
    .getAll();
  }

  function getBots() {
    return db.query(`SELECT * FROM ${BOT_USERS_TABLE} WHERE user_id!=0`);
  }

  async function getRandomBot() {
    return await getBots().then(async bots => {
      // console.log('bots ==> ', bots.length);
      let randomBotId = getRandomInt(1, bots.length);
      return bots[randomBotId];
    });
    // getRandomInt(1, 1206);
  }

  function updateBot(email, data) {
    return db.table(BOT_USERS_TABLE)
    .filter({ email: email })
    .update(data);
  }

  function getRandomInt(min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min) + min); //The maximum is exclusive and the minimum is inclusive
  }

  module.exports = {
    setProductAuction,   
    setUserWalletAddress,
    disconnectUserWallets,
    getUserWalletAddressByUserId,
    getPlayPackages,
    setUserPlayTransactionHistory,
    setUserWalletCredentials,
    getUserWalletCredentialsByUserId,
    creditUserPlay,
    setProductBidHistory,
    getUserPlayBalance,
    insertBot,
    getNotCreatedBot,
    updateBot,
    getUserById,
    getBots,
    getRandomBot,
    getRandomInt
  }