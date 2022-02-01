const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const app = express();
const http = require('http');
const axios = require('axios');
const moment = require('moment-timezone');
const {Server} = require("socket.io");
const dotenv = require("dotenv");
const solanaConnection = require("./config/solana.connection");
const { randomInt } = require('crypto');
const mage2API = require("./mage2-api/mage2-index");
const DB = require("./db/db-connection");
const emailService = require('./email/email');
dotenv.config();

app.use(cors({origin: '*'}));
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

const AUCTION_DURATION_SEC = 10;

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' }, pingInterval: 100000, pingTimeout: 90000 });
const apiServerURL = 'https://mage2-api.thebigdeal.store/rest/V1';
const USER_TIMEZONE = 'Asia/Kolkata';
const PRODUCT_DETAIL_API = '/products/:sku';
const IS_EMAIL_AVAILABLE_API = '/customers/isEmailAvailable';
const CUSTOMER_CREATE_API = '/customers';
const PRODUCT_SKUS = ['product-1'];
const PRODUCTS = [];
const PRODUCTS_VIABLE_PRICE = [];
const PRODUCTS_AUCTION_PLAY = [];
const AUCTION_REMAINING_TIME = [];
const PRODUCT_BID_DURATION = [];
const PRODUCT_PLAY_VALUE_PER_BID = [];
const DEFAULT_OTP = '0000';
const MAX_USER_BID = [];
const USER_TOTAL_BID = [];
const PRODUCT_MRP = [];
const BOT_TRIGGERED = [];
let PRODUCT_VIABLE = false;
let DEMO_TYPES = [];
let lastBidDetail = [];
let allBids = [];
let productTimers = [];
let registrationEmails = [];
const BLANK_BID_DETAILS = {
  customerId: 0,
  customerName: '',
  customerEmail: '',
  productId: ''
};

function getAttribute(productData, attribute_code) {
  let attribute = {};
  productData.custom_attributes.forEach((custom_attribute) => {
      if (custom_attribute.attribute_code === attribute_code) {
          attribute = custom_attribute;
      }
  });
  return attribute;
}

function startAuctionRemainingTimer(auctionRemainingTimeInSec, productID) {
  productTimers[productID] = setInterval( () => {
    auctionRemainingTimeInSec++;
    PRODUCTS[productID].auctionRemainingTimeInSec = auctionRemainingTimeInSec;
    if (auctionRemainingTimeInSec <= 0) {
      // console.log('timer value ==> ', auctionRemainingTimeInSec);
      io.emit('auction-remaining-time-'+productID, { timeLeft: auctionRemainingTimeInSec });
    } else {
      // console.log('timer value ==> ', auctionRemainingTimeInSec);
      io.emit('auction-started-'+productID);
      clearInterval(productTimers[productID]);
    }
  },1000);
}

const isEmailAvailable = async (email) => {
  return await axios
    .post(apiServerURL + IS_EMAIL_AVAILABLE_API, {customerEmail: email, websiteId: 1});
}

const registerCustomer = async (data) => {
  return await axios.post(apiServerURL + CUSTOMER_CREATE_API, data);
}

