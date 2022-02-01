const axios = require('axios');
const moment = require('moment-timezone');

const PRODUCT_SKUS = ['product-1'];
const apiServerURL = 'https://mage2-api.thebigdeal.store/rest/V1';
const USER_TIMEZONE = 'Asia/Kolkata';
const PRODUCT_UPDATE_API = '/products/:sku';
const CUSTOMER_CREATE_API = '/customers';
const AUCTION_DIFF_MINUTE = 1;
const MAGE2_TOKEN = {
    consumer_key: "4bmoxco7lc6g33158ewrqbv9q3ec5xg2",
    consumer_secret: "axf3ul0rhat33t94mo6gws2gmug7h8pz",
    access_token: "p77ncojrsbkq1gdx0axuytocd4qdlgr0",
    access_token_secret: "ktth7c4pn4m7do60qa1fpo8aoz00g14r"
}

function updateProductAuctionTimings() {
    let productSKU = PRODUCT_SKUS[0];
    return axios.put(apiServerURL + PRODUCT_UPDATE_API.replace(':sku', productSKU), 
        {
            "product": {
                "custom_attributes": [
                    {
                    "attribute_code": "auction_date_time",
                    "value": moment.tz(USER_TIMEZONE).add(AUCTION_DIFF_MINUTE, 'minutes').format('MM/DD/YYYY hh:mm A')
                    }
                ]
            }
        },
        {
            headers: {
                Authorization: 'Bearer ' + MAGE2_TOKEN.access_token
            }
        });
}

function createUser(user) {
    return axios.post(apiServerURL + CUSTOMER_CREATE_API, user);
}

// updateProductAuctionTimings().then(r => {
//     console.log(r.data);
// });
module.exports = {
    updateProductAuctionTimings,
    createUser
};