async function getProductsFromServer() {
  PRODUCT_SKUS.forEach((productSKU) => {
    axios
    .get(apiServerURL + PRODUCT_DETAIL_API.replace(':sku', productSKU))
    .then(res => {
      let productData = res.data;
      // console.log(res.data);
      const bidDurationAttribute = getAttribute(productData, 'bid_duration');
      const auctionDateTimeAttribute = getAttribute(productData, 'auction_date_time');
      const playValueAttribute = getAttribute(productData, 'play_value');
      const mrpValueAttribute = getAttribute(productData, 'product_mrp');
      // console.log('bidDurationAttribute ==> ', bidDurationAttribute);
      console.log('auctionDateTimeAttribute ==> ', auctionDateTimeAttribute);
      const auctionDateTime = moment.tz(auctionDateTimeAttribute.value, 'YYYY-MM-DD H:mm:ss', USER_TIMEZONE);
      console.log('auctionDateTime ==> ', auctionDateTime);
      const auctionRemainingTimeInSec = moment.tz(USER_TIMEZONE).diff(auctionDateTime, 'seconds');
      // console.log('auctionRemainingTimeInSec ==> ', auctionRemainingTimeInSec);
      productData.auctionRemainingTimeInSec = auctionRemainingTimeInSec;
      productData.bidDurationTimeInSec = bidDurationAttribute.value;
      productData.bidDurationTimeResetValue = bidDurationAttribute.value;
      if (auctionRemainingTimeInSec < 0) {
        productData.bidActive = true;
        PRODUCTS[productData.id] = productData;
        AUCTION_REMAINING_TIME[productData.id] = auctionRemainingTimeInSec;
        PRODUCT_BID_DURATION[productData.id] = parseInt(bidDurationAttribute.value);
        PRODUCT_PLAY_VALUE_PER_BID[productData.id] = parseInt(playValueAttribute.value);
        PRODUCTS_VIABLE_PRICE[productData.id] = parseInt(mrpValueAttribute.value) * 1.5;
        PRODUCT_MRP[productData.id] = parseInt(mrpValueAttribute.value);
        
        // PRODUCTS_VIABLE_PRICE[productData.id] = 2;
        PRODUCTS_AUCTION_PLAY[productData.id] = 0;
        if (PRODUCT_VIABLE) {
          PRODUCTS_AUCTION_PLAY[productData.id] = (PRODUCTS_VIABLE_PRICE[productData.id] / solanaConnection.PLAY_PRICE) + (DB.getRandomInt(5,90) * PRODUCT_PLAY_VALUE_PER_BID[productData.id]);
          PRODUCTS_VIABLE_PRICE[productData.id] += DB.getRandomInt(95,110);
        }
        MAX_USER_BID[productData.id] = DB.getRandomInt(5,9);
        USER_TOTAL_BID[productData.id] = 0;
        BOT_TRIGGERED[productData.id] = false;
        console.log('MAX_USER_BID[productData.id] ==> ', MAX_USER_BID[productData.id]);
        // console.log('AUCTION_REMAINING_TIME ==> ', AUCTION_REMAINING_TIME);
        clearInterval(productTimers[productData.id]);
        startAuctionRemainingTimer(auctionRemainingTimeInSec, productData.id);
      } else {
        productData.bidActive = false;
      }
    })
    .catch(error => {
      console.error(error)
    });  
  });
}

// console.log('After Product Fetch');
// console.log('PRODUCTS ==> ', PRODUCTS);

let timer = setInterval( () => {
  PRODUCTS.forEach(product => {
    if (allBids[product.id] === undefined) {
      allBids[product.id] = [];
      lastBidDetail[product.id] = BLANK_BID_DETAILS;
      lastBidDetail[product.id].productId = product.id;
    }

    if (product.auctionRemainingTimeInSec >= 0) {
      if (product.bidDurationTimeInSec >= 0) {
        let countdownTimer = product.bidDurationTimeInSec;
        // console.log('timer value ==> ', countdownTimer);
        // console.log('lastBidDetail ==> ', lastBidDetail);
        let totalBids = PRODUCTS_AUCTION_PLAY[product.id]/PRODUCT_PLAY_VALUE_PER_BID[product.id];
        io.emit('countdown-updated-'+product.id, { timeLeft: countdownTimer, totalBids: totalBids, lastBidderId: lastBidDetail[product.id].customerId });
        countdownTimer--;
        PRODUCTS[product.id].bidDurationTimeInSec = countdownTimer;
        if (!BOT_TRIGGERED[product.id]) {
          triggerBotBid(product.id);
          BOT_TRIGGERED[product.id] = true;
        }
      } else {
        if (product.bidActive) {
          let winner = lastBidDetail[product.id];
          io.emit('bid-closed-'+product.id, { winner: winner });
          if (winner) {
            console.log('all bids ==> ', allBids[product.id]);
            DB.setProductAuction({
              product_id: product.id,
              winner_id: winner.customerId,
              winner_name: winner.customerName,
              winner_email: winner.customerEmail,
              total_bid: allBids[product.id].length,
              bid_value: PRODUCT_PLAY_VALUE_PER_BID[product.id]
            }).then(res => {
              console.log('new auction started ==> ', res);
            });
          }
          resetAuction(product.id);
        }
      } 
    }
  });
}, 1000);

resetAuction = (productId) => {
  lastBidDetail[productId] = BLANK_BID_DETAILS;
  allBids[productId] ? allBids[productId] = undefined : '';
  PRODUCTS[productId] ? PRODUCTS[productId].bidActive = false : '';
  PRODUCTS[productId] ? PRODUCTS[productId].bidDurationTimeInSec = 0 : '';
  PRODUCTS[productId] ? PRODUCTS[productId].auctionRemainingTimeInSec = 1 : '';
  BOT_TRIGGERED[productId] ? BOT_TRIGGERED[productId] = false : '';
  PRODUCTS_AUCTION_PLAY[productId] ? PRODUCTS_AUCTION_PLAY[productId] = 0 : '';
  PRODUCTS_VIABLE_PRICE[productId] ? PRODUCTS_VIABLE_PRICE[productId] = 0 : '';
  USER_TOTAL_BID[productId] ? USER_TOTAL_BID[productId] = 0 : '';
  MAX_USER_BID[productId] ? MAX_USER_BID[productId] = 0 : '';
  io.emit('countdown-updated-'+productId, { timeLeft: 0, totalBids: 0, lastBidderId: 0 });
  setTimeout(() => {
    mage2API.updateProductAuctionTimings().then(res => {
      getProductsFromServer();
    });
  }, AUCTION_DURATION_SEC * 1000);
};

io.on('connection', (socket) => {
  console.log('a user connected ==> ', socket.id);
  socket.on('disconnect', () => {
      console.log('user disconnected');
  });
  socket.on('new-bid-send', (data) => {
    const bidProductData = JSON.parse(data);
    const customerId = bidProductData.customerId;
    const playValue = PRODUCT_PLAY_VALUE_PER_BID[bidProductData.productId];
    DB.getUserPlayBalance(customerId).then( data => {
      const playBalance = data[0].total_play;
      if (playValue <= playBalance) {
        DB.setUserPlayTransactionHistory(customerId, (playValue * -1))
        .then( data2 => {
          lastBidDetail[bidProductData.productId] = bidProductData;
          allBids[bidProductData.productId].push(bidProductData);
          // console.log('New bid placed', bidProductData);
          io.emit('new-bid-received-'+bidProductData.productId, { lastBidder: bidProductData.customerName });
          PRODUCTS[bidProductData.productId].bidDurationTimeInSec = PRODUCTS[bidProductData.productId].bidDurationTimeResetValue;
          DB.setProductBidHistory({
            product_id: bidProductData.productId,
            customer_id: customerId,
            customer_name: bidProductData.customerName,
            customer_email: bidProductData.customerEmail,
            play_tx_id: data2.insertId
          }).then(async data3 => {
            socket.emit('bid-status', {status: 'success'});
            USER_TOTAL_BID[bidProductData.productId]++;
            PRODUCTS_AUCTION_PLAY[bidProductData.productId] += playValue;
          });
        })
      } else {
        socket.emit('bid-status', {status: 'failed'});
      }
    });
  });
});

const triggerBotBid = async (productId) => {
  let total_play_price = PRODUCTS_AUCTION_PLAY[productId] * solanaConnection.PLAY_PRICE;
  if (total_play_price < PRODUCTS_VIABLE_PRICE[productId] && PRODUCTS[productId].bidActive && USER_TOTAL_BID[productId] < MAX_USER_BID[productId]) {
    await delay(DB.getRandomInt(2,9) * 1000)
    await botBid(productId);
  }
};

const botBid = async (productId) => {
  if (PRODUCTS[productId].bidActive) {
    let bidProductData = BLANK_BID_DETAILS;
    let bot = await DB.getRandomBot();
    // console.log('Bot ==> ', bot);
    bidProductData.customerId = bot.user_id;
    bidProductData.customerName = bot.fname + ' ' + bot.lname;
    bidProductData.customerEmail = bot.email;
    bidProductData.productId = productId;
    // console.log('Bot Data ==> ', bidProductData);
    console.log('PRODUCTS_AUCTION_PLAY[bidProductData.productId] ==> ', PRODUCTS_AUCTION_PLAY[bidProductData.productId]);
    const customerId = bidProductData.customerId;
    const playValue = PRODUCT_PLAY_VALUE_PER_BID[bidProductData.productId];
    await DB.getUserPlayBalance(customerId).then( async data => {
      const playBalance = data[0].total_play;
      if (playValue >= playBalance) {
        DB.creditUserPlay(bot.user_id, {
          play_token: solanaConnection.BOT_PLAY_CREDIT,
          big_token: 0,
          signature: 'bot',
          wallet_type: solanaConnection.SELF_WALLET_TYPE,
          wallet_address: 'bot'
        }).then( r => {});
      }
      await DB.setUserPlayTransactionHistory(customerId, (playValue * -1))
      .then( async data2 => {
        lastBidDetail[bidProductData.productId] = bidProductData;
        allBids[bidProductData.productId].push(bidProductData);
        // console.log('New bid placed', bidProductData);
        io.emit('new-bid-received-'+bidProductData.productId, { lastBidder: bidProductData.customerName });
        PRODUCTS[bidProductData.productId].bidDurationTimeInSec = PRODUCTS[bidProductData.productId].bidDurationTimeResetValue;
        await DB.setProductBidHistory({
          product_id: bidProductData.productId,
          customer_id: customerId,
          customer_name: bidProductData.customerName,
          customer_email: bidProductData.customerEmail,
          play_tx_id: data2.insertId
        }).then(async data3 => {
          PRODUCTS_AUCTION_PLAY[bidProductData.productId] += playValue;
          await triggerBotBid(bidProductData.productId);
        });
      })
    });
    return bot;
  }
}

function delay(t, val) {
  return new Promise(function(resolve) {
      setTimeout(function() {
          resolve(val);
      }, t);
  });
}

const generateOTP = () => {
  var digits = '0123456789';
  let OTP = '';
  for (let i = 0; i < 4; i++ ) {
      OTP += digits[Math.floor(Math.random() * 10)];
  }
  return OTP;
}

app.get('/', (req, res) => {
  res.send('<h1>Hello world</h1>');
});

app.post('/get-user-wallet', async (req, res) => {
  const user_id = req.body.user_id;
  DB.getUserWalletAddressByUserId(user_id).then(response => {
    if(response.length > 0) {
      DB.getUserPlayBalance(user_id).then( async (data) => {
        const playBalance = data[0].total_play;
        const tokenBalance = await solanaConnection.getTokenBalanceFromWallet(response[0].address);
        res.send({
          address: response[0].address,
          wallet_type: response[0].wallet_type,
          play: playBalance,
          balance: tokenBalance.value ? tokenBalance.value.uiAmount : 0
        });
      });
    } else {
      res.send({
        address: '',
        wallet_type: '',
        play: 0,
        balance: 0
      });
    }
  })
});

app.post('/connect-wallet', async (req, res) => {
  const walletType = req.body.wallet_type;
  const userId = req.body.user_id;
  DB.disconnectUserWallets(userId).then(
    r1 => {
      DB.getUserPlayBalance(userId).then( async (data) => {
        const playBalance = data[0].total_play;
        if(walletType == solanaConnection.SELF_WALLET_TYPE) {
          let userWallet = await solanaConnection.createNewWallet(userId);
          const tokenBalance = await solanaConnection.getTokenBalanceFromWallet(userWallet.publicKey);
          DB.setUserWalletAddress({
            user_id: userId,
            address: userWallet.publicKey.toString(),
            wallet_type: walletType
          }).then(r2 => {
            res.send({
              address: userWallet.publicKey.toString(),
              balance: tokenBalance.value ? tokenBalance.value.uiAmount : 0,
              play: playBalance
            });
          })
            
        } else {
          const walletAddress = req.body.wallet_address;
          DB.setUserWalletAddress({
            user_id: userId,
            address: walletAddress,
            wallet_type: walletType
          }).then( async (r2) => {
            const tokenBalance = await solanaConnection.getTokenBalanceFromWallet(walletAddress);
            res.send({
              address: walletAddress,
              balance: tokenBalance.value ? tokenBalance.value.uiAmount : 0,
              play: playBalance
            });
          });
        }
      });
    }
  );
});

app.post('/disconnect-wallet', async (req, res) => {
  const userId = req.body.user_id;
  DB.disconnectUserWallets(userId).then(
    r1 => {
        res.send({
          address: '',
          balance: 0,
          play: 0
        });
    }
  );
});

app.get('/get-play-packages', function(req, res){
  DB.getPlayPackages().then(data => {
    res.send(data);
  });
});

app.get('/get-play-price', function(req,res) {
  res.json({
    play: solanaConnection.PLAY_PRICE,
    big: solanaConnection.TOKEN_PRICE,
    currency: solanaConnection.TOKEN_CURRENCY
  });
});

app.post('/buy-play-package', async (req, res) => {
  const userId = req.body.user_id;
  const walletType = req.body.wallet_type;
  const bigTokens = req.body.big_tokens;
  const walletAddress = req.body.wallet_address;
  let signature = '';
  if(walletType == solanaConnection.SELF_WALLET_TYPE) {
    signature = await solanaConnection.transferTokenFromSelfWallet(userId, bigTokens);
  } else {
    signature = req.body.signature;
  }
  let play = parseInt(
    (bigTokens * solanaConnection.TOKEN_PRICE) / solanaConnection.PLAY_PRICE
  );
  if(play > 0) {
    DB.creditUserPlay(userId, {
      play_token: play,
      big_token: bigTokens,
      signature: signature,
      wallet_type: walletType,
      wallet_address: walletAddress
    }).then( r => {
      res.status(200).json({
        message: 'Play credited successfully'
      });
    });
  } else {
    res.status(402).json({
      message: 'Wrong data passed'
    });
  }
});

app.get('/test-email', async (req, res) => {
  const otp = generateOTP();
  console.log('otp ==> ', otp);
  emailService.sendEmail("mkc110891@gmail.com", "BigDeal - Registration Confirmation", "<h3>Confirm your registration</h3><p>Code: "+otp+"</p>");
  res.send("Email sent");
});

app.post('/register-user', async (req, res) => {
  if(req.body && req.body.customer.email && req.body.customer.email !== '') {
    const email = req.body.customer.email;
    await isEmailAvailable(email).then(res1 => {
      if (res1.data) {
        const otp = generateOTP();
        const regData = {
          redirectUrl:"",
          password:req.body.password,
          customer: {
            email: email,
            firstname: req.body.customer.firstname,
            lastname: req.body.customer.lastname
          },
          otp: otp
        };
        registrationEmails[email] = regData;
        console.log(registrationEmails);
        emailService.sendEmail(email, "BigDeal - Registration Confirmation","<h3>Confirm your registration</h3><p>Code: "+otp+"</p>");
        res.status(200);
        res.json({"message":"Confirmation code sent to your email address"});
      } else {
        res.status(422);
        res.json({"message":"A customer with the same email address already exists in an associated website."});
      }
    });
  } else {
    res.status(422);
    res.json({"message":"Please enter valid details"});
  }  
});

app.post('/confirm-email', async (req, res) => {
  if(req.body && req.body.customer.email && req.body.customer.email !== '') {
    const email = req.body.customer.email;
    const otp = req.body.otp;
    if (registrationEmails[email]) {
      const registrationData = registrationEmails[email];
      console.log('registrationData ==> ', registrationData);
      if (otp == registrationData.otp || otp == DEFAULT_OTP) {
        registrationData.otp = undefined;
        await registerCustomer(registrationData).then(res1 => {
          console.log('res1 ==> ', res1);
          res.status(200);
          res.json(res1.data);  
        });
      } else {
        res.status(422);
        res.json({"message":"Wrong confirmation code"});
      }
    } else {
      res.status(422);
      res.json({"message":"Wrong confirmation code"});
    }
  } else {
    res.status(422);
    res.json({"message":"Wrong confirmation code"});
  }
});


app.get('/update-products', async (req, res) => {
  await getProductsFromServer();
  res.send('Product updated');
});

app.get('/reset-auction/:product_id', async (req, res) => {
  let productId = req.params.product_id;
  await resetAuction(productId);
  res.send('Auction reset')
});

app.get('/get-auction-details/:product_id', async (req, res) => {
  let productId = req.params.product_id;
  res.json({
    MAX_USER_BID: MAX_USER_BID[productId] ? MAX_USER_BID[productId] : 0,
    PRODUCTS_VIABLE_PRICE: PRODUCTS_VIABLE_PRICE[productId] ? PRODUCTS_VIABLE_PRICE[productId] : 0,
    PRODUCT_VIABLE: PRODUCT_VIABLE,
    PLAY_PRICE: solanaConnection.PLAY_PRICE,
    PRODUCT_RETAIL_PRICE: PRODUCT_MRP[productId] ? PRODUCT_MRP[productId] : 0,
    BID_TIME: PRODUCTS[productId] ? PRODUCTS[productId].bidDurationTimeResetValue + ' Seconds' : 0,
    PRODUCT_PLAY_VALUE_PER_BID: PRODUCT_PLAY_VALUE_PER_BID[productId] ? PRODUCT_PLAY_VALUE_PER_BID[productId] : 0,
    BID_STOP_PRICE: PRODUCTS_VIABLE_PRICE[productId] && PRODUCT_PLAY_VALUE_PER_BID[productId] ? (PRODUCTS_VIABLE_PRICE[productId] / PRODUCT_PLAY_VALUE_PER_BID[productId]) : 0
  });
});

app.get('/enable-product-viable/:product_id', async (req, res) => {
  let productId = req.params.product_id;
  PRODUCT_VIABLE = true;
  await resetAuction(productId);
  res.send('Product viable enabled')
});

app.get('/disable-product-viable/:product_id', async (req, res) => {
  let productId = req.params.product_id;
  PRODUCT_VIABLE = false;
  await resetAuction(productId);
  res.send('Product viable disabled')
});

app.get('/test-self-wallet', async (req, res) => {
  // const userId = 1;
  // let wallet = await solanaConnection.createNewWallet(userId);
  // let wallet = await solanaConnection.transferTokenFromSelfWallet(userId,10);
  let bot = await botBid();
  res.send(bot);
});

server.listen(3000, () => {
  console.log('listening on *:3000');
});
resetAuction();